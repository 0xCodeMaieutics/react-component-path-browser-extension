export interface StackFrame {
  functionName: string
  url: string
  /** 1-based, as printed by V8. */
  line: number
  /** 1-based, as printed by V8. */
  column: number
}

const FRAME_PATTERN = /^\s*at\s+(?:(.*?)\s+\()?(.+?):(\d+):(\d+)\)?\s*$/
const REACT_STACK_HEADER = "Error: react-stack-top-frame"
const REACT_STACK_BOTTOM = "react_stack_bottom_frame"
const REACT_ENVIRONMENT_URL = /^(?:about|rsc):\/\/React\/[^/]+\/(.+)$/

export function parseStack(stack: string): StackFrame[] {
  const frames: StackFrame[] = []
  for (const line of stack.split("\n")) {
    const match = FRAME_PATTERN.exec(line)
    if (!match) continue
    frames.push({
      functionName: match[1] ?? "",
      url: match[2]!,
      line: Number(match[3]),
      column: Number(match[4]),
    })
  }
  return frames
}

/**
 * The frame that wrote the JSX for a React 19 element stack (`_debugStack`):
 * the first frame after React's own JSX runtime frame (`jsxDEV`,
 * `createElement`, or Flight's `fakeJSXCallSite`).
 */
export function callSiteFrame(stack: string): StackFrame | null {
  const frames = parseStack(stack)
  const callSite = stack.startsWith(REACT_STACK_HEADER) ? frames[1] : frames[0]
  if (!callSite || callSite.functionName.includes(REACT_STACK_BOTTOM)) return null
  if (!/^(?:https?|file|about|rsc|webpack|webpack-internal|turbopack):/.test(callSite.url)) return null
  return callSite
}

/**
 * The frame of `functionName`'s render in an element stack: the call site, or
 * one of its callers when the JSX sits in a callback (`rows.map((row) => …)`).
 * Null when another component in `chainFunctionNames` is reached first, i.e.
 * the element was written there and merely cloned. Anonymous components
 * (empty `functionName`) own the call site unless it is a known component.
 */
export function renderFrame(stack: string, functionName: string, chainFunctionNames: Set<string>): StackFrame | null {
  const callSite = callSiteFrame(stack)
  if (!callSite) return null
  if (!functionName) return chainFunctionNames.has(normalizeFunctionName(callSite.functionName)) ? null : callSite

  const frames = parseStack(stack).slice(stack.startsWith(REACT_STACK_HEADER) ? 1 : 0)
  for (const frame of frames) {
    if (frame.functionName.includes(REACT_STACK_BOTTOM)) break
    const name = normalizeFunctionName(frame.functionName)
    if (name === functionName) return frame
    if (chainFunctionNames.has(name)) return null
  }
  return null
}

/** React's own JSX runtime frame at the top of an element stack. */
export function runtimeFrame(stack: string): StackFrame | null {
  return stack.startsWith(REACT_STACK_HEADER) ? (parseStack(stack)[0] ?? null) : null
}

/**
 * Server Component frames are replayed under `about://React/<Env>/<url>?<n>`
 * (`rsc://` in older React 19 releases); returns the underlying script URL.
 */
export function unwrapEnvironmentUrl(url: string): string {
  const match = REACT_ENVIRONMENT_URL.exec(url)
  if (!match) return url
  return match[1]!.replace(/\?\d+$/, "")
}

/** `async PayButton`, `Object.PayButton`, `new PayButton` → `PayButton`. */
export function normalizeFunctionName(name: string): string {
  return name.replace(/^(?:async|new)\s+/, "").split(".").pop() ?? ""
}
