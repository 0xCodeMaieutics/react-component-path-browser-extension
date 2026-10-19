import { BUILT_IN_ORIGINS, getEnabledOrigins, originPatternForHost } from "./lib/hosts"
import { ENABLE_PROMPT_ID, type RuntimeMessage } from "./lib/messages"
import { COPY_MODES, isCopyMode } from "./lib/reference"

const SCRIPT_IDS = { main: "react-component-copier-main", bridge: "react-component-copier-bridge" }
const MENU_ROOT = "react-component-copier"

/** chrome-types declares `func` without parameters even though `args` are passed to it. */
function withArgs<Args extends unknown[]>(func: (...args: Args) => void): () => void {
  return func as unknown as () => void
}

async function sendToTab(tabId: number, message: RuntimeMessage, frameId?: number): Promise<boolean> {
  try {
    await chrome.tabs.sendMessage(tabId, message, frameId === undefined ? undefined : { frameId })
    return true
  } catch {
    return false
  }
}

async function injectScripts(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["bridge.js"] })
  await chrome.scripting.executeScript({ target: { tabId }, files: ["main-world.js"], world: "MAIN" })
}

async function setUpMenus(origins: string[]): Promise<void> {
  await chrome.contextMenus.removeAll()
  const documentUrlPatterns = [...BUILT_IN_ORIGINS, ...origins]
  chrome.contextMenus.create({ id: MENU_ROOT, title: "Copy React component", contexts: ["all"], documentUrlPatterns })
  for (const [mode, title] of Object.entries(COPY_MODES)) {
    chrome.contextMenus.create({ id: mode, parentId: MENU_ROOT, title, contexts: ["all"], documentUrlPatterns })
  }
}

/**
 * Built-in dev hosts use the manifest's content scripts; hosts the user
 * enabled later get the same scripts registered dynamically.
 */
let syncing = Promise.resolve()
function syncHosts(): Promise<void> {
  syncing = syncing.then(async () => {
    const origins = await getEnabledOrigins()
    await chrome.scripting.unregisterContentScripts({ ids: Object.values(SCRIPT_IDS) }).catch(() => {})
    if (origins.length > 0) {
      await chrome.scripting.registerContentScripts([
        { id: SCRIPT_IDS.bridge, matches: origins, js: ["bridge.js"], runAt: "document_idle" },
        { id: SCRIPT_IDS.main, matches: origins, js: ["main-world.js"], runAt: "document_idle", world: "MAIN" },
      ])
    }
    await setUpMenus(origins)
  })
  return syncing
}

async function removeEnablePrompt(tabId: number): Promise<void> {
  await chrome.scripting
    .executeScript({
      target: { tabId },
      func: withArgs((id: string) => document.getElementById(id)?.remove()),
      args: [ENABLE_PROMPT_ID],
    })
    .catch(() => {})
}

async function showEnablePrompt(tabId: number, hostname: string): Promise<void> {
  const src = chrome.runtime.getURL(`enable.html?${new URLSearchParams({ host: hostname, tabId: String(tabId) })}`)
  await chrome.scripting.executeScript({
    target: { tabId },
    args: [ENABLE_PROMPT_ID, src],
    func: withArgs((id: string, frameSrc: string) => {
      if (document.getElementById(id)) return
      const host = document.createElement("div")
      host.id = id
      const shadow = host.attachShadow({ mode: "closed" })
      const frame = document.createElement("iframe")
      frame.src = frameSrc
      frame.title = "Enable React Component Copier"
      frame.style.cssText =
        "position:fixed;top:16px;right:16px;z-index:2147483647;width:380px;height:184px;border:0;border-radius:12px;box-shadow:0 8px 24px rgba(1,4,9,.35);color-scheme:normal"
      shadow.append(frame)
      document.documentElement.append(host)
    }),
  })
}

async function activate(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id === undefined || !tab.url) return
  const url = new URL(tab.url)
  if (url.protocol !== "http:" && url.protocol !== "https:") return
  if (await sendToTab(tab.id, { type: "toggle-picker" })) return

  if (await chrome.permissions.contains({ origins: [originPatternForHost(url.hostname)] })) {
    // Tab was open before the extension was installed or the host enabled.
    await injectScripts(tab.id)
    await sendToTab(tab.id, { type: "toggle-picker" })
    return
  }
  await showEnablePrompt(tab.id, url.hostname)
}

async function onHostEnabled(tabId: number): Promise<void> {
  await syncHosts()
  await removeEnablePrompt(tabId)
  if (!(await sendToTab(tabId, { type: "toggle-picker" }))) {
    await injectScripts(tabId)
    await sendToTab(tabId, { type: "toggle-picker" })
  }
}

chrome.action.onClicked.addListener((tab) => void activate(tab))

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (tab?.id === undefined || !isCopyMode(info.menuItemId)) return
  void sendToTab(tab.id, { type: "copy-context-target", mode: info.menuItemId }, info.frameId)
})

chrome.runtime.onMessage.addListener((message: RuntimeMessage) => {
  if (message.type === "host-enabled") void onHostEnabled(message.tabId)
  else if (message.type === "dismiss-enable-prompt") void removeEnablePrompt(message.tabId)
  return false
})

chrome.permissions.onAdded.addListener(() => void syncHosts())
chrome.permissions.onRemoved.addListener(() => void syncHosts())
chrome.runtime.onInstalled.addListener(() => void syncHosts())
chrome.runtime.onStartup.addListener(() => void syncHosts())
