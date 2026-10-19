/** Match patterns granted at install (must mirror `host_permissions`). */
export const BUILT_IN_ORIGINS = ["*://localhost/*", "*://*.localhost/*", "*://127.0.0.1/*"]

/** `host` (hostname[:port], lowercase) → path prefix prepended to copied paths. */
export type PathPrefixes = Record<string, string>

const PREFIXES_KEY = "pathPrefixes"

/** Chrome match patterns ignore ports, so one pattern covers every dev server on a host. */
export function originPatternForHost(hostname: string): string {
  return `*://${hostname.toLowerCase()}/*`
}

export function hostnameFromPattern(pattern: string): string | null {
  return /^\*:\/\/([^/]+)\/\*$/.exec(pattern)?.[1] ?? null
}

export function isValidHostname(value: string): boolean {
  return /^(?=.{1,253}$)(?!-)[a-z0-9-]+(?:\.[a-z0-9-]+)*$/i.test(value) || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)
}

export function isValidHost(value: string): boolean {
  const [hostname, port, ...rest] = value.split(":")
  if (rest.length > 0 || !hostname || !isValidHostname(hostname)) return false
  return port === undefined || /^\d{1,5}$/.test(port)
}

export function normalizePathPrefix(value: string): string {
  const trimmed = value.trim().replace(/\\/g, "/").replace(/^\.?\/+/, "")
  return trimmed ? trimmed.replace(/\/*$/, "/") : ""
}

export async function getPathPrefixes(): Promise<PathPrefixes> {
  const stored = await chrome.storage.local.get(PREFIXES_KEY)
  const value = stored[PREFIXES_KEY]
  return value && typeof value === "object" ? (value as PathPrefixes) : {}
}

export async function setPathPrefix(host: string, prefix: string): Promise<void> {
  const prefixes = await getPathPrefixes()
  prefixes[host.toLowerCase()] = prefix
  await chrome.storage.local.set({ [PREFIXES_KEY]: prefixes })
}

export async function removePathPrefix(host: string): Promise<void> {
  const prefixes = await getPathPrefixes()
  delete prefixes[host.toLowerCase()]
  await chrome.storage.local.set({ [PREFIXES_KEY]: prefixes })
}

/** Optional host permissions the user granted beyond the built-in dev hosts. */
export async function getEnabledOrigins(): Promise<string[]> {
  const { origins = [] } = await chrome.permissions.getAll()
  return origins.filter((origin) => !BUILT_IN_ORIGINS.includes(origin)).sort()
}
