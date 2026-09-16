# Unit tests

Pure logic unit tests live in two places:

1. **Colocated** — `features/**/**/*.test.ts` (preferred for functions under test).
2. **Here** — optional shared unit tests that do not belong to one feature.

Run all tests: `npm test`.

Examples already in the repo:

- `features/examinations/services/passkeyClassification.test.ts`
- `features/examinations/services/examStartCoordinator.test.ts`
- `features/schedules/utils/examScheduleStatus.test.ts`
