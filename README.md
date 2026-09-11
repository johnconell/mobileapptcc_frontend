# METCC Mobile — TCC Entrance Examination

Expo (SDK 54) app for **proctors** and **applicants**. Administrators use `metcc_frontend`. API: `metcc_backend`.

**Start here**

- [docs/architecture.md](docs/architecture.md) — folder rules (do not move `app/` routes)
- [docs/FEATURE_MAP.md](docs/FEATURE_MAP.md) — what each feature owns
- [docs/user-manual.md](docs/user-manual.md)
- [docs/technical-manual.md](docs/technical-manual.md)
- [docs/reports/](docs/reports/) — archived investigations

## Layout

```
app/          Expo Router shells only — a file's path is its deep link
features/     one folder per feature (screens' logic, services, stores, …)
shared/       primitives used by more than one feature
```

## Flows

**Proctor:** Login (online) → Download exam pack → Open room → QR / lobby → Start → Sync results

**Applicant:** Home → Scan QR or enter code → Passkey → Lobby → Exam → Submit (questions wiped)

## Run

```bash
npm install
npx expo start

npm test          # node:test suites
npm run typecheck # tsc --noEmit
```

JS updates: `eas update --branch production`. Native/plugin changes need a new APK.
