import { closestFiber } from "../lib/fiber"
import { copyModeForEvent, formatCopy, formatLocation, type CopyMode } from "../lib/reference"
import type { ComponentResolver, ResolvedComponent } from "../lib/resolve"
import { componentRect, inspectElement, selectableComponents, type Inspection } from "./inspect"
import type { Overlay } from "./overlay"

export interface PickerOptions {
  overlay: Overlay
  resolver: ComponentResolver
  pathPrefix: () => string | undefined
  copy: (text: string) => Promise<boolean>
}

const BLOCKED_EVENTS = ["pointerdown", "pointerup", "mousedown", "mouseup", "dblclick", "auxclick", "contextmenu"]
const CURSOR_STYLE_ID = "react-component-copier-cursor"

/** Copy feedback shared by the picker and the context menu. */
export async function copyComponent(
  options: PickerOptions,
  component: ResolvedComponent | undefined,
  mode: CopyMode,
): Promise<void> {
  if (!component) {
    options.overlay.toast("No React component found for this element", { error: true })
    return
  }
  const text = formatCopy(mode, component.entry.name, component.usage, options.pathPrefix())
  const copied = await options.copy(text)
  if (copied) options.overlay.toast(`Copied ${text}`)
  else options.overlay.toast("Could not write to the clipboard", { error: true })
}

export class Picker {
  private active = false
  private inspection: Inspection | null = null
  private components: ResolvedComponent[] | null = null
  /** Index into the selectable components, 0 = nearest to the element. */
  private selected = 0
  private generation = 0
  private frame = 0
  private pointer: { x: number; y: number } | null = null

  constructor(private readonly options: PickerOptions) {}

  get isActive(): boolean {
    return this.active
  }

  toggle(): void {
    if (this.active) this.stop()
    else this.start()
  }

  start(): void {
    if (this.active) return
    this.active = true
    window.addEventListener("pointermove", this.onPointerMove, true)
    window.addEventListener("click", this.onClick, true)
    window.addEventListener("keydown", this.onKeyDown, true)
    window.addEventListener("scroll", this.onViewportChange, true)
    window.addEventListener("resize", this.onViewportChange)
    for (const type of BLOCKED_EVENTS) window.addEventListener(type, this.block, true)

    const style = document.createElement("style")
    style.id = CURSOR_STYLE_ID
    style.textContent = "*, *::before, *::after { cursor: crosshair !important; }"
    document.documentElement.append(style)
  }

  stop(): void {
    if (!this.active) return
    this.active = false
    this.generation++
    cancelAnimationFrame(this.frame)
    window.removeEventListener("pointermove", this.onPointerMove, true)
    window.removeEventListener("click", this.onClick, true)
    window.removeEventListener("keydown", this.onKeyDown, true)
    window.removeEventListener("scroll", this.onViewportChange, true)
    window.removeEventListener("resize", this.onViewportChange)
    for (const type of BLOCKED_EVENTS) window.removeEventListener(type, this.block, true)
    document.getElementById(CURSOR_STYLE_ID)?.remove()
    this.inspection = null
    this.components = null
    this.options.overlay.hide()
  }

  private targetAt(event: Event): Element | null {
    for (const node of event.composedPath()) {
      if (!(node instanceof Element)) continue
      if (this.options.overlay.isOverlayNode(node)) return null
      return node
    }
    return null
  }

  private inspect(element: Element): void {
    if (this.inspection && closestFiber(element)?.fiber === this.inspection.host) return
    const inspection = inspectElement(element, this.options.resolver)
    const generation = ++this.generation
    this.inspection = inspection
    this.components = null
    this.selected = 0
    if (!inspection) {
      this.options.overlay.hide()
      return
    }
    this.render()
    void inspection.components.then((components) => {
      if (generation !== this.generation) return
      this.components = components
      this.render()
    })
  }

  private selectable(): ResolvedComponent[] {
    return this.components ? selectableComponents(this.components) : []
  }

  private render(): void {
    const inspection = this.inspection
    if (!inspection) return
    const selectable = this.selectable()
    const component = selectable[this.selected]

    if (!component) {
      this.options.overlay.show(inspection.element.getBoundingClientRect(), {
        name: this.components ? "No component" : "Resolving…",
        environment: "client",
        location: this.components ? "this element isn't rendered by a component" : "",
        locationMissing: true,
        breadcrumb: [],
        current: 0,
      })
      return
    }

    const location = formatLocation(component.usage, this.options.pathPrefix())
    const breadcrumb = selectable.map((entry) => entry.entry.name).reverse()
    this.options.overlay.show(componentRect(component, inspection), {
      name: component.entry.name,
      environment: component.entry.environment,
      location: location ?? "path unavailable",
      locationMissing: location === null,
      breadcrumb,
      current: breadcrumb.length - 1 - this.selected,
    })
  }

  private async copy(mode: CopyMode): Promise<void> {
    const inspection = this.inspection
    if (!inspection) return
    const selected = this.selected
    const components = selectableComponents(await inspection.components)
    this.stop()
    await copyComponent(this.options, components[selected] ?? components[0], mode)
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    this.pointer = { x: event.clientX, y: event.clientY }
    const target = this.targetAt(event)
    cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(() => {
      if (target && this.active) this.inspect(target)
    })
  }

  private readonly onClick = (event: MouseEvent): void => {
    this.block(event)
    if (event.button !== 0) return
    const target = this.targetAt(event)
    if (target) this.inspect(target)
    void this.copy(copyModeForEvent(event))
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const count = this.selectable().length
    if (event.key === "Escape") this.stop()
    else if (event.key === "ArrowUp") this.selected = Math.min(this.selected + 1, Math.max(count - 1, 0))
    else if (event.key === "ArrowDown") this.selected = Math.max(this.selected - 1, 0)
    else if (event.key === "Enter") void this.copy(copyModeForEvent(event))
    else return
    this.block(event)
    if (event.key.startsWith("Arrow")) this.render()
  }

  private readonly onViewportChange = (): void => {
    cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(() => {
      if (!this.active) return
      if (this.pointer) {
        const element = document.elementFromPoint(this.pointer.x, this.pointer.y)
        if (element && !this.options.overlay.isOverlayNode(element)) this.inspect(element)
      }
      this.render()
    })
  }

  private readonly block = (event: Event): void => {
    event.preventDefault()
    event.stopImmediatePropagation()
  }
}
