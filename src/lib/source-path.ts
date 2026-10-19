const LIBRARY_PATTERNS = [/(?:^|\/)node_modules\//, /^\[turbopack\]\//, /^\[externals\]/, /^webpack\/(?:runtime|bootstrap)/]

/**
 * Absolute directories that look like project roots, learned from source
 * paths seen in source maps (the directory holding `node_modules`, or a Next.js
 * app's `.next`). The shortest match wins, so pnpm/npm workspaces resolve to
 * the repository root rather than the app.
 */
export class ProjectRoots {
  private roots = new Set<string>()

  learn(absolutePath: string): void {
    for (const marker of ["/node_modules/", "/.next/"]) {
      const index = absolutePath.indexOf(marker)
      if (index > 0) this.roots.add(absolutePath.slice(0, index + 1))
    }
  }

  /** Learn the root from a source known both by absolute and by project-relative path. */
  learnFromPair(absolutePath: string, relativePath: string): void {
    if (relativePath && absolutePath.endsWith(`/${relativePath}`)) {
      this.roots.add(absolutePath.slice(0, absolutePath.length - relativePath.length))
    }
  }

  relativize(absolutePath: string): string | null {
    let best: string | null = null
    for (const root of this.roots) {
      if (absolutePath.startsWith(root) && (best === null || root.length < best.length)) best = root
    }
    return best === null ? null : absolutePath.slice(best.length)
  }
}

export interface SourcePath {
  path: string
  /** True when `path` is an absolute filesystem path. */
  absolute: boolean
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function stripQuery(value: string): string {
  return value.replace(/[?#].*$/, "")
}

function stripDotSlash(value: string): string {
  return value.replace(/^(?:\.\/)+/, "")
}

/**
 * Turn a source-map source (or a script URL) into a display path. Handles
 * Turbopack (`file://`, `turbopack:///[project]/`), webpack
 * (`webpack://<ns>/./`, `webpack-internal:///(<layer>)/./`), and Vite (same
 * origin URLs, `/@fs/` for files outside the root).
 */
export function toSourcePath(source: string, origin: string, roots?: ProjectRoots): SourcePath {
  let value = source

  if (value.startsWith("file://")) {
    value = safeDecode(stripQuery(value.slice("file://".length)))
  } else if (value.startsWith("turbopack:///")) {
    value = safeDecode(stripQuery(value.slice("turbopack:///".length))).replace(/^\[project\]\//, "")
  } else if (value.startsWith("webpack-internal:///")) {
    value = stripDotSlash(stripQuery(value.slice("webpack-internal:///".length)).replace(/^\([^)]*\)\//, ""))
  } else if (value.startsWith("webpack://")) {
    value = stripDotSlash(stripQuery(value.slice("webpack://".length)).replace(/^[^/]*\//, ""))
  } else if (value.startsWith(origin + "/")) {
    value = safeDecode(stripQuery(value.slice(origin.length)))
    value = value.startsWith("/@fs/") ? value.slice("/@fs".length) : value.slice(1)
  }

  const absolute = value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)
  if (absolute && roots) {
    roots.learn(value)
    const relative = roots.relativize(value)
    if (relative !== null) return { path: relative, absolute: false }
  }
  return { path: value, absolute }
}

export function isLibraryPath(path: string): boolean {
  return LIBRARY_PATTERNS.some((pattern) => pattern.test(path))
}

export function isLibraryUrl(url: string): boolean {
  return /node_modules|\/_next\/static\/chunks\/[^/]*next_dist|\/\.vite\/deps\//.test(url)
}

/** Prepend a per-host prefix (e.g. `apps/web/`) to repository-relative paths. */
export function applyPathPrefix(path: SourcePath, prefix: string | undefined): string {
  const trimmed = prefix?.trim().replace(/^\/+/, "")
  if (!trimmed || path.absolute) return path.path
  return `${trimmed.replace(/\/*$/, "/")}${path.path}`
}
