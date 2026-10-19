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
  it("prefers a form control over an ancestor wrapper in the hit stack", () => {
    const wrapper = document.createElement("div")
    const input = document.createElement("input")
    input.type = "date"
    wrapper.append(input)
    document.body.append(wrapper)

    attach(wrapper, fiber(5, "div"))
    attach(input, fiber(5, "input"))

    expect(inspectableElement([wrapper, input])).toBe(input)
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
