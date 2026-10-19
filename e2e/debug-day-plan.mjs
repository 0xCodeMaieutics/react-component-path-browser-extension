import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { chromium } from "playwright"

const extension = resolve("build")
const url = process.env.LIFE_URL ?? "http://localhost:3000/day-plan?date=2026-10-19"

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "rcc-debug-")), {
  executablePath: process.env.CHROME_PATH,
  headless: process.env.HEADED !== "1",
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  viewport: { width: 1280, height: 800 },
})
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"))
const page = context.pages()[0] ?? (await context.newPage())
await page.goto(url, { waitUntil: "networkidle" })

const probe = await page.evaluate(() => {
  const date = document.querySelector("main input[type=date]")
  const buttons = [...document.querySelectorAll("main button")]
  function fiberKeys(el) {
    if (!el) return []
    return Object.keys(el).filter((k) => k.startsWith("__reactFiber"))
  }
  function devBuild(el) {
    if (!el) return null
    const key = fiberKeys(el)[0]
    if (!key) return false
    const fiber = el[key]
    return "_debugOwner" in fiber || "_debugSource" in fiber || "_debugStack" in fiber
  }
  return {
    date: date ? { tag: date.tagName, fiberKeys: fiberKeys(date), dev: devBuild(date) } : null,
    buttons: buttons.slice(0, 3).map((b, i) => ({
      i,
      fiberKeys: fiberKeys(b),
      dev: devBuild(b),
      rect: b.getBoundingClientRect(),
    })),
    reactHook: typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__ !== "undefined",
    copier: window.__reactComponentCopier === true,
  }
})
console.log("DOM probe:", JSON.stringify(probe, null, 2))

await worker.evaluate(async () => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  await chrome.tabs.sendMessage(tab.id, { type: "toggle-picker" })
})
await page.waitForTimeout(500)

const dateBox = await page.locator("main input[type=date]").boundingBox()
const btnBox = await page.locator("main button").first().boundingBox()
for (const [name, box] of [["date", dateBox], ["button", btnBox]]) {
  if (!box) continue
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y, { steps: 3 })
  await page.waitForTimeout(800)
  const stack = await page.evaluate(
    ({ x, y }) => {
      const stack = document.elementsFromPoint(x, y).filter((n) => n instanceof Element).map((el) => el.tagName)
      const first = document.elementsFromPoint(x, y)[0]
      const keys = first && first instanceof Element ? Object.keys(first).filter((k) => k.startsWith("__reactFiber")) : []
      const overlay = document.querySelector("[data-react-component-copier]")
      return { stack: stack.slice(0, 8), fiberOnTop: keys.length > 0, overlayHost: !!overlay }
    },
    { x, y },
  )
  const label = await page.evaluate(() => {
    const host = document.querySelector("[data-react-component-copier]")
    if (!host?.shadowRoot) return host ? "host-no-open-shadow" : "no-host"
    return null
  })
  console.log(`hover ${name} @ ${x.toFixed(0)},${y.toFixed(0)}:`, stack, "closedShadow:", label)
}

await page.screenshot({ path: "e2e/.artifacts/day-plan-debug.png", fullPage: false })
await context.close()
