# TCC Mobile Entrance Examination — Frontend

Expo Go (**SDK 54**) frontend for Tagoloan Community College entrance examinations.

## Flows

**Proctor:** Login → Schedules → Sessions → Lobby (QR + Exam Code + Start)

**Student:** Home → Scan QR **or** Enter Code → Verify → Confirm (read-only) → Waiting Lobby → Exam → Submitted

## Demo credentials

- Username: `proctor`
- Password: `tcc2026`

## Run

```bash
npm install
npx expo start
```

## Architecture

Screens call repositories only (`Auth`, `Schedule`, `Student`, `Lobby`, `Question`). Mock JSON today; Laravel REST later without UI rewrites.
