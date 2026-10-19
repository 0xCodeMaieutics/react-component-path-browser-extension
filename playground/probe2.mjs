import { chromium } from "playwright"

const url = process.argv[2] ?? "http://localhost:3311/checkout"
const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
})
const page = await browser.newPage()
await page.goto(url, { waitUntil: "networkidle" })
const result = await page.evaluate(async () => {
  const fiberOf = (el) => el[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))]
  const main = fiberOf(document.querySelector("#server-heading"))
  const info = main._debugOwner
  const out = {
    headingStack: main._debugStack?.stack.split("\n").slice(0, 4),
    infoKeys: Object.keys(info),
    infoOwner: info.owner && Object.keys(info.owner),
    infoDebugLocation: info.debugLocation?.stack?.split("\n").slice(0, 5),
    infoDebugStack: info.debugStack?.stack?.split("\n").slice(0, 5),
    infoStack: typeof info.stack === "string" ? info.stack.slice(0, 400) : typeof info.stack,
    summaryOwner: fiberOf(document.querySelector("#summary"))._debugOwner?.name,
    summaryStack: fiberOf(document.querySelector("#summary"))._debugStack?.stack.split("\n").slice(0, 3),
  }
  const clientFrame = /\((http:\/\/[^)]+?):(\d+):(\d+)\)/.exec(fiberOf(document.querySelector("#pay-link"))._debugStack.stack.split("\n")[2])
  const chunkUrl = clientFrame[1]
  const chunk = await (await fetch(chunkUrl)).text()
  out.chunkTail = chunk.slice(-200)
  const map = await (await fetch(chunkUrl + ".map")).json()
  out.clientMap = { keys: Object.keys(map), sections: map.sections?.length, firstSection: map.sections?.[0] && { offset: map.sections[0].offset, keys: Object.keys(map.sections[0].map), sources: map.sections.map((s) => s.map.sources).flat().slice(0, 10), hasContent: map.sections.some((s) => s.map.sourcesContent?.length) } }
  const serverFrame = /\((about:\/\/React\/[^/]+\/)(file:\/\/\/[^)?]+)\?\d+:(\d+):(\d+)\)/.exec(main._debugStack.stack)
  if (serverFrame) {
    const res = await fetch("/__nextjs_source-map?filename=" + encodeURIComponent(serverFrame[2]))
    out.serverStatus = res.status
    const smap = await res.json().catch(() => null)
    out.serverMap = smap && { keys: Object.keys(smap), sections: smap.sections?.length, sources: (smap.sections ? smap.sections.map((s) => s.map.sources).flat() : smap.sources).slice(0, 10) }
  }
  return out
})
console.log(JSON.stringify(result, null, 2))
await browser.close()
