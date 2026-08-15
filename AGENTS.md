# AGENTS.md

Agent working guide for the **Legero frontend** repository — the Order Management System (OMS) UI for a specific restaurant chain. Mobile-first responsive web app, also packaged as an Android app via Capacitor. See [`README.md`](README.md) for the product overview.

## Commands

Environment requirements: **Node.js ≥ 24, pnpm 11**. Always use `pnpm` — never npm/yarn; `pnpm-lock.yaml` is the canonical lockfile.

| Command | Action |
| --- | --- |
| `pnpm install` | Install dependencies |
| `pnpm dev` | Start Vite dev server (default http://localhost:5173) |
| `pnpm build` | Type-check (`tsc -b`) then production build to `dist/` |
| `pnpm lint` | ESLint over the repo |
| `pnpm test` | Run all Vitest tests (watch mode is not configured) |
| `pnpm preview` | Preview the production build locally |
| `pnpm sync` | `pnpm cap sync` — copy `dist/` into the Android project |
| `pnpm gen-icon` | Regenerate Android icon set from `public/` source images |

## Tech Stack

| Category | Tech |
| --- | --- |
| Framework | React 19, React Router 8 (`createBrowserRouter`, `react-router/dom`) |
| Language | TypeScript ~6, strict mode (`strict`, `noUnusedLocals`, `noUnusedParameters`) |
| Build | Vite 8 (Rolldown), `@vitejs/plugin-react` |
| Styling | Tailwind CSS v4 (CSS-first config in `src/tailwind.css`), HeroUI 3 |
| State | Zustand 5 (some stores persisted to `localStorage`) |
| Time | dayjs + utc/timezone plugins, locale `zh-cn`, default tz `Asia/Shanghai` |
| Mobile | Capacitor 8 (Android) |
| Testing | Vitest 4 + Testing Library (jsdom per test file) |
| CI | GitHub Actions (`.github/workflows/build.yaml`) |

## Repository Layout

```
src/
├── main.tsx               # Entry: dayjs setup, React root render
├── App.tsx                # Theme effect, AppBootstrap, Toast.Provider, RouterProvider
├── components/            # Shared components (Header, PasswordLockScreen, Icon/*, ApiBaseUrlForm, ToggleButtonGroup)
├── hooks/                 # useAuthSessionBootstrap, useApiBaseUrl, useOrderWorkspaceSync, useSavedServers, useAndroidBackButton
├── routes/                # createBrowserRouter + guards: AuthRoute, ProtectedRoute
├── services/              # API client, domain logic, realtime (see below)
├── store/                 # Zustand stores: auth, order, orderSettings, passwordAuth, theme
├── types/                 # Domain types: codes, options, orderForm, orderRecord, orderView, Filter
└── views/                 # Pages: Auth / Home / Order / Statistics / Settings / NotFound
```

### Architecture notes

- **Layering**: `views` → `hooks` → `store` → `services`. Keep UI components free of business logic; put domain rules in `src/services/*` as pure functions.
- **API client** (`src/services/apiClient.ts`): fetch wrapper with Bearer auth, automatic token refresh (30 s pre-expiry buffer, single-flight refresh), one retry on `token_expired` 401. Tokens live in `localStorage` under `legero.auth.tokens`.
- **Domain model**: `OrderRecord` (`src/types/orderRecord.ts`) is the in-app model. `services/orderRecordMapper.ts` converts between API DTOs and domain records; `orderFormAdapter.ts` bridges the form and the record; `orderSorting.ts` owns timeline ordering.
- **Optimistic updates**: order mutations apply locally first via `services/orderOptimistic.ts` (generation-counter guard prevents stale rollbacks), and roll back on failure.
- **Realtime**: `services/orderRealtime.ts` opens a WebSocket subscription from a session ticket (`POST /api/realtime/session`), handles `order.upsert` / `order.deleted` / `order.cleared` events, batches updates via rAF, and reconnects with backoff.
- **Order store**: `src/store/order.ts` keeps `ordersById: Record<string, OrderRecord>` plus a sorted `orderDisplayIds` array. Persisted with Zustand `persist`, but `partialize` stores **only the filter** — orders themselves are in-memory.
- **Time handling**: all business dates use dayjs with `Asia/Shanghai` — never raw `Date` for business-day logic.
- **Settings**: API base URL is user-configurable (saved servers list, health probe); the Android build allows cleartext HTTP for local API servers (`capacitor.config.ts`).

## Coding Conventions

- Use the `@/` path alias for all source imports (`@/store/auth`, not relative paths).
- Strict TypeScript: fix any `noUnusedLocals`/`noUnusedParameters` violations; `pnpm build` runs `tsc -b` and fails on type errors.
- React components are function components with hooks; files follow the `react-refresh/only-export-components` rule — keep helpers/constants out of component files (e.g. `list/orderItemHelpers.tsx`, `components/constants.ts`).
- HeroUI 3 uses compound component APIs: `Button.Root`, `Card.Root`/`Card.Content`, `Toast.Provider`. Match the existing usage patterns; tests mock these components.
- Tailwind CSS v4 is CSS-first: shared theme tokens live in `src/tailwind.css` under `@theme` (custom `--breakpoint-xs`). Prefer utility classes over custom CSS.
- Mobile-first: use `min-h-dvh`, touch-friendly targets, `viewport-fit=cover` semantics.
- UI copy is in Chinese; code identifiers and comments in English.
- Commit messages follow conventional commits (`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `style:`, `ci:`), matching repo history.
- `android/` is generated by `pnpm sync` — never hand-edit Android sources for feature work.
- When adding native-ish dependencies, note `pnpm-workspace.yaml` `allowBuilds` (currently allows `@swc/core`, `esbuild`, `sharp`) may need an entry.

## Testing

- Vitest 4 with Testing Library; tests are co-located as `*.test.tsx` next to the source (e.g. `src/components/ApiBaseUrlForm.test.tsx`).
- There is **no global jsdom config** — DOM tests declare `/* @vitest-environment jsdom */` at the top of the file; service/pure-function tests run in node by default.
- Mock external modules with `vi.mock` (use `vi.hoisted` for shared mock functions), including lightweight replacements for HeroUI components.
- Run `pnpm test` before considering a change complete; `pnpm lint` and `pnpm build` must stay green.

## CI & Release

- `.github/workflows/build.yaml` runs on every push/PR and on `v*` tags: pnpm install (pnpm 11, Node 24) → build web → `pnpm sync` → Gradle `assembleRelease` (JDK 21) → manual `apksigner` signing (secrets) → upload `legero-universal-<version>.apk`.
- Pushing a `v*` tag also creates a GitHub Release with the APK (version name from the tag, version code from commit count). Bump `version` in `package.json` and tag accordingly.

## Skills

Read and follow [`docs/agents/skills.md`](docs/agents/skills.md) for skill discovery, selection, and loading rules.

## Sub-agents

Read and follow [`docs/agents/subagents.md`](docs/agents/subagents.md) for sub-agent delegation, orchestration, and model-selection rules.

## Local Environment

Before starting task work, after reading this file, check whether
`AGENTS.local.md` exists in the repository root.

If present, read it as additional machine-local context for local paths,
services, commands, debugging, and other environment-specific details.
If absent, continue normally.

`AGENTS.local.md` supplements this file and must not override repository-wide
requirements unless explicitly permitted here.