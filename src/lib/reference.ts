import type { SourceLocation } from "./resolve"
import { applyPathPrefix } from "./source-path"

export type CopyMode = "reference" | "path" | "name"

export const COPY_MODES: Record<CopyMode, string> = {
  reference: "Name and path",
  path: "Path",
  name: "Name",
}

export function isCopyMode(value: unknown): value is CopyMode {
  return typeof value === "string" && value in COPY_MODES
}

/** `app/checkout/page.client.tsx:70-80`, or null without a location. */
export function formatLocation(location: SourceLocation | null, pathPrefix?: string): string | null {
  if (!location) return null
  const range = location.endLine ? `${location.line}-${location.endLine}` : `${location.line}`
  return `${applyPathPrefix(location.path, pathPrefix)}:${range}`
}

/**
 * Clipboard text for a component. Every mode falls back to the bare name when
 * no usage site could be resolved.
 */
export function formatCopy(mode: CopyMode, name: string, location: SourceLocation | null, pathPrefix?: string): string {
  const formatted = formatLocation(location, pathPrefix)
  if (mode === "name" || !formatted) return name
  return mode === "path" ? formatted : `${name} (${formatted})`
}

export function copyModeForEvent(event: { shiftKey: boolean; altKey: boolean }): CopyMode {
  if (event.shiftKey) return "path"
  if (event.altKey) return "name"
  return "reference"
}
