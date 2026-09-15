# AGENTS.md — METCC Mobile (Expo)

Operating guide for AI coding agents. **Do not duplicate `DESIGN.md`.** Read it; apply it.

This app is the **proctor + applicant** Expo client (`mobileapptcc_frontend`). Admins use sibling `metcc_frontend`. API: `metcc_backend`.

## Source of truth

| Concern | Read |
|---|---|
| Product / UI / UX / visual design principles | [`DESIGN.md`](DESIGN.md) |
| Code layout, routes, offline LAN | [`docs/architecture.md`](docs/architecture.md) |
| Feature ownership & `shared/` boundaries | [`docs/FEATURE_MAP.md`](docs/FEATURE_MAP.md) |
| How to run / high-level flows | [`README.md`](README.md) |
| Expo APIs for this SDK | https://docs.expo.dev/versions/v54.0.0/ |

**Expo SDK 54** (Expo Go compatible). Expo has changed — use the v54 docs before writing Expo or native-module code.

If a user request **conflicts with `DESIGN.md`**, stop and flag the conflict. Do not silently override design tokens, typography rules, or do/don’t guidance.

If a request conflicts with folder/route rules in `docs/architecture.md` or `docs/FEATURE_MAP.md`, flag that too (especially **do not move** `app/` files).

## How to inspect before changing

1. Read `DESIGN.md` for any UI work; read `docs/architecture.md` + `docs/FEATURE_MAP.md` for structure.
2. Find the owning feature in `FEATURE_MAP.md`. Prefer existing screens, components, services, stores, and hooks in that feature.
3. Reuse `@/shared/components/ui` and `@/shared/theme` before adding primitives.
4. Trace callers of anything you touch (`@/` imports). Keep `tsconfig.json` and `babel.config.js` path aliases in sync if you ever change them.
5. For auth, offline pack, LAN exam, or sync: also skim `docs/technical-manual.md` and relevant files under `features/examinations` / `features/synchronization` / `features/monitoring`.

## Layout conventions (do not invent new ones)

```
app/          Expo Router shells only — path = deep link. Do not move these files.
features/     one folder per feature; logic, services, repositories, stores, utils, validation + index.ts barrel
shared/       only when >1 feature imports it
plugins/ patches/  native / exam-security — do not “organize” casually
```

- Import new code via `@/features/<name>` (barrel) or a clear deep path when one symbol is enough.
- Aggregate barrels `@/repositories`, `@/stores`, `@/hooks/useRepositories` are **gone** — do not recreate them.
- Route shells stay thin: wire navigation/UI; put behavior in the feature.

## Implementation patterns (match the repo)

- **TypeScript** strict; path alias `@/*` → repo root.
- **UI:** prefer existing `shared/components/ui` (`Button`, `Card`, `Header`, …). Style with existing patterns (`StyleSheet`, `@/shared/theme`, NativeWind/`className` where already used). Map visual work to `DESIGN.md` tokens via theme/UI primitives — avoid one-off hex/type that fights the system.
- **State:** Zustand stores live in the owning feature; React Query hooks live with the feature that owns the resource.
- **Forms / validation:** `react-hook-form` + `zod` (+ `@hookform/resolvers`) where that pattern already exists.
- **Icons:** `lucide-react-native` (existing usage).
- **Offline exam:** proctor LAN server / applicant client under `features/examinations/services/`; pack persistence under `features/synchronization`.
- **Personas:** proctor routes under `app/(proctor)/`; applicant under `app/(student)/`. Do not add web-admin flows here.

## Change discipline

- **Minimal, focused diffs.** Only what the task needs.
- **Never overwrite or discard existing user work** (uncommitted edits, WIP branches, local `.env`). Prefer additive fixes; ask before destructive resets.
- **Reuse** existing patterns and components; do not introduce parallel design systems, folders, or frameworks.
- **Do not invent** lint configs, scripts, architecture layers, or dependencies “because they’re common.”
- Prefer editing feature barrels (`features/*/index.ts`) when exporting new public symbols.
- Leave `docs/reports/` alone unless the user asks for investigation write-ups.
- **Secrets:** never commit `.env`, tokens, or credentials. Use `.env.example` as the template. Restart Expo after env changes (`npx expo start -c` when needed).

## Dependencies

- Add packages only when required; prefer Expo SDK 54–compatible versions (`expo install` when adding Expo modules).
- This repo uses `patch-package` (`postinstall`). Do not remove patches without understanding `patches/`.
- Native/plugin changes (`app.json` plugins, `android/`, `ios/`, `plugins/`) need a **new native build**; JS-only changes can ship with EAS Update.

## Commands (from this repo only)

```bash
npm install
npx expo start

npm test          # node:test suites listed in package.json "test"
npm run typecheck # tsc --noEmit

npm run android   # expo run:android
npm run ios       # expo run:ios
npm run web       # expo start --web

npm run generate:mock
```

JS OTA: `eas update --branch production` (see README). There is **no** ESLint/Prettier script in `package.json` — do not assume `npm run lint`.

**Tests:** colocated `*.test.ts` using `node:test` / `node:assert` (see existing examination/schedule tests). The `npm test` script **enumerates files** — when adding a suite, append its path to that script.

## Git / PR discipline

- Commit **only** when the user asks.
- Do not force-push, skip hooks, or amend unless the user explicitly requires it and it is safe.
- Do not commit `.env` or secrets.
- Keep commits scoped to the requested change.

## Verify and report

Before claiming done:

1. `npm run typecheck` for TypeScript-facing changes.
2. `npm test` when touching covered logic or adding tests.
3. Smoke the affected flow mentally against README flows (proctor download → room → lobby → sync; applicant scan → passkey → exam → submit).
4. For UI: confirm alignment with `DESIGN.md` (tokens, hierarchy, do/don’t) and existing primitives — note any intentional residual mismatch with older TCC theme values in `@/shared/theme`.

**Report briefly:** what changed, which feature/files, how you verified, and any `DESIGN.md` / docs conflicts or follow-ups (native rebuild, env, EAS update).
