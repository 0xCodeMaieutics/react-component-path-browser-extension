import { TraceMap, generatedPositionFor } from "@jridgewell/trace-mapping"
import { transformSync } from "esbuild"
import { describe, expect, it } from "vitest"
import { ownerChain, type Fiber, type Owner, type ServerComponentInfo } from "../src/lib/fiber"
import { formatCopy } from "../src/lib/reference"
import { ComponentResolver, defaultSelection } from "../src/lib/resolve"

const ORIGIN = "http://localhost:3000"
const SOURCE = `import { Slot } from "radix"

function Button({ asChild, ...props }: { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button"
  return <Comp data-slot="button" {...props} />
}

export function PayButton() {
  return (
    <Button asChild>
      <a href="#pay">Pay</a>
    </Button>
  )
}
`

const compiled = transformSync(SOURCE, {
  loader: "tsx",
  jsx: "automatic",
  jsxDev: true,
  sourcemap: "external",
  sourcefile: "file:///repo/app/page.client.tsx",
  sourcesContent: true,
})
const appMap = new TraceMap(compiled.map)

const RESPONSES: Record<string, string> = {
  [`${ORIGIN}/app.js`]: `${compiled.code}\n//# sourceMappingURL=app.js.map`,
  [`${ORIGIN}/app.js.map`]: compiled.map,
  [`${ORIGIN}/runtime.js`]: "exports.jsxDEV = () => {}\n//# sourceMappingURL=runtime.js.map",
  [`${ORIGIN}/runtime.js.map`]: JSON.stringify({
    version: 3,
    sources: ["file:///repo/node_modules/react/cjs/react-jsx-dev-runtime.development.js"],
    mappings: "AAAA",
  }),
}

async function fetcher(url: string): Promise<Response> {
  const body = RESPONSES[url]
  return body === undefined ? new Response("", { status: 404 }) : new Response(body)
}

/** A React 19 element stack whose call site is the JSX at `marker` in SOURCE. */
function stackAt(functionName: string, marker: string): string {
  const index = SOURCE.indexOf(marker)
  const before = SOURCE.slice(0, index)
  const generated = generatedPositionFor(appMap, {
    source: "file:///repo/app/page.client.tsx",
    line: before.split("\n").length,
    column: index - before.lastIndexOf("\n") - 1,
  })
  return [
    "Error: react-stack-top-frame",
    `    at exports.jsxDEV (${ORIGIN}/runtime.js:1:1)`,
    `    at ${functionName} (${ORIGIN}/app.js:${generated.line}:${generated.column! + 1})`,
    `    at Object.react_stack_bottom_frame (${ORIGIN}/react-dom.js:1:1)`,
  ].join("\n")
}

function fiber(tag: number, type: unknown, owner: Owner | null, stack: string | null): Fiber {
  return {
    tag,
    type,
    return: null,
    child: null,
    sibling: null,
    stateNode: null,
    _debugOwner: owner,
    _debugStack: stack ? { stack } : null,
  }
}

function PayButtonType() {}
Object.defineProperty(PayButtonType, "name", { value: "PayButton" })
function ButtonType() {}
Object.defineProperty(ButtonType, "name", { value: "Button" })
// Radix-style anonymous forwardRef render with a displayName.
const SlotType = { displayName: "Slot.Slot", render: (() => () => null)() }

function payButtonTree() {
  const payButton = fiber(0, PayButtonType, null, null)
  const button = fiber(0, ButtonType, payButton, stackAt("PayButton", "<Button asChild"))
  const slot = fiber(11, SlotType, button, stackAt("Button", "<Comp"))
  // Slot clones its child: the owner becomes Slot, the stack stays PayButton's.
  const anchor = fiber(5, "a", slot, stackAt("PayButton", "<a href"))
  payButton.child = button
  button.child = slot
  slot.child = anchor
  return { anchor, payButton, button, slot }
}

