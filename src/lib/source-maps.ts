import { FlattenMap, isIgnored, originalPositionFor, sourceContentFor, type TraceMap } from "@jridgewell/trace-mapping"

export interface OriginalPosition {
  /** Source as listed in the map, resolved against the map URL. */
  source: string
  /** 1-based. */
  line: number
  /** 0-based. */
  column: number
  content: string | null
  /** Marked as third-party by the bundler (`ignoreList`). */
  ignored: boolean
}

export type Fetcher = (url: string) => Promise<Response>

const SOURCE_MAPPING_URL = /\/\/[#@]\s*sourceMappingURL=([^\s'"]+)\s*$/gm

function decodeDataUrl(url: string): string | null {
  const match = /^data:[^,]*?(;base64)?,(.*)$/s.exec(url)
  if (!match) return null
  if (!match[1]) return decodeURIComponent(match[2]!)
  const binary = atob(match[2]!)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function lastSourceMappingUrl(script: string): string | null {
  let last: string | null = null
  for (const match of script.matchAll(SOURCE_MAPPING_URL)) last = match[1]!
  return last
}

/**
 * Loads source maps the way the dev server exposes them: same-origin scripts
 * via their `sourceMappingURL` (inline `data:` for Vite, `<chunk>.js.map` for
 * Turbopack), anything else (Next.js server chunks under `file://`, webpack's
 * `webpack-internal://`) via Next's `/__nextjs_source-map` dev endpoint.
 */
export class SourceMapStore {
  private maps = new Map<string, Promise<TraceMap | null>>()

  constructor(
    private readonly origin: string,
    private readonly fetcher: Fetcher = (url) => fetch(url),
    private readonly onSources: (sources: readonly (string | null)[]) => void = () => {},
  ) {}

  load(scriptUrl: string): Promise<TraceMap | null> {
    let pending = this.maps.get(scriptUrl)
    if (!pending) {
      pending = this.fetchMap(scriptUrl).catch(() => null)
      this.maps.set(scriptUrl, pending)
    }
    return pending
  }

  async originalPosition(scriptUrl: string, line: number, column: number): Promise<OriginalPosition | null> {
    const map = await this.load(scriptUrl)
    if (!map) return null
    const position = originalPositionFor(map, { line, column: column - 1 })
    if (position.source === null) return null
    return {
      source: position.source,
      line: position.line,
      column: position.column,
      content: sourceContentFor(map, position.source),
      ignored: isIgnored(map, position.source),
    }
  }

  private async fetchMap(scriptUrl: string): Promise<TraceMap | null> {
    const located = scriptUrl.startsWith(this.origin + "/")
      ? await this.locateFromScript(scriptUrl)
      : { json: await this.fetchJson(this.nextSourceMapUrl(scriptUrl)), base: scriptUrl }
    if (!located?.json) return null
    const map = new FlattenMap(located.json, located.base)
    this.onSources(map.sources)
    return map
  }

  private async locateFromScript(scriptUrl: string): Promise<{ json: string | null; base: string } | null> {
    const response = await this.fetcher(scriptUrl)
    if (!response.ok) return null
    const reference = lastSourceMappingUrl(await response.text())

    if (reference?.startsWith("data:")) return { json: decodeDataUrl(reference), base: scriptUrl }
    if (reference) {
      const mapUrl = new URL(reference, scriptUrl).href
      return { json: await this.fetchJson(mapUrl), base: mapUrl }
    }
    const fallback = scriptUrl.includes("/_next/static/") ? `${scriptUrl.replace(/[?#].*$/, "")}.map` : null
    return fallback ? { json: await this.fetchJson(fallback), base: fallback } : null
  }

  private nextSourceMapUrl(filename: string): string {
    const url = new URL("/__nextjs_source-map", this.origin)
    url.searchParams.set("filename", filename)
    return url.href
  }

  private async fetchJson(url: string): Promise<string | null> {
    const response = await this.fetcher(url)
    if (!response.ok) return null
    const text = await response.text()
    return text.trimStart().startsWith("{") ? text : null
  }
}
