import { describe, expect, it } from "vitest"
import { ProjectRoots, applyPathPrefix, isLibraryPath, toSourcePath } from "../src/lib/source-path"

const ORIGIN = "http://localhost:3000"

describe("toSourcePath", () => {
  it("normalizes bundler source formats", () => {
    expect(toSourcePath("turbopack:///[project]/apps/web/app/page.tsx", ORIGIN)).toEqual({
      path: "apps/web/app/page.tsx",
      absolute: false,
    })
    expect(toSourcePath("webpack://_N_E/./app/page.tsx?abc", ORIGIN).path).toBe("app/page.tsx")
    expect(toSourcePath("webpack-internal:///(app-pages-browser)/./components/ui/button.tsx", ORIGIN).path).toBe(
      "components/ui/button.tsx",
    )
    expect(toSourcePath(`${ORIGIN}/src/App.tsx?t=123`, ORIGIN)).toEqual({ path: "src/App.tsx", absolute: false })
    expect(toSourcePath(`${ORIGIN}/@fs/Users/me/repo/packages/ui/button.tsx`, ORIGIN)).toEqual({
      path: "/Users/me/repo/packages/ui/button.tsx",
      absolute: true,
    })
  })

  it("decodes file URLs and keeps them absolute without a known root", () => {
    expect(toSourcePath("file:///Users/me/my%20app/app/page.tsx", ORIGIN)).toEqual({
      path: "/Users/me/my app/app/page.tsx",
      absolute: true,
    })
  })

  it("relativizes against the shortest learned root (the repository in a workspace)", () => {
    const roots = new ProjectRoots()
    roots.learn("/Users/me/repo/apps/web/.next/dev/server/chunks/ssr/x.js")
    roots.learn("/Users/me/repo/node_modules/.pnpm/next@16/node_modules/next/dist/x.js")
    expect(toSourcePath("file:///Users/me/repo/apps/web/app/page.tsx", ORIGIN, roots)).toEqual({
      path: "apps/web/app/page.tsx",
      absolute: false,
    })
  })

  it("learns a root from an absolute/relative pair", () => {
    const roots = new ProjectRoots()
    roots.learnFromPair("/Users/me/app/app/checkout/page.tsx", "app/checkout/page.tsx")
    expect(roots.relativize("/Users/me/app/components/x.tsx")).toBe("components/x.tsx")
  })
})

describe("isLibraryPath", () => {
  it("detects dependencies and bundler internals", () => {
    expect(isLibraryPath("node_modules/.pnpm/@radix-ui+react-slot/node_modules/@radix-ui/react-slot/src/slot.tsx")).toBe(true)
    expect(isLibraryPath("/Users/me/repo/node_modules/react/index.js")).toBe(true)
    expect(isLibraryPath("[turbopack]/browser/runtime.ts")).toBe(true)
    expect(isLibraryPath("packages/ui/src/button.tsx")).toBe(false)
  })
})

describe("applyPathPrefix", () => {
  it("prefixes relative paths only", () => {
    expect(applyPathPrefix({ path: "src/App.tsx", absolute: false }, "apps/web")).toBe("apps/web/src/App.tsx")
    expect(applyPathPrefix({ path: "src/App.tsx", absolute: false }, "/apps/web/")).toBe("apps/web/src/App.tsx")
    expect(applyPathPrefix({ path: "/abs/App.tsx", absolute: true }, "apps/web/")).toBe("/abs/App.tsx")
    expect(applyPathPrefix({ path: "src/App.tsx", absolute: false }, undefined)).toBe("src/App.tsx")
  })
})
