import type { CopyMode } from "./reference"

/** Extension runtime messages (background ⇄ bridge content script). */
export type RuntimeMessage =
  | { type: "toggle-picker" }
  | { type: "copy-context-target"; mode: CopyMode }
  | { type: "host-enabled"; tabId: number }
  | { type: "dismiss-enable-prompt"; tabId: number }

/**
 * DOM events between the isolated-world bridge and the main-world script.
 * Details are JSON strings so they cross the world boundary unchanged.
 */
export const PAGE_EVENT = {
  /** bridge → main */
  toggle: "react-component-copier:toggle",
  copyContextTarget: "react-component-copier:copy-context-target",
  config: "react-component-copier:config",
  /** main → bridge */
  ready: "react-component-copier:ready",
  writeClipboard: "react-component-copier:write-clipboard",
} as const

export interface PageConfig {
  pathPrefix?: string
}

export const ENABLE_PROMPT_ID = "react-component-copier-enable-prompt"
