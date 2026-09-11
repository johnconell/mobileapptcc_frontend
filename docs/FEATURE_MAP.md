# Mobile feature map

Every non-route module lives in exactly one feature. `app/` holds only Expo
Router shells, because a file's path there *is* its deep link.

Import from `@/features/<name>` (the barrel) in new code. Deep paths such as
`@/features/lobby/repositories/LobbyRepository` are fine when you need one
symbol and want the dependency to be obvious.

| Feature | Barrel | Route shells (do not move) | Owns |
|---|---|---|---|
| authentication | `features/authentication` | `app/(proctor)/login.tsx` | `AuthRepository`, `proctorGoogleAuth`, `proctorAuthCache`, `proctorLoginSchema`, `confirmProctorLogout` |
| proctors | `features/proctors` | `app/(proctor)/**` | `proctorStore` |
| applicants | `features/applicants` | `app/(student)/**` | `StudentRepository`, `studentStore`, `useApplicants`, `applicantExamCleanup` |
| dashboard | `features/dashboard` | `(tabs)/dashboard.tsx` | pack summary view model |
| schedules | `features/schedules` | `(tabs)/examination.tsx` | `ScheduleRepository`, `useSchedules`, `ScheduleCard`, `SessionCard`, `examScheduleStatus` |
| examinations | `features/examinations` | `(student)/exam.tsx`, `(proctor)/room.tsx` | `peerExamServer`, `peerExamClient`, `examLifecycle`, `examAuthority`, `examStartCoordinator`, `examReadiness`, `examPreloader`, `examProgressStore`, `ExamSecurityService`, `passkeyClassification`, `examStore`, `QuestionRepository`, `SecurityRepository`, exam overlays |
| lobby | `features/lobby` | `lobby.tsx` (both roles) | `LobbyRepository`, `lobbyStore`, `useLobby`, `LobbyStudentCard`, `LobbyWaitingAnimation` |
| monitoring | `features/monitoring` | overlays | `networkMonitor`, `campusWifiGate`, `lanDiscovery`, wifi gate hooks, `useViolationMonitor`, `useViolations`, `CampusWifiBlockedCard` |
| qr-scanner | `features/qr-scanner` | `scan.tsx`, `enter-code.tsx` | joins via monitoring + lobby |
| synchronization | `features/synchronization` | `offline-prepare.tsx` | `offlineStore`, `ensureExamPack`, `offlineExamRepository` |
| results | `features/results` | `(tabs)/results.tsx` | queued result views |
| settings | `features/settings` | `(tabs)/settings.tsx` | `settingsStore` |

## shared/

Cross-feature only. If exactly one feature uses it, it belongs in that feature.

| Path | Contents |
|---|---|
| `shared/components/ui` | design-system primitives (`Button`, `Card`, `Header`, …) |
| `shared/components` | `VersionInfo`, `SchoolLogo` |
| `shared/hooks` | `useAppTheme`, `useAppState`, `useHardwareBack` |
| `shared/services` | `api`, `apiReachability`, `storage`, `DeviceService` |
| `shared/constants`, `shared/types`, `shared/theme` | app-wide values and types |
| `shared/providers`, `shared/contexts` | `AppProviders`, `SessionContext` |
| `shared/utils` | generic formatters, `navigation` |

## Removed aggregate barrels

`@/repositories`, `@/stores` and `@/hooks/useRepositories` no longer exist.
Their members moved to the owning feature; `useRepositories` became five
feature hook files (`useSchedules`, `useApplicants`, `useQuestions`,
`useLobby`, `useViolations`) with unchanged query keys and options.
