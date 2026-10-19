/**
 * Minimal structural views of React's development-build internals. Only the
 * fields this extension reads are typed; everything is optional because the
 * shapes differ between React 18 and 19.
 */
export interface DebugSource {
  fileName: string
  lineNumber: number
  columnNumber?: number
}

export interface Fiber {
  tag: number
  type: unknown
  return: Fiber | null
  child: Fiber | null
  sibling: Fiber | null
  stateNode: unknown
  _debugOwner?: Owner | null
  _debugStack?: { stack?: string } | null
  _debugSource?: DebugSource | null
}

/** React 19 Server Component metadata (`ReactComponentInfo`). */
export interface ServerComponentInfo {
  name: string
  env?: string
  owner?: Owner | null
  debugStack?: { stack?: string } | null
  stack?: unknown
}

export type Owner = Fiber | ServerComponentInfo

export type SourceHint = { kind: "stack"; stack: string } | { kind: "source"; source: DebugSource }

/** A component on the owner chain of an inspected element. */
export interface ComponentEntry {
  name: string
  /** Name V8 prints in stack frames for this component's render function. */
  functionName: string
  environment: "client" | "server"
  owner: Owner
  /** Where this component's own JSX element was written (usage site). */
  usage: SourceHint | null
  /** Hints for elements this component created; they point into its definition. */
  evidence: SourceHint[]
}

const FIBER_KEY_PREFIXES = ["__reactFiber$", "__reactInternalInstance$"]
const HOST_TAGS = new Set([5, 26, 27])
const MAX_EVIDENCE = 8
const MAX_SUBTREE_SCAN = 400

export function isFiber(owner: Owner): owner is Fiber {
  return typeof (owner as Fiber).tag === "number"
}

export function fiberFromNode(node: object): Fiber | null {
  for (const key of Object.keys(node)) {
    if (FIBER_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      return (node as Record<string, Fiber>)[key] ?? null
    }
  }
  return null
}

/** Nearest React-rendered element at or above `element`, with its fiber. */
export function closestFiber(element: Element | null): { element: Element; fiber: Fiber } | null {
  for (let current = element; current; ) {
    const fiber = fiberFromNode(current)
    if (fiber) return { element: current, fiber }
    const parent = current.parentElement
    if (parent) {
      current = parent
      continue
    }
    const root = current.getRootNode()
    if (root instanceof ShadowRoot) {
      current = root.host
      continue
    }
    break
  }
  return null
}

export function isDevelopmentFiber(fiber: Fiber): boolean {
  return "_debugOwner" in fiber || "_debugSource" in fiber || "_debugStack" in fiber
}

function ownerOf(node: Owner): Owner | null {
  return (isFiber(node) ? node._debugOwner : node.owner) ?? null
}

export function hintOf(node: Owner): SourceHint | null {
  if (isFiber(node)) {
    const stack = node._debugStack?.stack
    if (stack) return { kind: "stack", stack }
    if (node._debugSource) return { kind: "source", source: node._debugSource }
    return null
  }
  const stack = node.debugStack?.stack ?? (typeof node.stack === "string" ? node.stack : undefined)
  return stack ? { kind: "stack", stack } : null
}

export function typeName(type: unknown, depth = 0): string {
  if (depth > 5 || type == null) return ""
  if (typeof type === "string") return type
  if (typeof type === "function") {
    const fn = type as { displayName?: unknown; name?: unknown }
    return typeof fn.displayName === "string" && fn.displayName ? fn.displayName : String(fn.name ?? "")
  }
  if (typeof type === "object") {
    const wrapper = type as { displayName?: unknown; render?: unknown; type?: unknown }
    if (typeof wrapper.displayName === "string" && wrapper.displayName) return wrapper.displayName
    return typeName(wrapper.render ?? wrapper.type, depth + 1)
  }
  return ""
}

function renderFunctionName(type: unknown, depth = 0): string {
  if (depth > 5 || type == null) return ""
  if (typeof type === "function") return String((type as { name?: unknown }).name ?? "")
  if (typeof type === "object") {
    const wrapper = type as { render?: unknown; type?: unknown }
    return renderFunctionName(wrapper.render ?? wrapper.type, depth + 1)
  }
  return ""
}

function ownedHints(owner: Fiber): SourceHint[] {
  const hints: SourceHint[] = []
  const queue: Fiber[] = owner.child ? [owner.child] : []
  let scanned = 0
  while (queue.length > 0 && scanned < MAX_SUBTREE_SCAN && hints.length < MAX_EVIDENCE) {
    let fiber: Fiber | null = queue.shift()!
    while (fiber && scanned < MAX_SUBTREE_SCAN) {
      scanned++
      if (fiber._debugOwner === owner) {
        const hint = hintOf(fiber)
        if (hint) hints.push(hint)
      }
      if (fiber.child) queue.push(fiber.child)
      fiber = fiber.sibling
    }
  }
  return hints
}

/**
 * Owner chain ("rendered by") of a host fiber, nearest component first. This
 * is the chain React DevTools shows, not the parent tree: a component passed
 * as `children` belongs to whoever wrote its JSX.
 */
export function ownerChain(host: Fiber): ComponentEntry[] {
  const entries: ComponentEntry[] = []
  const seen = new Set<Owner>()
  let child: Owner = host
  let owner = ownerOf(host)

  while (owner && !seen.has(owner) && entries.length < 100) {
    seen.add(owner)
    const evidence = [hintOf(child), ...(isFiber(owner) ? ownedHints(owner) : [])].filter(
      (hint): hint is SourceHint => hint !== null,
    )
    entries.push(
      isFiber(owner)
        ? {
            name: typeName(owner.type) || "Anonymous",
            functionName: renderFunctionName(owner.type),
            environment: "client",
            owner,
            usage: hintOf(owner),
            evidence,
          }
        : {
            name: owner.name || "Anonymous",
            functionName: owner.name ?? "",
            environment: "server",
            owner,
            usage: hintOf(owner),
            evidence,
          },
    )
    child = owner
    owner = ownerOf(owner)
  }
  return entries
}

function ownerChainIncludes(fiber: Fiber, target: Owner): boolean {
  const seen = new Set<Owner>()
  for (let owner = ownerOf(fiber); owner && !seen.has(owner); owner = ownerOf(owner)) {
    if (owner === target) return true
    seen.add(owner)
  }
  return false
}

/**
 * Fiber whose subtree is the rendered output of `owner`. Client components are
 * their own fiber; a Server Component has none, so use the outermost fiber on
 * the path from the inspected host that it (transitively) rendered.
 */
export function outputRoot(owner: Owner, host: Fiber): Fiber | null {
  if (isFiber(owner)) return owner
  let root: Fiber | null = null
  for (let fiber: Fiber | null = host; fiber; fiber = fiber.return) {
    if (ownerChainIncludes(fiber, owner)) root = fiber
  }
  return root
}

/** Top-level DOM elements rendered inside a fiber's subtree. */
export function hostElements(root: Fiber, limit = 2000): Element[] {
  const elements: Element[] = []
  if (HOST_TAGS.has(root.tag)) return root.stateNode instanceof Element ? [root.stateNode] : []

  const stack: Fiber[] = root.child ? [root.child] : []
  let visited = 0
  while (stack.length > 0 && visited < limit) {
    const fiber = stack.pop()!
    visited++
    if (fiber.sibling) stack.push(fiber.sibling)
    if (HOST_TAGS.has(fiber.tag)) {
      if (fiber.stateNode instanceof Element) elements.push(fiber.stateNode)
    } else if (fiber.child) {
      stack.push(fiber.child)
    }
  }
  return elements
}
