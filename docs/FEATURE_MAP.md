# Mobile feature map

Import **features** in new code. Keep `app/` files as route shells.

| Feature | Index | Route shells (do not move) | Implementation (current) |
|---|---|---|---|
| authentication | `features/authentication` | `app/(proctor)/login.tsx` | `repositories/AuthRepository.ts`, `services/proctorGoogleAuth.ts` |
| applicants | `features/applicants` | `app/(student)/*` | `StudentRepository`, `studentStore`, cleanup |
| proctors | `features/proctors` | `app/(proctor)/**` | `features/proctor/*`, `proctorStore` |
| dashboard | `features/dashboard` | `(tabs)/dashboard.tsx` | `proctorStore`, pack summary |
| schedules | `features/schedules` | `(tabs)/examination.tsx` | `ScheduleRepository`, `ScheduleCard`, `examScheduleStatus` |
| examinations | `features/examinations` | `exam.tsx`, `room.tsx` | peer server/client, lifecycle, security |
| lobby | `features/lobby` | `lobby.tsx` (both roles) | `LobbyRepository`, `lobbyStore` |
| monitoring | `features/monitoring` | overlays | wifi gates, network monitor |
| qr-scanner | `features/qr-scanner` | `scan.tsx`, `enter-code.tsx` | campus wifi, LAN discovery |
| synchronization | `features/synchronization` | `offline-prepare.tsx` | pack download, offline store |
| results | `features/results` | `(tabs)/results.tsx` | queued results |
| settings | `features/settings` | `(tabs)/settings.tsx` | `settingsStore` |
| shared | `features/shared` | — | `components/ui` |

Existing `import '@/services/...'` paths remain valid.
