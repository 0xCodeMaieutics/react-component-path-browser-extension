import { chromium } from "playwright"

const url = process.argv[2] ?? "http://localhost:3311/checkout"
const selector = process.argv[3] ?? "#pay-link"
const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
})
const page = await browser.newPage()
await page.goto(url, { waitUntil: "networkidle" })
const result = await page.evaluate((selector) => {
  const el = document.querySelector(selector)
  const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"))
  let fiber = el[key]
  const describe = (o) => {
    if (!o) return null
    const type = o.type
    const name =
      o.name ?? (typeof type === "function" ? type.displayName || type.name : type?.displayName ?? (typeof type === "string" ? type : type?.$$typeof?.toString()))
    const stack = o._debugStack?.stack ?? o.debugStack?.stack ?? o.stack
    return {
      kind: "tag" in o ? `fiber:${o.tag}` : "info",
      name,
      keys: Object.keys(o).filter((k) => k.startsWith("_debug") || ["env", "owner", "debugLocation", "debugTask"].includes(k)),
      stack: typeof stack === "string" ? stack.split("\n").slice(0, 5) : stack,
      debugInfo: o._debugInfo?.map((i) => ({ name: i.name, env: i.env, keys: Object.keys(i) })),
    }
  }
  const owners = []
  let o = fiber
  while (o && owners.length < 20) {
    owners.push(describe(o))
    o = o._debugOwner ?? o.owner
  }
  const returns = []
  let r = fiber
  while (r && returns.length < 40) {
    returns.push(`${r.tag}:${typeof r.type === "function" ? r.type.name : typeof r.type === "string" ? r.type : r.type?.displayName ?? ""}${r._debugInfo?.length ? " info=" + r._debugInfo.map((i) => i.name ?? i.awaited?.name ?? "?").join(",") : ""}`)
    r = r.return
  }
  return { owners, returns }
}, selector)
console.log(JSON.stringify(result, null, 2))
await browser.close()
