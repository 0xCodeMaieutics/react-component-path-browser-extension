import { describe, expect, it } from "vitest"
import { preferHostIntrinsicUsage } from "../src/lib/element-usage"
import type { SourceLocation } from "../src/lib/resolve"
import type { Fiber } from "../src/lib/fiber"

function loc(path: string, line: number, endLine?: number): SourceLocation {
  return { path: { path, absolute: false }, line, endLine, isLibrary: false }
}

describe("preferHostIntrinsicUsage", () => {
  const host = { tag: 5, type: "input" } as Fiber

  it("keeps component usage when paths match", () => {
    const component = loc("app/page.client.tsx", 10, 12)
    const hostUsage = loc("app/page.client.tsx", 97, 104)
    expect(preferHostIntrinsicUsage(host, component, hostUsage)).toBe(component)
  })

  it("prefers host usage when component points at a parent file", () => {
    const component = loc("app/page.tsx", 158, 163)
    const hostUsage = loc("app/(app)/day-plan/page.client.tsx", 97, 104)
    expect(preferHostIntrinsicUsage(host, component, hostUsage)).toBe(hostUsage)
  })
})
