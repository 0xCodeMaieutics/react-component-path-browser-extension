// End-to-end check against the playground dev servers with the built
// extension loaded. Start them first:
//   (cd playground/next-app && pnpm dev --port 3311)
//   (cd playground/vite-app && pnpm dev --port 3312)
// then: pnpm build && pnpm test:e2e
// Other Next.js playgrounds run the same checks via NEXT_URL (and NEXT_APP_DIR):
//   (cd playground/next-webpack && pnpm dev --webpack --port 3313)
//   (cd playground/mono/apps/web && pnpm dev --port 3314)   NEXT_APP_DIR=apps/web/
//   (cd playground/next15 && pnpm dev [--turbopack] --port 3315)
import { mkdirSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { chromium } from "playwright"

const NEXT = process.env.NEXT_URL ?? "http://localhost:3311"
const VITE = process.env.VITE_URL ?? "http://localhost:3312"
// Expected path prefix of the Next.js app inside its repository, e.g. "apps/web/" for a monorepo.
const APP = process.env.NEXT_APP_DIR ?? ""
const extension = resolve("build")
const artifacts = resolve("e2e/.artifacts")
mkdirSync(artifacts, { recursive: true })

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "rcc-e2e-")), {
  executablePath: process.env.CHROME_PATH,
  headless: process.env.HEADED !== "1",
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  viewport: { width: 1280, height: 800 },
})
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"))

let failures = 0
async function check(name, run) {
  try {
    await run()
    console.log(`  ✓ ${name}`)
  } catch (error) {
    failures++
    console.log(`  ✗ ${name}\n    ${error.message}`)
  }
}

function expectEqual(actual, expected) {
  if (actual !== expected) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

async function sendToActiveTab(message) {
  await worker.evaluate(async (message) => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    await chrome.tabs.sendMessage(tab.id, message)
  }, message)
}

async function openPage(url) {
  const page = context.pages()[0] ?? (await context.newPage())
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(url).origin })
  await page.goto(url, { waitUntil: "networkidle" })
  await page.bringToFront()
  await page.evaluate(() => navigator.clipboard.writeText(""))
  return page
}

async function clipboard(page) {
  await page.waitForFunction(() => navigator.clipboard.readText().then((text) => text !== ""), null, { timeout: 8000 })
  return page.evaluate(() => navigator.clipboard.readText())
}

async function pick(page, selector, { keys = [], modifiers = [], screenshot } = {}) {
  await page.evaluate(() => navigator.clipboard.writeText(""))
  await sendToActiveTab({ type: "toggle-picker" })
  const box = await page.locator(selector).boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 })
  await page.waitForTimeout(1500)
  for (const key of keys) await page.keyboard.press(key)
  if (screenshot) await page.screenshot({ path: join(artifacts, screenshot) })
  for (const modifier of modifiers) await page.keyboard.down(modifier)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  for (const modifier of modifiers) await page.keyboard.up(modifier)
  return clipboard(page)
}

