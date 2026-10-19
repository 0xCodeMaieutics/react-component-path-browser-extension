import { hintOf, type Fiber } from "./fiber"
import type { SourceLocation } from "./resolve"

function isIntrinsicHostFiber(fiber: Fiber): boolean {
  return typeof fiber.type === "string"
}

/**
 * For native DOM nodes (input, button, div, …), the owner component's usage site
 * often points at a parent file (e.g. where a client component is rendered).
 * Prefer the host fiber's creation stack when it lands in a different file.
 */
export function preferHostIntrinsicUsage(
  host: Fiber,
  componentUsage: SourceLocation | null,
  hostUsage: SourceLocation | null,
): SourceLocation | null {
  if (!isIntrinsicHostFiber(host) || !hostUsage || hostUsage.isLibrary) return componentUsage
  if (!componentUsage) return hostUsage
  if (componentUsage.path.path === hostUsage.path.path) {
    return componentUsage.endLine !== undefined ? componentUsage : hostUsage
  }
  return hostUsage
}

export function hostUsageHint(host: Fiber) {
  return hintOf(host)
}
