import { closestFiber, fiberFromNode } from "../lib/fiber"

function elementsAtPoint(x: number, y: number): Element[] {
  const fromStack = document.elementsFromPoint(x, y)
  if (fromStack.length > 0) return fromStack.filter((node): node is Element => node instanceof Element)
  const single = document.elementFromPoint(x, y)
  return single instanceof Element ? [single] : []
}

function pointInRect(x: number, y: number, rect: DOMRect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
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

function resolveHost(element: Element): Element | null {
  if (fiberFromNode(element)) return element
  return closestFiber(element)?.element ?? null
}

/**
 * Picks the DOM node the picker should inspect. With a pointer position, prefers
 * the smallest React host whose box contains the point (disambiguates overlapping
 * controls, e.g. a wide native date input vs a chevron button). Without a point,
 * uses the first resolvable host in candidate order.
 */
export function inspectableElement(
  candidates: Iterable<Element>,
  options?: { point?: { x: number; y: number }; blocked?: (element: Element) => boolean },
): Element | null {
  const list = collectCandidates(candidates, options?.blocked)
  const point = options?.point

  if (point) {
    let best: { element: Element; area: number } | null = null
    for (const raw of list) {
      const host = resolveHost(raw)
      if (!host) continue
      const rect = host.getBoundingClientRect()
      if (!pointInRect(point.x, point.y, rect)) continue
      const area = rect.width * rect.height
      if (!best || area < best.area) best = { element: host, area }
    }
    if (best) return best.element
  }

  for (const raw of list) {
    const host = resolveHost(raw)
    if (host) return host
  }
  return null
}

export function pickTargetAtPoint(
  x: number,
  y: number,
  blocked?: (element: Element) => boolean,
): Element | null {
  return inspectableElement(elementsAtPoint(x, y), { point: { x, y }, blocked })
}

export function pickTargetFromEvent(
  event: Event,
  blocked?: (element: Element) => boolean,
): Element | null {
  const candidates: Element[] = []
  const point =
    event instanceof MouseEvent ? { x: event.clientX, y: event.clientY } : undefined
  if (point) candidates.push(...elementsAtPoint(point.x, point.y))
  if (event.target instanceof Element) candidates.push(event.target)
  for (const node of event.composedPath()) {
    if (node instanceof Element) candidates.push(node)
  }
  return inspectableElement(candidates, { point, blocked })
}
