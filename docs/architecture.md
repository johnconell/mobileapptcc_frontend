# Mobile app — architecture

Expo Router + TypeScript. Two personas share one APK: **proctor** and **applicant**.

## Layout

```
app/                 Expo Router shells only (path = deep link)
features/<name>/     components, hooks, services, repositories, stores,
                     utils, validation, plus an index.ts barrel
shared/              cross-feature primitives (see docs/FEATURE_MAP.md)
plugins/ patches/    native build + exam-security glue
docs/                this documentation; docs/reports/ keeps past investigations
```

A module belongs in `shared/` only when more than one feature imports it.
Everything else lives with its feature.

## Folder rules

| Path | May I move it? |
|---|---|
| `app/**` | **No.** File path = deep link / screen URL. |
| `features/<name>/**` | Yes, within the feature. Update the barrel. |
| `shared/**` | Yes, but check callers — everything imports through `@/shared/...`. |
| Native `android/`, `ios/`, `plugins/` | Native builds / exam security. Do not "organize" casually. |

Path alias `@/*` maps to the repo root in both `tsconfig.json` and
`babel.config.js`. Keep those two in sync.

## Route tree (stable)

```
/                          landing
/(proctor)/login           proctor sign-in
/(proctor)/(tabs)/dashboard|examination|results|settings
/(proctor)/lobby|room|rooms|sessions|account
/(student)/scan|enter-code|verify|passkey|confirmation|lobby|exam|submitting|completed
/offline-prepare
```

## Offline LAN

Proctor phone runs `features/examinations/services/peerExamServer.ts` (HTTP on 9777).
Applicant uses `features/examinations/services/peerExamClient.ts`.
Pack persistence: `features/synchronization/services/offlineStore.ts` and
`offlineExamRepository.ts`.

## Setup

```bash
npm install
npx expo start
npm test          # node:test suites
npm run typecheck # tsc --noEmit
```

Production updates: `eas update --branch production` (JS). Native changes need a new APK.
