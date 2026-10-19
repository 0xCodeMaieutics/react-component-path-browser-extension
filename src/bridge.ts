import { getPathPrefixes } from "./lib/hosts"
import { PAGE_EVENT, type PageConfig, type RuntimeMessage } from "./lib/messages"

declare global {
  var __reactComponentCopierBridge: boolean | undefined
}

const CLIPBOARD_RESULT_EVENT = `${PAGE_EVENT.writeClipboard}:result`

async function sendConfig(): Promise<void> {
  const prefixes = await getPathPrefixes()
  const config: PageConfig = { pathPrefix: prefixes[location.host.toLowerCase()] }
  document.dispatchEvent(new CustomEvent(PAGE_EVENT.config, { detail: JSON.stringify(config) }))
}

function copyWithSelection(text: string): boolean {
  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "")
  textarea.style.cssText = "position:fixed;top:-1000px;opacity:0"
  document.documentElement.append(textarea)
  textarea.select()
  try {
    return document.execCommand("copy")
  } finally {
    textarea.remove()
  }
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return copyWithSelection(text)
  }
}

function start(): void {
  document.addEventListener(PAGE_EVENT.ready, () => void sendConfig())
  document.addEventListener(PAGE_EVENT.writeClipboard, (event) => {
    const text = (event as CustomEvent<unknown>).detail
    if (typeof text !== "string") return
    void writeClipboard(text).then((ok) =>
      document.dispatchEvent(new CustomEvent(CLIPBOARD_RESULT_EVENT, { detail: ok ? "ok" : "error" })),
    )
  })

  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === "local") void sendConfig()
  })

  chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
    if (message.type === "toggle-picker") {
      document.dispatchEvent(new CustomEvent(PAGE_EVENT.toggle))
    } else if (message.type === "copy-context-target") {
      document.dispatchEvent(new CustomEvent(PAGE_EVENT.copyContextTarget, { detail: message.mode }))
    } else {
      return false
    }
    sendResponse({ ok: true })
    return false
  })

  void sendConfig()
}

if (!globalThis.__reactComponentCopierBridge) {
  globalThis.__reactComponentCopierBridge = true
  start()
}
