import "./enable.css"
import { originPatternForHost } from "./lib/hosts"
import type { RuntimeMessage } from "./lib/messages"

const params = new URLSearchParams(location.search)
const host = params.get("host") ?? ""
const tabId = Number(params.get("tabId"))
const error = document.querySelector<HTMLElement>("#error")!

document.querySelector("#host")!.textContent = host

function send(message: RuntimeMessage): void {
  void chrome.runtime.sendMessage(message)
}

function dismiss(): void {
  send({ type: "dismiss-enable-prompt", tabId })
}

document.querySelector("#enable")!.addEventListener("click", async () => {
  error.textContent = ""
  try {
    const granted = await chrome.permissions.request({ origins: [originPatternForHost(host)] })
    if (granted) send({ type: "host-enabled", tabId })
    else error.textContent = "Permission was not granted."
  } catch (cause) {
    error.textContent = cause instanceof Error ? cause.message : String(cause)
  }
})

document.querySelector("#cancel")!.addEventListener("click", dismiss)
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") dismiss()
})
