# React Component Copier (browser extension)

Lets developers point at an element on a React development build and copy a reference to the component that renders it, e.g. `PayButton (app/checkout/page.client.tsx:70-80)`, for pasting into an AI prompt.

Scope: **React development builds** only (production names are minified). **Chromium-based** browsers (Chrome, Edge, Brave, Arc) for v1. Primary targets are React 19 + Next.js 15/16 (App Router, Turbopack); Vite and Create React App also work.

## Language

**Component reference**:
The text copied to the clipboard: the component's display name followed by its usage site, `Name (path:start-end)`. Variants are path only and name only. When no usage site can be resolved, every variant degrades to the bare name.
_Avoid_: Snippet, template, link, custom formats (no template system in v1)

**Usage site**:
The place in the parent's source where the component's JSX element is written, as a repository-relative path plus the line range of the whole JSX element (`:70-80`), or a single line (`:70`) when the end can't be found.
_Avoid_: Definition site, declaration, file where the component function lives

**Owner chain**:
The sequence of components that *created* the selected element, as React DevTools shows it: each step is the component whose render wrote the JSX. A component passed as `children` belongs to whoever wrote its JSX, not to the component that renders it.
_Avoid_: Parent tree, DOM ancestry, fiber `return` chain

**Own code**:
Components defined in the user's project, including monorepo workspace packages. Decided by evidence: a component is own code when the elements its render function created map to a file outside `node_modules` and not in the source map `ignoreList`. Elements a component merely clones (Radix `Slot`) don't count as its evidence.
_Avoid_: Library component, third-party component (those are the opposite)

**Default component**:
The nearest own-code component on the owner chain of the element under the cursor. The picker starts here; the context menu always uses it.
_Avoid_: Nearest fiber, innermost component (may be a library component)

**Server component**:
A React Server Component, known on the client only through `_debugInfo`. Included best effort and tagged "server" in the picker; its usage site is resolved through Next's `/__nextjs_source-map` endpoint. Failure degrades to client-only behavior.
_Avoid_: SSR component (server rendering of client components is a different thing)

**Picker**:
The in-page overlay, toggled by `Alt+Shift+C` or the toolbar icon, that outlines the selected component, shows its name, usage site and own-code breadcrumb, and lets ↑/↓ walk the owner chain. Clicking copies a component reference and exits.
_Avoid_: Inspector, DevTools pane (there is no DevTools pane)

**Enabled host**:
A hostname the extension runs on. `localhost`, `*.localhost` and `127.0.0.1` are enabled at install; others are enabled by the user through the in-page enable prompt, which requests that host's permission only. Enabling a hostname covers all its ports.
_Avoid_: Allowed site, whitelist, origin (ports are not part of it)

**Path prefix**:
An optional per-host string (keyed by `hostname:port`) prepended to every copied path so that paths are relative to the repository root, e.g. `localhost:3000` → `apps/web/`. Also called the host mapping.
_Avoid_: Project root, absolute path, leading `/` (agents read it as absolute)

**Project root**:
The directory copied paths are made relative to, learned at runtime from source maps (the directory containing `node_modules/` or `.next/`, or derived from a pair of absolute and relative paths). The shortest learned root wins, so workspaces resolve to the repository root.
_Avoid_: Configured root (there is no per-project setup)
