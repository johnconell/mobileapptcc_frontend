# Technical manual — mobile

## Auth

- `POST /api/v1/proctor/login` via `AuthRepository`.
- Google: `features/authentication/services/proctorGoogleAuth.ts` + backend `/api/v1/proctor/google/*`.
- After pack download, session is bundled (`OfflineStore.bundleProctorSession`). Logout clears it.

## Navigation

- Landing uses `router.push('/(proctor)/login')`.
- Logged-out proctor group is a real Stack so hardware back can pop to landing.
- Tab screens live under `app/(proctor)/(tabs)/`.

## Exam engine (do not rewrite casually)

All of it lives in `features/examinations/`.

- Start mapping: `services/examStartCoordinator.ts`, `services/examAuthority.ts`, `services/examLifecycle.ts`.
- Lobby polls: student `app/(student)/lobby.tsx` + peer heartbeat.
- Security: `services/ExamSecurityService.ts`, `hooks/useExamSecurity.ts`, native plugin `plugins/withExamSecurity.js`.

## Tests

```bash
npm test          # node:test suites
npm run typecheck # tsc --noEmit
```

Files: `features/examinations/services/examStartCoordinator.test.ts`,
`features/examinations/services/passkeyClassification.test.ts`,
`features/schedules/utils/examScheduleStatus.test.ts`.
