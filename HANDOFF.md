# Handoff: React Component Copier (Chromium MV3 extension)

Workspace: `/Users/gioshara/.t3/scratch/2026-10-19-browser-extension-that-lets-you-03e385c9`
Inspiration (tooling/layout copied from): `~/.t3/projects/github-vscode-file-opener-extension/`

## Goal

Pick an element on a React **development** build and copy a reference to the component that renders it, e.g.
`PayButton (app/checkout/page.client.tsx:70-80)`, to paste into an AI prompt.

## Product decisions (agreed with the user)

1. **Scope: dev builds only.** `localhost`, `*.localhost`, `127.0.0.1` (any port) work out of the box; other hosts (staging, `*.test`) are added by the user. Production sites are out of scope because names are minified.
2. **Entry points: in-page picker + right-click menu.** No DevTools sidebar pane (React DevTools already covers that).
3. **File path resolved at runtime, zero per-project setup.** React 19: read `_debugStack` on fibers and map the frame through the dev server's source maps. React 18: read `_debugSource`. No Babel/SWC/Vite plugin. If resolution fails, copy the name only ("path unavailable"), never break.
4. **Which component:** default to the nearest component defined in the user's own code (not `node_modules`; monorepo packages count as own code). ↑/↓ walks the owner chain in the picker. The right-click menu always uses the default.
5. **Path = usage site, not definition.** The location where the component's JSX is written in its parent, with the full line range of the JSX element (`:70-80`). The end line comes from scanning `sourcesContent` in the source map. Falls back to a single line (`:70`) if the end can't be found.
6. **Path root:** normalize each bundler's prefix automatically (Turbopack `turbopack:///[project]/`, webpack `webpack://_N_E/./`, `webpack-internal:///`, Vite same-origin and `/@fs/`). Optional **per-host path prefix** in settings (e.g. `localhost:3000` → `apps/web/`) so monorepo paths are repo-root relative. No leading `/` (agents read it as an absolute path).
7. **Clipboard formats:** click/Enter = `Name (path:range)`; Shift-click = path only; Alt-click = name only. Right-click menu has the same three in a submenu. No path → name only. No template system.
8. **Activation:** `Alt+Shift+C` (`⌥⇧C`) or the toolbar icon toggles the picker (rebindable at `chrome://extensions/shortcuts`). Settings live under the icon's right-click → Options. On a non-enabled host, an in-page prompt asks to enable it, Chrome requests that host's permission only, then the picker starts. Pages without React dev build → toast "No React dev build detected on this page".
9. **Picker UI:** outline = bounding box of all DOM nodes the selected component renders (grows on ↑). Label shows name + path, and a breadcrumb of own components (library components hidden from breadcrumb and from the ↑/↓ walk). After copying: toast "Copied …", picker exits. Escape cancels. Overlay in a closed Shadow DOM; never blocks clicks after exit.
10. **React Server Components included, best effort.** Names/stacks from `_debugInfo`; frames under `rsc://React/Server/…` or `about://React/Server/…` resolved via Next's `/__nextjs_source-map` dev endpoint. Tagged "server" in the UI. Failure degrades to client-only behavior.
11. **Chromium only** (Chrome, Edge, Brave, Arc). Firefox out of scope for v1.

User's projects are mostly React 19 + Next.js 15/16 (App Router, Turbopack), some Vite and CRA.

## Implementation decisions made while building

- **Stack:** MV3, TypeScript, Vite (options + enable pages), esbuild-style bundling for content/background scripts, Vitest + happy-dom, `@jridgewell/trace-mapping` for source maps, Playwright for e2e.
- **Two content scripts:** `src/main-world.ts` runs in the page's MAIN world to read React internals; `src/bridge.ts` runs in the isolated world for clipboard, storage and runtime messages. `src/background.ts` handles activation, the enable-host flow, dynamically registered scripts for user-added hosts, and the context menu.
- **Enable-host prompt** is an extension page (`enable.html`) shown in an iframe, because `chrome.permissions.request` needs an extension context + user gesture. Host permissions: built-in dev hosts in `host_permissions`, everything else via `optional_host_permissions: ["*://*/*"]`. Match patterns ignore ports, so enabling a hostname covers all its ports. Path prefixes are keyed by `hostname:port` in `chrome.storage.local` (`pathPrefixes`).
- **Owner chain, not parent tree** (`src/lib/fiber.ts`): same chain React DevTools shows; a component passed as `children` belongs to whoever wrote its JSX.
- **Library detection by evidence** (`src/lib/resolve.ts`): a component is "own code" if the elements *its render function created* map to a non-library file. Elements a component merely clones (Radix `Slot`) keep the creator's stack, so only frames whose function name matches the component's render function count. This is what skips `Slot`/`Primitive.*`. Also honors the source map `ignoreList`.
- **Call-site frame:** the first frame after React's JSX runtime frame in `_debugStack` (`src/lib/stack.ts`).
- **Source map loading** (`src/lib/source-maps.ts`): same-origin scripts via `sourceMappingURL` (inline `data:` for Vite, `.js.map` for Turbopack, `/_next/static/…js.map` fallback); `file://` server chunks and `webpack-internal://` via `/__nextjs_source-map?filename=`.
- **Project root learning** (`src/lib/source-path.ts`, `ProjectRoots`): absolute paths are relativized against learned roots (dir containing `/node_modules/` or `/.next/`, or derived from an absolute/relative pair). Shortest root wins, so pnpm/npm workspaces resolve to the repo root (e.g. `apps/web/app/...`).
- **Monorepo fix (last change):** Server Component source maps alone don't reveal the root, so a fresh page inspecting a Server Component first produced `app/checkout/page.tsx` instead of `apps/web/app/checkout/page.tsx`. Fix: before looking up a frame, also load the source map of React's JSX runtime frame from the same stack (it always lists `node_modules` paths), which pins the root. The e2e suite was reordered so the Server Component check runs first on a fresh page to cover this.

## Verification status

- `pnpm test`: 32 unit tests pass (stack parsing incl. Next.js 15 Turbopack/webpack Server Component frames, path normalization, JSX range scanner, fiber chain, resolver compiling real TSX with esbuild and reproducing the Radix `Slot` clone case). The clone test was mutation-checked: disabling the ownership check makes it fail.
- `pnpm typecheck`: clean.
- `pnpm test:e2e` (`e2e/run.js`, real Chrome with the built extension): all 13 checks pass against Next.js 16 Turbopack (`playground/next-app`, 3311), Next.js 16 webpack (`playground/next-webpack`, 3313), the pnpm monorepo (`playground/mono`, 3314, `NEXT_APP_DIR=apps/web/`), Next.js 15.5 + React 19.1 on both Turbopack and webpack (`playground/next15`, 3315), and Vite (`playground/vite-app`, 3312). How to start each server is in the header of `e2e/run.js`.
  ```
  pnpm build
  CHROME_PATH="$HOME/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" \
    NEXT_URL=http://localhost:3314 NEXT_APP_DIR=apps/web/ node e2e/run.js
  ```
- Docs: `CONTEXT.md` (domain language) and `docs/adr/0001-runtime-source-map-resolution.md`.

## Still to do

Nothing from the original list. Ideas beyond v1: React 18 / CRA e2e playground (`_debugSource` path is only unit-covered), README with install instructions.
