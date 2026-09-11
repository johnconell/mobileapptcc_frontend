# Technical manual — mobile

## Auth

- `POST /api/v1/proctor/login` via `AuthRepository`.
- Google: `services/proctorGoogleAuth.ts` + backend `/api/v1/proctor/google/*`.
- After pack download, session is bundled (`OfflineStore.bundleProctorSession`). Logout clears it.

## Navigation

- Landing uses `router.push('/(proctor)/login')`.
- Logged-out proctor group is a real Stack so hardware back can pop to landing.
- Tab screens live under `app/(proctor)/(tabs)/`.

## Exam engine (do not rewrite casually)

- Start mapping: `examStartCoordinator.ts`, `examAuthority.ts`, `examLifecycle.ts`.
- Lobby polls: student `app/(student)/lobby.tsx` + peer heartbeat.
- Security: `ExamSecurityService.ts`, `hooks/useExamSecurity.ts`, native plugin `plugins/withExamSecurity.js`.

## Tests

```bash
npm test
```

Files: `services/examStartCoordinator.test.ts`, `services/passkeyClassification.test.ts`, `utils/examScheduleStatus.test.ts`.
