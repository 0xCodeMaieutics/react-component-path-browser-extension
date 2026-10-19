export const OVERLAY_HOST_ATTRIBUTE = "data-react-component-copier"

export interface LabelContent {
  name: string
  environment: "client" | "server"
  /** Formatted usage site, or a status such as "resolving…". */
  location: string
  locationMissing: boolean
  /** Selectable components, outermost first. */
  breadcrumb: string[]
  current: number
}

const STYLES = `
  :host { all: initial; }
  .layer { position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; }
  .outline {
    position: fixed; box-sizing: border-box; display: none;
    border: 2px solid #58c4dc; border-radius: 3px;
    background: rgba(88, 196, 220, 0.12);
    transition: left 60ms, top 60ms, width 60ms, height 60ms;
  }
  .label, .toast {
    position: fixed; box-sizing: border-box;
    font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    color: #e6edf3; background: #0d1117;
    border: 1px solid #30363d; border-radius: 8px;
    box-shadow: 0 8px 24px rgba(1, 4, 9, 0.45);
  }
  .label { display: none; max-width: min(640px, calc(100vw - 16px)); padding: 6px 10px; }
  .head { display: flex; gap: 8px; align-items: baseline; white-space: nowrap; }
  .name { color: #58c4dc; font-weight: 700; }
  .badge {
    padding: 0 5px; border-radius: 4px; font-size: 10px;
    color: #d2a8ff; border: 1px solid rgba(210, 168, 255, 0.4);
  }
  .location { overflow: hidden; text-overflow: ellipsis; color: #e6edf3; }
  .location.missing { color: #8b949e; font-style: italic; }
  .crumbs { margin-top: 2px; color: #8b949e; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .crumbs .current { color: #e6edf3; font-weight: 700; }
  .hint { margin-top: 4px; color: #6e7681; font-size: 11px; white-space: nowrap; }
  .toast {
    left: 50%; bottom: 24px; transform: translateX(-50%);
    max-width: min(720px, calc(100vw - 32px)); padding: 8px 14px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    opacity: 0; transition: opacity 150ms;
  }
  .toast.visible { opacity: 1; }
  .toast.error { border-color: #f85149; }
`

const MARGIN = 6

export class Overlay {
  private host: HTMLElement | null = null
  private outline!: HTMLElement
  private label!: HTMLElement
  private toastElement!: HTMLElement
  private toastTimer: number | undefined

  isOverlayNode(node: unknown): boolean {
    return node !== null && node === this.host
  }

  private mount(): void {
    if (this.host?.isConnected) return
    this.host = document.createElement("div")
    this.host.setAttribute(OVERLAY_HOST_ATTRIBUTE, "")
    const shadow = this.host.attachShadow({ mode: "closed" })
    shadow.innerHTML = `
      <style>${STYLES}</style>
      <div class="layer">
        <div class="outline"></div>
        <div class="label" role="status"></div>
        <div class="toast" role="status" aria-live="polite"></div>
      </div>
    `
    this.outline = shadow.querySelector(".outline")!
    this.label = shadow.querySelector(".label")!
    this.toastElement = shadow.querySelector(".toast")!
    document.documentElement.append(this.host)
  }

  show(rect: DOMRect, content: LabelContent): void {
    this.mount()
    Object.assign(this.outline.style, {
      display: "block",
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${Math.max(rect.width, 2)}px`,
      height: `${Math.max(rect.height, 2)}px`,
    })
    this.renderLabel(content)
    this.placeLabel(rect)
  }

  hide(): void {
    if (!this.host) return
    this.outline.style.display = "none"
    this.label.style.display = "none"
  }

  toast(message: string, options: { error?: boolean } = {}): void {
    this.mount()
    window.clearTimeout(this.toastTimer)
    this.toastElement.textContent = message
    this.toastElement.classList.toggle("error", options.error === true)
    this.toastElement.classList.add("visible")
    this.toastTimer = window.setTimeout(() => this.toastElement.classList.remove("visible"), 2200)
  }

  private renderLabel(content: LabelContent): void {
    const head = document.createElement("div")
    head.className = "head"
    const name = document.createElement("span")
    name.className = "name"
    name.textContent = content.name
    head.append(name)
    if (content.environment === "server") {
      const badge = document.createElement("span")
      badge.className = "badge"
      badge.textContent = "server"
      head.append(badge)
    }
    const location = document.createElement("span")
    location.className = content.locationMissing ? "location missing" : "location"
    location.textContent = content.location
    head.append(location)

    const crumbs = document.createElement("div")
    crumbs.className = "crumbs"
    content.breadcrumb.forEach((crumb, index) => {
      if (index > 0) crumbs.append(" › ")
      const part = document.createElement("span")
      if (index === content.current) part.className = "current"
      part.textContent = crumb
      crumbs.append(part)
    })

    const hint = document.createElement("div")
    hint.className = "hint"
    hint.textContent = "↑↓ walk · click copy · ⇧ path · ⌥ name · esc exit"

    this.label.replaceChildren(head, crumbs, hint)
    this.label.style.display = "block"
  }

  private placeLabel(rect: DOMRect): void {
    const { offsetWidth: width, offsetHeight: height } = this.label
    const below = rect.bottom + MARGIN
    const above = rect.top - MARGIN - height
    let top = below + height <= window.innerHeight ? below : above >= 0 ? above : MARGIN
    if (top < MARGIN) top = MARGIN
    const left = Math.min(Math.max(rect.left, MARGIN), Math.max(MARGIN, window.innerWidth - width - MARGIN))
    this.label.style.left = `${left}px`
    this.label.style.top = `${top}px`
  }
}
