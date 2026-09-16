# METCC Mobile — TCC Entrance Examination System (Capstone)

Expo (SDK 54) **React Native** client for **Proctors** and **Examinees**.  
**Admin** uses the web dashboard (`metcc_frontend`). API: Laravel `metcc_backend`.

## Capstone structure

Full folder tree and adviser notes: **[docs/CAPSTONE_STRUCTURE.md](docs/CAPSTONE_STRUCTURE.md)**

| Area | Folder |
|------|--------|
| Navigation / screen shells | `app/` (Expo Router) |
| Proctor & examinee logic | `features/*` |
| Shared UI, API, theme | `shared/` |
| Env & API endpoints | `config/` + `.env` |
| Anti-cheat barrel | `features/security/` |
| Offline pack & cache | `features/synchronization/` |
| Tests | `tests/` + colocated `*.test.ts` |

Also see [docs/architecture.md](docs/architecture.md), [docs/FEATURE_MAP.md](docs/FEATURE_MAP.md).

## Architecture (summary)

- **Online:** Proctor login, exam-day pack download, result sync via `EXPO_PUBLIC_*` cloud API.
- **Offline LAN:** Proctor device runs local exam server; examinee joins over Wi‑Fi (peer HTTP).
- **Security:** Kiosk mode, screenshot/recording mitigation, app-switch violations (`features/security`).

## Environment variables

Copy `.env.example` → `.env`. Restart Expo after changes (`npx expo start -c`).

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_API_URL` | Default API base (exam + lobby traffic) |
| `EXPO_PUBLIC_CLOUD_API_URL` | Cloud API for **proctor login** and sync |
| `EXPO_PUBLIC_SYNC_TOKEN` | Admin/LAN sync token (must match backend) |

On a **physical phone**, do not use `127.0.0.1` — use your PC’s LAN IP when testing against local Laravel.

## Setup & run

```bash
npm install
npx expo start          # Expo Go / dev client

npm run typecheck       # tsc --noEmit
npm test                # unit + integration (node:test)

npm run android         # native run (requires prebuild)
npm run ios
npm run web
```

Production JS updates: `eas update --branch production`. Native/plugin changes need a new APK.

## User flows

**Proctor:** Login (internet) → Download exam pack → Open room → QR lobby → Start exam → End → Sync results  

**Examinee:** Landing → Scan QR or enter code → Passkey → Confirm → Lobby → Exam → Submit

## Documentation

- [docs/user-manual.md](docs/user-manual.md)
- [docs/technical-manual.md](docs/technical-manual.md)
- [docs/reports/](docs/reports/) — archived investigations
