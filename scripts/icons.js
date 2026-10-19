import { execFileSync } from "node:child_process"
import { mkdirSync } from "node:fs"

// Requires rsvg-convert (brew install librsvg). Output is committed.
mkdirSync("public/icons", { recursive: true })
for (const size of [16, 32, 48, 128]) {
  execFileSync("rsvg-convert", ["-w", String(size), "-h", String(size), "assets/icon.svg", "-o", `public/icons/icon-${size}.png`])
}
