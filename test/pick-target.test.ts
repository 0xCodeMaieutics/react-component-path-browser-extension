import { beforeEach, describe, expect, it } from "vitest"
import { type Fiber } from "../src/lib/fiber"
import { inspectableElement } from "../src/picker/pick-target"

function fiber(tag: number, type: unknown): Fiber {
  return { tag, type, return: null, child: null, sibling: null, stateNode: null, _debugOwner: null }
}

function attach(element: Element, node: Fiber): void {
  ;(element as unknown as Record<string, Fiber>)["__reactFiber$abc123"] = node
  node.stateNode = element
}

beforeEach(() => {
  document.body.innerHTML = ""
})

describe("inspectableElement", () => {
  it("prefers the smaller host when overlapping boxes share a point", () => {
    const input = document.createElement("input")
    input.type = "date"
    const button = document.createElement("button")
    attach(input, fiber(5, "input"))
    attach(button, fiber(5, "button"))
    document.body.append(input, button)

    Object.defineProperty(input, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 200, 40),
    })
    Object.defineProperty(button, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 36, 36),
    })

    expect(inspectableElement([input, button], { point: { x: 10, y: 10 } })).toBe(button)
  })

  it("resolves icon children through closestFiber", () => {
    const button = document.createElement("button")
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    button.append(icon)
    document.body.append(button)
    attach(button, fiber(5, "button"))

    expect(inspectableElement([icon], { point: { x: 1, y: 1 } })).toBe(button)
  })

  it("uses closestFiber when the hit target is inside an open shadow root", () => {
    const input = document.createElement("input")
    input.type = "date"
    const shadow = input.attachShadow({ mode: "open" })
    const inner = document.createElement("span")
    shadow.append(inner)
    document.body.append(input)

    attach(input, fiber(5, "input"))

    expect(inspectableElement([inner])).toBe(input)
  })
})
