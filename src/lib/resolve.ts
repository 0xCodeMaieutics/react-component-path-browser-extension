import type { ComponentEntry, SourceHint } from "./fiber"
import { jsxElementEndLine } from "./jsx-range"
import { SourceMapStore, type Fetcher } from "./source-maps"
import { ProjectRoots, isLibraryPath, isLibraryUrl, toSourcePath, type SourcePath } from "./source-path"
import { callSiteFrame, normalizeFunctionName, runtimeFrame, unwrapEnvironmentUrl, type StackFrame } from "./stack"

export interface SourceLocation {
  path: SourcePath
  line: number
  /** Last line of the JSX element when it spans several lines. */
  endLine?: number
  isLibrary: boolean
}

export interface ResolvedComponent {
  entry: ComponentEntry
  /** Where this component's JSX is written; null when it can't be determined. */
  usage: SourceLocation | null
  /** Defined in a dependency (or nowhere we can see) rather than the app. */
  isLibrary: boolean
}

export class ComponentResolver {
  readonly roots = new ProjectRoots()
  private readonly maps: SourceMapStore
  private readonly frames = new Map<string, Promise<SourceLocation | null>>()

  constructor(private readonly origin: string, fetcher?: Fetcher) {
    this.maps = new SourceMapStore(origin, fetcher, (sources) => {
      for (const source of sources) if (source) toSourcePath(source, origin, this.roots)
    })
  }

  async resolveChain(chain: ComponentEntry[]): Promise<ResolvedComponent[]> {
    const chainFunctionNames = new Set(chain.map((entry) => entry.functionName).filter(Boolean))
    return Promise.all(chain.map((entry) => this.resolveEntry(entry, chainFunctionNames)))
  }

  private async resolveEntry(entry: ComponentEntry, chainFunctionNames: Set<string>): Promise<ResolvedComponent> {
    const [usage, isLibrary] = await Promise.all([
      entry.usage ? this.resolveHint(entry.usage) : null,
      this.isLibraryComponent(entry, chainFunctionNames),
    ])
    return { entry, usage, isLibrary }
  }

  /**
   * A component's definition is wherever the elements it rendered were
   * written. Elements it merely cloned (e.g. Radix `Slot`) keep the stack of
   * the component that wrote them, so only frames running this component's
   * render function count as evidence.
   */
  private async isLibraryComponent(entry: ComponentEntry, chainFunctionNames: Set<string>): Promise<boolean> {
    for (const hint of entry.evidence) {
      if (hint.kind === "source") {
        const location = await this.resolveHint(hint)
        return location ? location.isLibrary : true
      }
      const frame = callSiteFrame(hint.stack)
      if (!frame) continue
      const name = normalizeFunctionName(frame.functionName)
      const ownsFrame = entry.functionName ? name === entry.functionName : !chainFunctionNames.has(name)
      if (!ownsFrame) continue
      const location = await this.resolveFrame(frame, runtimeFrame(hint.stack))
      return location ? location.isLibrary : isLibraryUrl(frame.url)
    }
    return true
  }

  resolveHint(hint: SourceHint): Promise<SourceLocation | null> {
    if (hint.kind === "source") {
      const path = toSourcePath(hint.source.fileName, this.origin, this.roots)
      return Promise.resolve({ path, line: hint.source.lineNumber, isLibrary: isLibraryPath(path.path) })
    }
    const frame = callSiteFrame(hint.stack)
    return frame ? this.resolveFrame(frame, runtimeFrame(hint.stack)) : Promise.resolve(null)
  }

  /**
   * `runtime` is React's JSX runtime frame from the same stack. Its source map
   * always lists `node_modules` paths, so loading it first pins the project
   * root before any absolute path is relativized (Server Component maps alone
   * don't reveal it).
   */
  private resolveFrame(frame: StackFrame, runtime: StackFrame | null): Promise<SourceLocation | null> {
    const key = `${frame.url}:${frame.line}:${frame.column}`
    let pending = this.frames.get(key)
    if (!pending) {
      pending = (runtime ? this.maps.load(unwrapEnvironmentUrl(runtime.url)) : Promise.resolve(null))
        .then(() => this.lookupFrame(frame))
        .catch(() => null)
      this.frames.set(key, pending)
    }
    return pending
  }

  private async lookupFrame(frame: StackFrame): Promise<SourceLocation | null> {
    const scriptUrl = unwrapEnvironmentUrl(frame.url)
    if (scriptUrl.startsWith("file://")) toSourcePath(scriptUrl, this.origin, this.roots)
    const original = await this.maps.originalPosition(scriptUrl, frame.line, frame.column)
    if (!original) return null

    const scriptPath = toSourcePath(scriptUrl, this.origin)
    const sourcePath = toSourcePath(original.source, this.origin)
    if (sourcePath.absolute && !scriptPath.absolute) this.roots.learnFromPair(sourcePath.path, scriptPath.path)
    const path = toSourcePath(original.source, this.origin, this.roots)
    const endLine = original.content ? jsxElementEndLine(original.content, original.line, original.column) : null
    return {
      path,
      line: original.line,
      endLine: endLine !== null && endLine > original.line ? endLine : undefined,
      isLibrary: original.ignored || isLibraryPath(path.path),
    }
  }
}

/** Index of the nearest component defined in the app's own code, or 0. */
export function defaultSelection(components: ResolvedComponent[]): number {
  const index = components.findIndex((component) => !component.isLibrary)
  return index < 0 ? 0 : index
}
