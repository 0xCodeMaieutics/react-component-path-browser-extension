import { closestFiber, fiberFromNode } from "../lib/fiber"

function isFormControl(element: Element): boolean {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  )
}

function elementsAtPoint(x: number, y: number): Element[] {
  const fromStack = document.elementsFromPoint(x, y)
  if (fromStack.length > 0) return fromStack.filter((node): node is Element => node instanceof Element)
  const single = document.elementFromPoint(x, y)
  return single instanceof Element ? [single] : []
}

/** Unique elements in encounter order. */
function collectCandidates(candidates: Iterable<Element>, blocked?: (element: Element) => boolean): Element[] {
  const list: Element[] = []
  const seen = new Set<Element>()
  for (const raw of candidates) {
    if (seen.has(raw) || blocked?.(raw)) continue
    seen.add(raw)
    list.push(raw)
  }
  return list
}

/**
 * Picks the DOM node the picker should inspect. Prefer the topmost form control
 * with a React fiber, then any topmost fiber host, then closestFiber fallbacks
 * (covers shadow-internal hit targets on native inputs).
 */
export function inspectableElement(
  candidates: Iterable<Element>,
  blocked?: (element: Element) => boolean,
): Element | null {
  const list = collectCandidates(candidates, blocked)

  for (const element of list) {
    if (isFormControl(element) && fiberFromNode(element)) return element
  }
  for (const element of list) {
    if (fiberFromNode(element)) return element
  }
  for (const element of list) {
    const found = closestFiber(element)
    if (found) return found.element
  }
  return null
}

export function pickTargetAtPoint(
  x: number,
  y: number,
  blocked?: (element: Element) => boolean,
): Element | null {
  return inspectableElement(elementsAtPoint(x, y), blocked)
}

export function pickTargetFromEvent(
  event: Event,
  blocked?: (element: Element) => boolean,
): Element | null {
  const candidates: Element[] = []
  if (event instanceof MouseEvent) {
    candidates.push(...elementsAtPoint(event.clientX, event.clientY))
  }
  if (event.target instanceof Element) candidates.push(event.target)
  for (const node of event.composedPath()) {
    if (node instanceof Element) candidates.push(node)
  }
  return inspectableElement(candidates, blocked)
}
