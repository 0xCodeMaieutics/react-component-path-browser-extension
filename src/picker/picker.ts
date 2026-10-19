import { preferHostIntrinsicUsage } from "../lib/element-usage"
import { closestFiber } from "../lib/fiber"
import { copyModeForEvent, formatCopy, formatLocation, type CopyMode } from "../lib/reference"
import type { ComponentResolver, ResolvedComponent, SourceLocation } from "../lib/resolve"
import { componentRect, inspectElement, selectableComponents, type Inspection } from "./inspect"
import type { Overlay } from "./overlay"
import { pickTargetAtPoint, pickTargetFromEvent } from "./pick-target"

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
  usage?: SourceLocation | null,
): Promise<void> {
  if (!component) {
    options.overlay.toast("No React component found for this element", { error: true })
    return
  }
  const location = usage === undefined ? component.usage : usage
  const text = formatCopy(mode, component.entry.name, location, options.pathPrefix())
  const copied = await options.copy(text)
  if (copied) options.overlay.toast(`Copied ${text}`)
  else options.overlay.toast("Could not write to the clipboard", { error: true })
}

export class Picker {
  private active = false
  private inspection: Inspection | null = null
  private components: ResolvedComponent[] | null = null
  private hostUsage: SourceLocation | null = null
  /** Index into the selectable components, 0 = nearest to the element. */
  private selected = 0
  private generation = 0
  private frame = 0
  private probeFrame = 0
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
    window.addEventListener("mousemove", this.onPointerMove, true)
    window.addEventListener("click", this.onClick, true)
    window.addEventListener("keydown", this.onKeyDown, true)
    window.addEventListener("scroll", this.onViewportChange, true)
    window.addEventListener("resize", this.onViewportChange)
    for (const type of BLOCKED_EVENTS) window.addEventListener(type, this.block, true)

    const style = document.createElement("style")
    style.id = CURSOR_STYLE_ID
    style.textContent = "*, *::before, *::after { cursor: crosshair !important; }"
    document.documentElement.append(style)
    const last = (window as unknown as { __rccLastPointer?: { x: number; y: number } }).__rccLastPointer
    if (last) this.pointer = last
    this.probeAtPointer()
    this.scheduleProbe()
  }

  stop(): void {
    if (!this.active) return
    this.active = false
    this.generation++
    cancelAnimationFrame(this.frame)
    cancelAnimationFrame(this.probeFrame)
    window.removeEventListener("pointermove", this.onPointerMove, true)
    window.removeEventListener("mousemove", this.onPointerMove, true)
    window.removeEventListener("click", this.onClick, true)
    window.removeEventListener("keydown", this.onKeyDown, true)
    window.removeEventListener("scroll", this.onViewportChange, true)
    window.removeEventListener("resize", this.onViewportChange)
    for (const type of BLOCKED_EVENTS) window.removeEventListener(type, this.block, true)
    document.getElementById(CURSOR_STYLE_ID)?.remove()
    this.inspection = null
    this.components = null
    this.hostUsage = null
    this.options.overlay.hide()
  }

  private blocked(element: Element): boolean {
    return this.options.overlay.isOverlayNode(element)
  }

  private targetAt(event: Event): Element | null {
    if (event instanceof MouseEvent) {
      const atPoint = pickTargetAtPoint(event.clientX, event.clientY, (element) => this.blocked(element))
      if (atPoint) return atPoint
    } else if (this.pointer) {
      const atPoint = pickTargetAtPoint(this.pointer.x, this.pointer.y, (element) => this.blocked(element))
      if (atPoint) return atPoint
    }
    return pickTargetFromEvent(event, (element) => this.blocked(element))
  }

  private inspect(element: Element): void {
    const found = closestFiber(element)
    if (!found) {
      this.inspection = null
      this.components = null
      this.options.overlay.hide()
      return
    }
    if (this.inspection && found.fiber === this.inspection.host) return
    const inspection = inspectElement(found.element, this.options.resolver)
    const generation = ++this.generation
    this.inspection = inspection
    this.components = null
    this.hostUsage = null
    this.selected = 0
    if (!inspection) {
      this.options.overlay.hide()
      return
    }
    this.render()
    void Promise.all([inspection.components, inspection.hostUsage]).then(([components, hostUsage]) => {
      if (generation !== this.generation) return
      this.components = components
      this.hostUsage = hostUsage
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

    const usage = preferHostIntrinsicUsage(inspection.host, component.usage, this.hostUsage)
    const location = formatLocation(usage, this.options.pathPrefix())
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
    const [components, hostUsage] = await Promise.all([inspection.components, inspection.hostUsage])
    const picked = selectableComponents(components)[selected] ?? selectableComponents(components)[0]
    const usage = picked ? preferHostIntrinsicUsage(inspection.host, picked.usage, hostUsage) : null
    this.stop()
    await copyComponent(this.options, picked, mode, usage)
  }

  private probeAtPointer(): void {
    if (!this.pointer) return
    const element = pickTargetAtPoint(this.pointer.x, this.pointer.y, (el) => this.blocked(el))
    if (element) this.inspect(element)
  }

  private scheduleProbe(): void {
    cancelAnimationFrame(this.probeFrame)
    this.probeFrame = requestAnimationFrame(() => {
      if (!this.active) return
      this.probeAtPointer()
      this.scheduleProbe()
    })
  }

  private readonly onPointerMove = (event: MouseEvent): void => {
    this.pointer = { x: event.clientX, y: event.clientY }
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
        const element = pickTargetAtPoint(this.pointer.x, this.pointer.y, (el) => this.blocked(el))
        if (element) this.inspect(element)
      }
      this.render()
    })
  }

  private readonly block = (event: Event): void => {
    event.preventDefault()
    event.stopImmediatePropagation()
  }
}