console.log(`Next.js App Router (${NEXT})`)
let page = await openPage(`${NEXT}/checkout`)
// First on a fresh page: Server Component maps alone don't reveal the project root.
await check("Server Components are inspectable", async () => {
  expectEqual(await pick(page, "#summary-text", { screenshot: "next-server.png" }), `OrderSummary (${APP}app/checkout/page.tsx:15)`)
})
await check("defaults to the nearest app component, skipping Radix Slot", async () => {
  expectEqual(await pick(page, "#pay-link", { screenshot: "next-default.png" }), `Button (${APP}app/checkout/page.client.tsx:8-12)`)
})
await check("↑ walks to the feature component with its full JSX range", async () => {
  expectEqual(
    await pick(page, "#pay-link", { keys: ["ArrowUp"], screenshot: "next-walk.png" }),
    `PayButton (${APP}app/checkout/page.client.tsx:22-24)`,
  )
})
await check("↑↑ reaches the client component rendered by a Server Component", async () => {
  expectEqual(await pick(page, "#pay-link", { keys: ["ArrowUp", "ArrowUp"] }), `CheckoutPageClient (${APP}app/checkout/page.tsx:16)`)
})
await check("Shift-click copies only the path", async () => {
  expectEqual(await pick(page, "#plain-button", { modifiers: ["Shift"] }), `${APP}app/checkout/page.client.tsx:26`)
})
await check("Alt-click copies only the name", async () => {
  expectEqual(await pick(page, "#plain-button", { modifiers: ["Alt"] }), "Button")
})
await check("native date inputs are inspectable", async () => {
  expectEqual(await pick(page, "#plan-date"), `CheckoutPageClient (${APP}app/checkout/page.tsx:16)`)
})
await check("context menu copies the right-clicked element", async () => {
  await page.evaluate(() => navigator.clipboard.writeText(""))
  await page.locator("#plain-button").click({ button: "right" })
  await page.keyboard.press("Escape")
  await sendToActiveTab({ type: "copy-context-target", mode: "reference" })
  expectEqual(await clipboard(page), `Button (${APP}app/checkout/page.client.tsx:26)`)
})
await check("Escape exits without copying", async () => {
  await page.evaluate(() => navigator.clipboard.writeText("untouched"))
  await sendToActiveTab({ type: "toggle-picker" })
  await page.locator("#pay-link").hover()
  await page.keyboard.press("Escape")
  await page.locator("#pay-link").click()
  expectEqual(await page.evaluate(() => location.hash), "#pay")
  expectEqual(await page.evaluate(() => navigator.clipboard.readText()), "untouched")
})

console.log("Vite")
page = await openPage(VITE)
await check("component in the same file", async () => {
  expectEqual(await pick(page, "#counter", { screenshot: "vite-default.png" }), "Counter (src/App.tsx:19)")
})
await check("multi-line usage range", async () => {
  expectEqual(await pick(page, "#card-title"), "Card (src/App.tsx:16-20)")
})
await check("path prefix from settings", async () => {
  await worker.evaluate(() => chrome.storage.local.set({ pathPrefixes: { "localhost:3312": "apps/web/" } }))
  await page.waitForTimeout(200)
  expectEqual(await pick(page, "#counter", { modifiers: ["Shift"] }), "apps/web/src/App.tsx:19")
  await worker.evaluate(() => chrome.storage.local.remove("pathPrefixes"))
})

console.log("Extension pages")
// Node's URL reports origin "null" for non-special schemes like chrome-extension:.
const extensionOrigin = `chrome-extension://${new URL(worker.url()).host}`
await check("enable prompt renders for a host", async () => {
  const prompt = await context.newPage()
  await prompt.setViewportSize({ width: 380, height: 184 })
  await prompt.goto(`${extensionOrigin}/enable.html?host=staging.myapp.dev&tabId=1`)
  expectEqual(await prompt.locator("#host").textContent(), "staging.myapp.dev")
  await prompt.screenshot({ path: join(artifacts, "enable.png") })
  await prompt.close()
})
await check("options page lists prefixes and the shortcut", async () => {
  await worker.evaluate(() => chrome.storage.local.set({ pathPrefixes: { "localhost:5173": "apps/web/" } }))
  const options = await context.newPage()
  await options.goto(`${extensionOrigin}/options.html`)
  await options.locator("#prefixes code").first().waitFor()
  expectEqual(await options.locator("#prefixes code").first().textContent(), "localhost:5173")
  expectEqual(await options.locator("#shortcut").textContent(), process.platform === "darwin" ? "⌥⇧C" : "Alt+Shift+C")
  await options.screenshot({ path: join(artifacts, "options.png"), fullPage: true })
  await worker.evaluate(() => chrome.storage.local.remove("pathPrefixes"))
  await options.close()
})

await context.close()
console.log(failures === 0 ? "\nAll e2e checks passed" : `\n${failures} e2e check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
