# Mobile/Laravel local contract compatibility

Generated: 2026-11-02 (Asia/Manila)  
Fixture version: `2026.11.02-2`  
Backend source: local `masterexam-pro/api`, branch `main`, commit `866ae31522b5589dc8728733bc3599e79032105e` (`update`, 2026-10-30 05:54:07 +0800)  
Contract fingerprint: `667b5ee601bbdb2d504fb130e93dcbc7721fa88802f9416164596a774af0734c`

This records the latest backend available in this workspace, including the working-tree room-assignment freshness fix. It does not claim that the local checkout matches an un-fetched remote branch.

## Compatibility matrix

| Feature | Backend contract | Mobile implementation | Status | File evidence | Required fix / disposition |
|---|---|---|---|---|---|
| Proctor auth | `email` or `username`, required `password`; bearer token; 401/403/422 errors | Sends both accepted identifiers; isolated local token/session | Compatible | `ProctorAuthController.php`; `features/authentication/repositories/AuthRepository.ts` | None |
| Schedules | snake_case rows and `meta.server_now`; current academic-year restrictions are server-owned | Mapper consumes these fields; local API supplies two stable Manila-day rows | Compatible locally / unverified live restriction | `ExamSessionController.php`; `features/schedules/repositories/ScheduleRepository.ts` | Verify archived denial against Laravel |
| Rooms/proctor assignment | Schedule room endpoint exposes capacity, assignment, owner, and control fields | Mapper and fixtures retain these fields | Compatible | `ExamSessionService.php`; `ScheduleRepository.ts`; `fixtures.ts` | None |
| Lobby lifecycle | Open, schedule lobby, start, close/end; per-room examination code | Existing repository calls current endpoints; local transport models primary transitions | Compatible for primary flow | `routes/api_v1.php`; `features/lobby/repositories/LobbyRepository.ts` | Live concurrency/reconnect test remains |
| Students | Code-scoped list; service serializes camelCase presentation rows | Repository consumes the presentation rows; 30 fixtures split 15/15 | Compatible | `PublicExamController.php`; `ExamSessionService.php`; `StudentRepository.ts` | None |
| Claim/join | snake_case `code`, `applicant_id`, optional `gmail`; UUID token | Current payload is correct; legacy camelCase is rejected by a negative check | Compatible | `PublicExamController.php`; `StudentRepository.ts`; `LobbyRepository.ts` | None |
| Passkey join | Eight alphanumeric characters scoped to a schedule | Current payload uses `code`, `passkey`, optional `gmail`; fixtures use `P0000001`…`P0000030` | Compatible | `PublicExamController.php`; `LobbyRepository.ts` | None |
| Questions | Participation UUID plus lobby/ended/submitted guards; mobile-shaped rows come from the service, not `QuestionResource` | Current parser matches service output; local API has 40 categorized items and guards | Compatible | `PublicExamController.php`; `ExamSessionService.php`; `QuestionRepository.ts` | None |
| Autosave | `answers[].exam_question_id`, nullable `selected_answer`; `data.saved_at` | Current request/response parser matches and local data persists | Compatible | `PublicExamController.php`; `QuestionRepository.ts` | None |
| Submit/results | Same answer payload; top-level `submittedAt`; retry returns existing result receipt | Current parser consumes `submittedAt`; local score is clearly simulated and idempotent | Compatible | `PublicExamController.php`; `ExaminationResultResource.php`; `QuestionRepository.ts` | Production scoring remains backend-owned |
| Exam duration | Setting default is 60 minutes | Mapper hardcoded 90 minutes | Outdated → fixed | `ExaminationSetting.php`; `ScheduleRepository.ts` | Changed mapper to 60; a future API duration field would be preferable |
| Pagination/nullability | Schedule endpoint returns an array plus metadata; optional schedule/room fields can be null | Mappers use optional fields/defaults; local unknown/empty lobby is explicit | Compatible for reviewed paths | controller validation/serialization; repository types | Add live resource pagination coverage when backend runs |
| Device security | Native enforcement depends on installed build/device policy | Local mode does not simulate native security success | Unverified by design | `ExamSecurityService.ts` and native build | Physical-device test required |
| Result synchronization | Offline ingest and current academic-year checks are backend-owned | Existing sync remains unchanged; local API never claims cloud synchronization | Unverified live | `OfflineResultController.php`; `ResultSyncController.php` | Real database/cloud test required |

## Implementation

- `EXPO_PUBLIC_LOCAL_API_MODE=true` activates the substitute only when Expo defines `__DEV__`.
- Requests are intercepted inside `shared/services/api.ts` before `fetch`, so local mode makes no Laravel HTTP request.
- Local mode namespaces all app storage, including auth, student progress, checkpoints/timer state, participation tokens, answers, and results. It cannot overwrite normal/live data.
- The bottom `LOCAL API` indicator is always visible while enabled and includes a confirmed reset action. Reset deletes local keys only.
- Fixtures are idempotent. A fixture upgrade refreshes reference data while retaining attempts; a user-requested reset clears local attempts.
- Unknown methods/routes and obsolete payloads fail explicitly. This is deliberately stricter than a permissive mock.

Local credentials:

- Email: `proctor.local@tcc.test`
- Password: `LocalTest123!`
- Exam codes: `TCC10126`, `TCC10226`

## Contract sources

The fingerprint command covers:

- `routes/api_v1.php`
- proctor auth/session and public exam controllers
- offline-result controller and exam-session service
- examination registration/settings models
- question/result resources
- core examination-domain and settings migrations

Run `npm run check:local-contract`. A failure means the Laravel sources changed and the fixture/transport/tests must be re-audited before updating the recorded fingerprint.

## Verification and remaining checks

Automated checks are labeled `backend-contract` and cover seeding, exact request naming, negative legacy payload rejection, and idempotent submission. Run:

```powershell
npm run check:local-contract
npm run typecheck
npm test
```

Still required when infrastructure is available:

1. Run the same proctor/student happy path against a real Laravel database and Sanctum token.
2. Confirm archived academic-year denial with a real archived schedule.
3. Exercise Wi-Fi loss/reconnect, peer hosting, offline-result upload, and duplicate submission on two physical devices.
4. Verify Android lock-task/screen-capture behavior in the development APK; local API mode does not emulate native security.

