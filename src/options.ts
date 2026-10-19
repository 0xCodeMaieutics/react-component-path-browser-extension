import "./options.css"
import {
  getEnabledOrigins,
  getPathPrefixes,
  hostnameFromPattern,
  isValidHost,
  isValidHostname,
  normalizePathPrefix,
  originPatternForHost,
  removePathPrefix,
  setPathPrefix,
} from "./lib/hosts"

const hostsBody = document.querySelector<HTMLTableSectionElement>("#hosts")!
const hostsEmpty = document.querySelector<HTMLElement>("#hosts-empty")!
const hostForm = document.querySelector<HTMLFormElement>("#add-host")!
const hostError = document.querySelector<HTMLElement>("#host-error")!
const prefixesBody = document.querySelector<HTMLTableSectionElement>("#prefixes")!
const prefixesEmpty = document.querySelector<HTMLElement>("#prefixes-empty")!
const prefixForm = document.querySelector<HTMLFormElement>("#add-prefix")!
const prefixError = document.querySelector<HTMLElement>("#prefix-error")!

function cell(...children: (Node | string)[]): HTMLTableCellElement {
  const td = document.createElement("td")
  td.append(...children)
  return td
}

function code(text: string): HTMLElement {
  const element = document.createElement("code")
  element.textContent = text
  return element
}

function removeButton(label: string, onClick: () => Promise<unknown>): HTMLButtonElement {
  const button = document.createElement("button")
  button.type = "button"
  button.className = "danger"
  button.textContent = "Remove"
  button.setAttribute("aria-label", label)
  button.addEventListener("click", () => void onClick().then(render))
  return button
}

async function renderHosts(): Promise<void> {
  const origins = await getEnabledOrigins()
  hostsBody.replaceChildren(
    ...origins.map((origin) => {
      const row = document.createElement("tr")
      const name = hostnameFromPattern(origin) ?? origin
      row.append(
        cell(code(name)),
        cell(removeButton(`Disable ${name}`, () => chrome.permissions.remove({ origins: [origin] }))),
      )
      return row
    }),
  )
  hostsEmpty.hidden = origins.length > 0
}

async function renderPrefixes(): Promise<void> {
  const entries = Object.entries(await getPathPrefixes()).sort(([a], [b]) => a.localeCompare(b))
  prefixesBody.replaceChildren(
    ...entries.map(([host, prefix]) => {
      const row = document.createElement("tr")
      row.append(cell(code(host)), cell(code(prefix)), cell(removeButton(`Remove prefix for ${host}`, () => removePathPrefix(host))))
      return row
    }),
  )
  prefixesEmpty.hidden = entries.length > 0
}

async function render(): Promise<void> {
  await Promise.all([renderHosts(), renderPrefixes()])
}

hostForm.addEventListener("submit", async (event) => {
  event.preventDefault()
  const hostname = String(new FormData(hostForm).get("host") ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[:/].*$/, "")
  if (!isValidHostname(hostname)) {
    hostError.textContent = "Enter a hostname such as staging.myapp.dev (ports are covered automatically)."
    return
  }
  hostError.textContent = ""
  const granted = await chrome.permissions.request({ origins: [originPatternForHost(hostname)] })
  if (!granted) hostError.textContent = "Permission was not granted."
  else hostForm.reset()
  await render()
})

prefixForm.addEventListener("submit", async (event) => {
  event.preventDefault()
  const data = new FormData(prefixForm)
  const host = String(data.get("host") ?? "").trim().toLowerCase()
  const prefix = normalizePathPrefix(String(data.get("prefix") ?? ""))
  if (!isValidHost(host)) {
    prefixError.textContent = "Host must look like localhost:5173 or staging.myapp.dev."
    return
  }
  if (!prefix) {
    prefixError.textContent = "Prefix must be a relative folder such as apps/web/."
    return
  }
  prefixError.textContent = ""
  await setPathPrefix(host, prefix)
  prefixForm.reset()
  await render()
})

document.querySelector("#shortcuts-link")!.addEventListener("click", (event) => {
  event.preventDefault()
  void chrome.tabs.create({ url: "chrome://extensions/shortcuts" })
})

void chrome.commands.getAll().then((commands) => {
  const shortcut = commands.find((command) => command.name === "_execute_action")?.shortcut
  document.querySelector("#shortcut")!.textContent = shortcut || "no shortcut set"
})

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "local") void renderPrefixes()
})
chrome.permissions.onAdded.addListener(() => void renderHosts())
chrome.permissions.onRemoved.addListener(() => void renderHosts())

void render()
