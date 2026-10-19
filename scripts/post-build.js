import { copyFileSync } from "node:fs"
import { build } from "esbuild"

// Content scripts and the service worker are bundled outside Vite so the
// manifest can reference single self-contained files in build/.
copyFileSync("manifest.json", "build/manifest.json")

await build({
  entryPoints: {
    "main-world": "src/main-world.ts",
    bridge: "src/bridge.ts",
    background: "src/background.ts",
  },
  outdir: "build",
  bundle: true,
  format: "iife",
  target: "chrome120",
  minify: true,
})
