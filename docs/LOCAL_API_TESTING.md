# Development Local API Testing Mode

The development local API mode routes all mobile API client calls through an in-process transport adapter that enforces the current Laravel API contracts without requiring a live backend or database.

## 1. How to Enable Local API Testing

1. Ensure `.env` in `mobileapptcc_frontend` has:
   ```env
   EXPO_PUBLIC_LOCAL_API_MODE=true
   ```
2. Start Expo with cache cleared:
   ```bash
   npx expo start -c
   ```
3. Look for the floating badge at the bottom of the screen:
   ```
   LOCAL TESTING MODE · v2026.11.02-4
   ```
   If this badge is not visible, requests are targeting the live backend URL, not local mode.

## 2. Seeded Test Accounts & Data

### Proctors
| Proctor Name | Email | Password | Assigned Schedule | Assigned Room | Capacity | Examinees |
|---|---|---|---|---|---|---|
| **Proctor Maria Santos** | `proctor1.local@tcc.test` | `LocalTest123!` | Schedule 101 (`08:00–09:00`) | Room 201 (Computer Lab 1) | 20 | 15 students |
| **Proctor Juan Reyes** | `proctor2.local@tcc.test` | `LocalTest123!` | Schedule 102 (`10:00–11:00`) | Room 202 (Computer Lab 2) | 20 | 15 students |

> *Note: `proctor.local@tcc.test` is also supported as an alias for Proctor 1.*

### Examination Schedules (Asia/Manila Date)
- **Schedule 101**: `TCC Entrance Examination - Batch 1`, `08:00:00–09:00:00`, Exam Code: `TCC10126`, Room 201.
- **Schedule 102**: `TCC Entrance Examination - Batch 2`, `10:00:00–11:00:00`, Exam Code: `TCC10226`, Room 202.
- **Schedule 103**: `Restricted Local Examination`, `13:00:00–14:00:00`, Unassigned (used for 403 authorization verification).

### Students (30 Fictional Examinees)
- **Students 1–15** (Assigned to Schedule 101, Room 201):
  - Student IDs: `1` to `15`
  - Applicant Codes: `APP-2026-0001` to `APP-2026-0015`
  - Examination Keys / Passkeys: `P0000001` to `P0000015`
  - Programs: BSIT, BSA, BSED distributed
- **Students 16–30** (Assigned to Schedule 102, Room 202):
  - Student IDs: `16` to `30`
  - Applicant Codes: `APP-2026-0016` to `APP-2026-0030`
  - Examination Keys / Passkeys: `P0000016` to `P0000030`
  - Programs: BSIT, BSA, BSED distributed

### Questions & Settings
- **Question Bank**: 40 multiple-choice items across 4 categories: English (`ENG`), Mathematics (`MATH`), Science (`SCI`), and Logic (`LOG`) (10 questions each).
- **Settings**: 60-minute duration, late entry disabled, question shuffling enabled, 120-second disconnect grace period.

## 3. End-to-End Test Walkthrough

1. **Proctor Session Setup**:
   - Log in as `proctor1.local@tcc.test` with password `LocalTest123!`.
   - Verify only Schedule 101 is visible; Schedule 102 is forbidden.
   - Select Room 201 (`Computer Laboratory 1`) and tap **Open Examination Room**. Status transitions to `lobby_open`.
2. **Student Admission & Question Delivery**:
   - Open student flow, enter Examination Code `TCC10126`.
   - Enter Passkey `P0000001` (Applicant 01).
   - In `lobby_open` state, questions cannot be downloaded (guards return 409 Conflict).
   - In proctor room, tap **Start Examination**. Status changes to `in_progress`.
   - Student screen loads the 40 questions with countdown timer initialized to 60:00.
3. **Answering & Submission**:
   - Answer items; answers are automatically saved to local encrypted checkpoint storage.
   - Tap **Submit Examination** and confirm.
   - Confirmation receipt with cryptographic digest and passing/failing score is generated.
   - Repeated taps or resubmissions are idempotent and return the original confirmation.

## 4. Reset & Cleanup Instructions

- **Reset Local Test Data**: Tap the underlined **Reset** button on the `LOCAL TESTING MODE` badge. This purges attempts, checkpoints, and cached tokens without touching Laravel backend data.
- **Return to Live Backend Mode**: In `.env`, set `EXPO_PUBLIC_LOCAL_API_MODE=false` (or remove the flag), and restart Expo with `npx expo start -c`.

## 5. Contract Verification

To verify that local fixtures and contract validations remain 100% synchronized with the Laravel backend:
```bash
npm run check:local-contract
```
Backend fingerprint: `a494073069c13e5f3dad66ed1554ea13c8c894ff62d10d7e6f40953d93ae3327`.
