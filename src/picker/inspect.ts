import { hostUsageHint } from "../lib/element-usage"
import { closestFiber, fiberFromNode, hostElements, isDevelopmentFiber, outputRoot, ownerChain, type Fiber } from "../lib/fiber"
import type { ComponentResolver, ResolvedComponent, SourceLocation } from "../lib/resolve"

export interface Inspection {
  element: Element
  host: Fiber
  /** Owner chain, nearest first, with source locations once resolved. */
  components: Promise<ResolvedComponent[]>
  /** Usage site of the inspected DOM node when it is a native host element. */
  hostUsage: Promise<SourceLocation | null>
}

export type ReactBuild = "development" | "production" | "none"

const RESOLVE_TIMEOUT_MS = 4000

export function inspectElement(element: Element, resolver: ComponentResolver): Inspection | null {
  const found = closestFiber(element)
  if (!found) return null
  const chain = ownerChain(found.fiber)
  const fallback = new Promise<ResolvedComponent[]>((resolve) =>
    setTimeout(() => resolve(chain.map((entry) => ({ entry, usage: null, isLibrary: false }))), RESOLVE_TIMEOUT_MS),
  )
  const hostHint = hostUsageHint(found.fiber)
  return {
    element: found.element,
    host: found.fiber,
    components: Promise.race([resolver.resolveChain(chain), fallback]),
    hostUsage: hostHint ? resolver.resolveHint(hostHint) : Promise.resolve(null),
  }
}

/** Components the picker walks: the app's own, or everything if none are. */
export function selectableComponents(components: ResolvedComponent[]): ResolvedComponent[] {
  const own = components.filter((component) => !component.isLibrary)
  return own.length > 0 ? own : components
}

/** Bounding box of everything a component rendered. */
export function componentRect(component: ResolvedComponent, inspection: Inspection): DOMRect {
  if (typeof inspection.host.type === "string") {
    const tight = inspection.element.getBoundingClientRect()
    if (tight.width > 0 || tight.height > 0) return tight
  }
  const root = outputRoot(component.entry.owner, inspection.host)
  const rects = (root ? hostElements(root) : [])
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 0 || rect.height > 0)
  if (rects.length === 0) return inspection.element.getBoundingClientRect()

  const left = Math.min(...rects.map((rect) => rect.left))
  const top = Math.min(...rects.map((rect) => rect.top))
  const right = Math.max(...rects.map((rect) => rect.right))
  const bottom = Math.max(...rects.map((rect) => rect.bottom))
  return new DOMRect(left, top, right - left, bottom - top)
}

export function detectReact(root: ParentNode = document): ReactBuild {
  const walker = document.createTreeWalker(root instanceof Document ? root.documentElement : (root as Node), NodeFilter.SHOW_ELEMENT)
  for (let node = walker.currentNode, visited = 0; node && visited < 5000; node = walker.nextNode()!, visited++) {
    const fiber = fiberFromNode(node)
    if (fiber) return isDevelopmentFiber(fiber) ? "development" : "production"
  }
  return "none"
}