describe("ComponentResolver", () => {
  it("resolves usage sites with JSX ranges and skips cloning library components", async () => {
    const { anchor } = payButtonTree()
    const resolver = new ComponentResolver(ORIGIN, fetcher)
    const components = await resolver.resolveChain(ownerChain(anchor))

    expect(components.map((component) => [component.entry.name, component.isLibrary])).toEqual([
      ["Slot.Slot", true],
      ["Button", false],
      ["PayButton", false],
    ])
    const [slot, button, payButton] = components
    expect(formatCopy("reference", "Slot.Slot", slot!.usage)).toBe("Slot.Slot (app/page.client.tsx:5)")
    expect(formatCopy("reference", "Button", button!.usage)).toBe("Button (app/page.client.tsx:10-12)")
    expect(payButton!.usage).toBeNull()
    expect(defaultSelection(components)).toBe(1)
  })

  it("treats components defined under node_modules as library code", async () => {
    RESPONSES[`${ORIGIN}/vendor.js`] = "x\n//# sourceMappingURL=vendor.js.map"
    RESPONSES[`${ORIGIN}/vendor.js.map`] = JSON.stringify({
      version: 3,
      sources: ["file:///repo/node_modules/@radix-ui/react-dialog/src/dialog.tsx"],
      mappings: "AAAA",
    })
    function DialogContent() {}
    const page = fiber(0, PayButtonType, null, null)
    const dialog = fiber(0, DialogContent, page, stackAt("PayButton", "<Button asChild"))
    const host = fiber(
      5,
      "div",
      dialog,
      `Error: react-stack-top-frame\n    at exports.jsxDEV (${ORIGIN}/runtime.js:1:1)\n    at DialogContent (${ORIGIN}/vendor.js:1:1)`,
    )
    const resolver = new ComponentResolver(ORIGIN, fetcher)
    const components = await resolver.resolveChain(ownerChain(host))
    expect(components.map((component) => component.isLibrary)).toEqual([true, false])
  })

  it("walks through Server Component owners", async () => {
    const page: ServerComponentInfo = { name: "CheckoutPage", env: "Server", owner: null }
    const client = fiber(0, PayButtonType, page, null)
    const host = fiber(5, "a", client, stackAt("PayButton", "<a href"))
    const chain = ownerChain(host)
    expect(chain.map((entry) => [entry.name, entry.environment])).toEqual([
      ["PayButton", "client"],
      ["CheckoutPage", "server"],
    ])
  })

  it("counts JSX written in a callback as the enclosing component's", async () => {
    const [header, runtime, callSite] = stackAt("<anonymous>", "<a href").split("\n")
    const [, , render] = stackAt("PayButton", "<Button asChild").split("\n")
    const section: ServerComponentInfo = { name: "PayButton", env: "Server", owner: null }
    const item = fiber(5, "li", section, [header, runtime, callSite, "    at Array.map (<anonymous>)", render].join("\n"))
    const resolver = new ComponentResolver(ORIGIN, fetcher)
    const [component] = await resolver.resolveChain(ownerChain(item))
    expect(component!.isLibrary).toBe(false)
  })

  it("keeps a library that calls an app-written render prop as library code", async () => {
    const [header, runtime, callSite] = stackAt("<anonymous>", "<a href").split("\n")
    function Virtualizer() {}
    const list = fiber(0, Virtualizer, null, null)
    const item = fiber(5, "li", list, [header, runtime, callSite, `    at Virtualizer (${ORIGIN}/vendor.js:1:1)`].join("\n"))
    const resolver = new ComponentResolver(ORIGIN, fetcher)
    const [component] = await resolver.resolveChain(ownerChain(item))
    expect(component!.isLibrary).toBe(true)
  })

  it("falls back to React 18 _debugSource", async () => {
    const owner = fiber(0, ButtonType, null, null)
    const host: Fiber = {
      ...fiber(5, "button", owner, null),
      _debugSource: { fileName: "/repo/src/Button.jsx", lineNumber: 4 },
    }
    owner._debugSource = { fileName: "/repo/src/App.jsx", lineNumber: 12 }
    const resolver = new ComponentResolver(ORIGIN, fetcher)
    const [button] = await resolver.resolveChain(ownerChain(host))
    expect(button!.isLibrary).toBe(false)
    expect(formatCopy("path", "Button", button!.usage)).toBe("/repo/src/App.jsx:12")
  })
})
