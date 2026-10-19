import { PAGE_EVENT, type PageConfig } from "./lib/messages"
import { isCopyMode } from "./lib/reference"
import { ComponentResolver, defaultSelection } from "./lib/resolve"
import { detectReact, inspectElement, selectableComponents } from "./picker/inspect"
import { Overlay } from "./picker/overlay"
import { Picker, copyComponent, type PickerOptions } from "./picker/picker"

declare global {
  interface Window {
    __reactComponentCopier?: boolean
  }
}

const CLIPBOARD_RESULT_EVENT = `${PAGE_EVENT.writeClipboard}:result`

function writeClipboard(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => finish(false), 2000)
    function finish(ok: boolean) {
      clearTimeout(timer)
      document.removeEventListener(CLIPBOARD_RESULT_EVENT, onResult)
      resolve(ok)
    }
    function onResult(event: Event) {
      finish((event as CustomEvent<string>).detail === "ok")
    }
    document.addEventListener(CLIPBOARD_RESULT_EVENT, onResult)
    document.dispatchEvent(new CustomEvent(PAGE_EVENT.writeClipboard, { detail: text }))
  })
}

function start(): void {
  let config: PageConfig = {}
  let contextTarget: Element | null = null
  const overlay = new Overlay()
  const options: PickerOptions = {
    overlay,
    resolver: new ComponentResolver(location.origin),
    pathPrefix: () => config.pathPrefix,
    copy: writeClipboard,
  }
  const picker = new Picker(options)

  function reactAvailable(): boolean {
    const build = detectReact()
    if (build === "development") return true
    overlay.toast(
      build === "production"
        ? "This is a production React build; component names and paths need a development build"
        : "No React app detected on this page",
      { error: true },
    )
    return false
  }

  document.addEventListener(PAGE_EVENT.config, (event) => {
    try {
      config = JSON.parse((event as CustomEvent<string>).detail) as PageConfig
    } catch {
      config = {}
    }
  })

  document.addEventListener(PAGE_EVENT.toggle, () => {
    if (picker.isActive || reactAvailable()) picker.toggle()
  })

  window.addEventListener(
    "contextmenu",
    (event) => {
      contextTarget = null
      for (const node of event.composedPath()) {
        if (node instanceof Element) {
          contextTarget = node
          break
        }
      }
    },
    { capture: true, passive: true },
  )

  document.addEventListener(PAGE_EVENT.copyContextTarget, (event) => {
    const mode = (event as CustomEvent<string>).detail
    if (!isCopyMode(mode) || !contextTarget) return
    picker.stop()
    if (!reactAvailable()) return
    const inspection = inspectElement(contextTarget, options.resolver)
    if (!inspection) {
      void copyComponent(options, undefined, mode)
      return
    }
    void inspection.components.then((components) => {
      const selectable = selectableComponents(components)
      return copyComponent(options, selectable[defaultSelection(selectable)], mode)
    })
  })

  document.dispatchEvent(new CustomEvent(PAGE_EVENT.ready))
}

if (!window.__reactComponentCopier) {
  window.__reactComponentCopier = true
  start()
}
