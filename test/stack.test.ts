import { describe, expect, it } from "vitest"
import { callSiteFrame, normalizeFunctionName, parseStack, runtimeFrame, unwrapEnvironmentUrl } from "../src/lib/stack"

// Captured from Next.js 16.4 (Turbopack) and Vite 8 dev servers with React 19.3.
const TURBOPACK_CLIENT = `Error: react-stack-top-frame
    at exports.jsxDEV (http://localhost:3311/_next/static/chunks/_0o7zrvn2rr9il._.js:568:33)
    at PayButton (http://localhost:3311/_next/static/chunks/_0o7zrvn2rr9il._.js:20:384)
    at Object.react_stack_bottom_frame (http://localhost:3311/_next/static/chunks/18mo_next_dist_compiled_react-dom_cjs_react-dom-client_development_0s2a1_8o1ng_3.js:15013:24)`

const TURBOPACK_SERVER = `Error: react-stack-top-frame
    at fakeJSXCallSite (http://localhost:3311/_next/static/chunks/18mo_next_dist_compiled_react-server-dom-turbopack_0wduuuocwejy6._.js:2093:21)
    at CheckoutPage (about://React/Prerender/file:///Users/me/app/.next/dev/server/chunks/ssr/%5Broot-of-the-server%5D__01cli7naqoqvz._.js?7:69:427)
    at Object.react_stack_bottom_frame (http://localhost:3311/_next/static/chunks/18mo_next_dist_compiled_react-server-dom-turbopack_0wduuuocwejy6._.js:2859:93)`

// Captured from Next.js 15.5 with React 19.1.
const NEXT15_TURBOPACK_SERVER = `Error: react-stack-top-frame
    at fakeJSXCallSite (http://localhost:3315/_next/static/chunks/6e18e_next_dist_compiled_adb61491._.js:4382:16)
    at OrderSummary (about://React/Server/file:///Users/me/app/.next/server/chunks/ssr/%5Broot-of-the-server%5D__8ec76e08._.js?4:63:458)
    at Object.react_stack_bottom_frame (http://localhost:3315/_next/static/chunks/6e18e_next_dist_compiled_adb61491._.js:4857:93)`

const NEXT15_WEBPACK_SERVER = `Error: react-stack-top-frame
    at fakeJSXCallSite (webpack-internal:///(app-pages-browser)/./node_modules/.pnpm/next@15.5.28_react-dom@19.1.0_react@19.1.0__react@19.1.0/node_modules/next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-client.browser.development.js:2623:14)
    at OrderSummary (about://React/Server/webpack-internal:///(rsc)/./app/checkout/page.tsx?4:13:94)
    at Object.react_stack_bottom_frame (webpack-internal:///(app-pages-browser)/./node_modules/.pnpm/next@15.5.28_react-dom@19.1.0_react@19.1.0__react@19.1.0/node_modules/next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-client.browser.development.js:3448:12)`

const NEXT_INTERNALS = `Error: react-stack-top-frame
    at fakeJSXCallSite (http://localhost:3311/_next/static/chunks/react-server-dom.js:2093:21)
    at Promise.all (<anonymous>:1:20)
    at Object.react_stack_bottom_frame (http://localhost:3311/_next/static/chunks/react-server-dom.js:2859:93)`

const VITE_ANONYMOUS = `Error: react-stack-top-frame
    at exports.jsxDEV (http://localhost:3312/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=c9f1ced4:196:25)
    at http://localhost:3312/src/main.tsx:7:116`

describe("parseStack", () => {
  it("parses named and anonymous V8 frames", () => {
    expect(parseStack(VITE_ANONYMOUS)).toEqual([
      {
        functionName: "exports.jsxDEV",
        url: "http://localhost:3312/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=c9f1ced4",
        line: 196,
        column: 25,
      },
      { functionName: "", url: "http://localhost:3312/src/main.tsx", line: 7, column: 116 },
    ])
  })
})

describe("callSiteFrame", () => {
  it("skips React's JSX runtime frame", () => {
    expect(callSiteFrame(TURBOPACK_CLIENT)).toMatchObject({ functionName: "PayButton", line: 20, column: 384 })
    expect(callSiteFrame(TURBOPACK_SERVER)).toMatchObject({ functionName: "CheckoutPage", line: 69, column: 427 })
    expect(callSiteFrame(VITE_ANONYMOUS)).toMatchObject({ functionName: "", url: "http://localhost:3312/src/main.tsx" })
  })

  it("finds Next.js 15 Server Component call sites", () => {
    expect(callSiteFrame(NEXT15_TURBOPACK_SERVER)).toMatchObject({ functionName: "OrderSummary", line: 63, column: 458 })
    expect(callSiteFrame(NEXT15_WEBPACK_SERVER)).toMatchObject({ functionName: "OrderSummary", line: 13, column: 94 })
  })

  it("returns null when only framework internals rendered the element", () => {
    expect(callSiteFrame(NEXT_INTERNALS)).toBeNull()
  })
})

describe("runtimeFrame", () => {
  it("is the first frame of a React element stack", () => {
    expect(runtimeFrame(TURBOPACK_SERVER)?.functionName).toBe("fakeJSXCallSite")
    expect(runtimeFrame("    at Foo (http://x/a.js:1:1)")).toBeNull()
  })
})

describe("unwrapEnvironmentUrl", () => {
  it("unwraps replayed Server Component frames", () => {
    expect(
      unwrapEnvironmentUrl("about://React/Prerender/file:///Users/me/app/.next/dev/server/chunks/ssr/x._.js?7"),
    ).toBe("file:///Users/me/app/.next/dev/server/chunks/ssr/x._.js")
    expect(unwrapEnvironmentUrl("rsc://React/Server/webpack-internal:///(rsc)/./app/page.tsx?3")).toBe(
      "webpack-internal:///(rsc)/./app/page.tsx",
    )
    expect(unwrapEnvironmentUrl(callSiteFrame(NEXT15_TURBOPACK_SERVER)!.url)).toBe(
      "file:///Users/me/app/.next/server/chunks/ssr/%5Broot-of-the-server%5D__8ec76e08._.js",
    )
    expect(unwrapEnvironmentUrl(callSiteFrame(NEXT15_WEBPACK_SERVER)!.url)).toBe(
      "webpack-internal:///(rsc)/./app/checkout/page.tsx",
    )
    expect(unwrapEnvironmentUrl("http://localhost:3000/a.js")).toBe("http://localhost:3000/a.js")
  })
})

describe("normalizeFunctionName", () => {
  it("strips receivers and keywords", () => {
    expect(normalizeFunctionName("Object.PayButton")).toBe("PayButton")
    expect(normalizeFunctionName("async CheckoutPage")).toBe("CheckoutPage")
    expect(normalizeFunctionName("new Widget")).toBe("Widget")
  })
})
