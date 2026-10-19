import { beforeEach, describe, expect, it } from "vitest"
import { closestFiber, hostElements, outputRoot, ownerChain, typeName, type Fiber, type Owner } from "../src/lib/fiber"
import { copyModeForEvent, formatCopy } from "../src/lib/reference"
import { detectReact } from "../src/picker/inspect"

function fiber(tag: number, type: unknown, owner: Owner | null = null): Fiber {
  return { tag, type, return: null, child: null, sibling: null, stateNode: null, _debugOwner: owner, _debugStack: null }
}

function link(parent: Fiber, ...children: Fiber[]): void {
  parent.child = children[0] ?? null
  children.forEach((child, index) => {
    child.return = parent
    child.sibling = children[index + 1] ?? null
  })
}

function attach(element: Element, node: Fiber): void {
  ;(element as unknown as Record<string, Fiber>)["__reactFiber$abc123"] = node
  node.stateNode = element
}

beforeEach(() => {
  document.body.innerHTML = ""
})

describe("typeName", () => {
  it("unwraps forwardRef and memo wrappers", () => {
    function Card() {}
    expect(typeName(Card)).toBe("Card")
    expect(typeName({ render: Card })).toBe("Card")
    expect(typeName({ type: { render: Card } })).toBe("Card")
    expect(typeName({ displayName: "Primitive.button", render: () => null })).toBe("Primitive.button")
  })
})

describe("ownerChain", () => {
  it("follows owners rather than parents", () => {
    function App() {}
    function Card() {}
    function Counter() {}
    const app = fiber(0, App)
    const card = fiber(0, Card, app)
    const counter = fiber(0, Counter, app)
    const button = fiber(5, "button", counter)
    link(card, counter)
    link(counter, button)
    expect(ownerChain(button).map((entry) => entry.name)).toEqual(["Counter", "App"])
  })
})

describe("closestFiber and hostElements", () => {
  it("finds the nearest rendered element and a component's top-level DOM nodes", () => {
    document.body.innerHTML = `<section><h2>Title</h2><p><span id="leaf">x</span></p></section><aside></aside>`
    function Page() {}
    const page = fiber(0, Page)
    const section = fiber(5, "section", page)
    const h2 = fiber(5, "h2", page)
    const aside = fiber(5, "aside", page)
    attach(document.querySelector("section")!, section)
    attach(document.querySelector("h2")!, h2)
    attach(document.querySelector("aside")!, aside)
    link(page, section, aside)
    link(section, h2)

    const found = closestFiber(document.querySelector("#leaf"))
    expect(found?.element.tagName).toBe("SECTION")
    expect(hostElements(page).map((element) => element.tagName)).toEqual(["SECTION", "ASIDE"])
    expect(outputRoot(page, h2)).toBe(page)
  })

  it("finds a fiber on the shadow host when the pointer hits an internal node", () => {
    const input = document.createElement("input")
    input.type = "date"
    const shadow = input.attachShadow({ mode: "open" })
    const inner = document.createElement("span")
    shadow.append(inner)
    document.body.append(input)

    const hostFiber = fiber(5, "input")
    attach(input, hostFiber)

    expect(closestFiber(inner)?.element).toBe(input)
    expect(closestFiber(inner)?.fiber).toBe(hostFiber)
  })

  it("uses the outermost fiber a Server Component rendered as its output root", () => {
    const server = { name: "Layout", env: "Server", owner: null }
    const root = fiber(3, null)
    const main = fiber(5, "main", server)
    const heading = fiber(5, "h1", server)
    link(root, main)
    link(main, heading)
    expect(outputRoot(server, heading)).toBe(main)
  })
})

describe("detectReact", () => {
  it("distinguishes development, production, and no React", () => {
    document.body.innerHTML = `<div id="root"></div>`
    expect(detectReact()).toBe("none")
    const node = document.querySelector("#root")!
    const production = { tag: 5, type: "div", return: null, child: null, sibling: null, stateNode: node }
    ;(node as unknown as Record<string, unknown>)["__reactFiber$x"] = production
    expect(detectReact()).toBe("production")
    ;(production as Record<string, unknown>)._debugOwner = null
    expect(detectReact()).toBe("development")
  })
})

describe("formatCopy", () => {
  const location = { path: { path: "app/page.tsx", absolute: false }, line: 70, endLine: 80, isLibrary: false }

  it("formats each copy mode", () => {
    expect(formatCopy("reference", "PayButton", location)).toBe("PayButton (app/page.tsx:70-80)")
    expect(formatCopy("path", "PayButton", location)).toBe("app/page.tsx:70-80")
    expect(formatCopy("name", "PayButton", location)).toBe("PayButton")
    expect(formatCopy("path", "PayButton", { ...location, endLine: undefined }, "apps/web/")).toBe(
      "apps/web/app/page.tsx:70",
    )
  })

  it("falls back to the name without a location", () => {
    expect(formatCopy("reference", "PayButton", null)).toBe("PayButton")
    expect(formatCopy("path", "PayButton", null)).toBe("PayButton")
  })

  it("maps click modifiers to modes", () => {
    expect(copyModeForEvent({ shiftKey: false, altKey: false })).toBe("reference")
    expect(copyModeForEvent({ shiftKey: true, altKey: false })).toBe("path")
    expect(copyModeForEvent({ shiftKey: false, altKey: true })).toBe("name")
  })
})
