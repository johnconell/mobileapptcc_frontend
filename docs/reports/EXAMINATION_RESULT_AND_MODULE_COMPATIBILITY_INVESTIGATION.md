# Examination Result and Question Module Compatibility Investigation Report

---

## 1. Executive Summary

A comprehensive, end-to-end investigation and architectural implementation was conducted across the mobile application (`mobileapptcc_frontend`), the central backend (`metcc_backend`), and the web portal (`metcc_frontend`).

### Key Findings & Fixes:
1. **Result Sync & Admin Display (Bug 1)**:
   - **Failure Point**: In `peerExamServer.ts`, starting a peer session parsed `input.scheduleId` using `Number(String(input.scheduleId).replace(/^offline-/, ''))`. For composite date-based schedule keys (e.g., `"date-2026-08-25-Entrance-Examination"`), `Number()` evaluated to `NaN`.
   - **Impact**: Student results were queued on disk with `examination_schedule_id: null`. When sent to Laravel, `$scheduleId < 1` caused `AdminResultSyncService::ingest` to silently skip inserting the records into MySQL, while returning HTTP 200 OK.
   - **Fix Implemented**: `resolveNumericScheduleId` resolves the exact numeric schedule ID from the offline pack. Hard assertions block queueing invalid IDs. Laravel's ingest returns HTTP 422 if records are rejected, and the mobile app checks `accepted_client_ids` length before claiming success. A Recovery Tool was added to repair legacy `NaN` records.

2. **Questionnaire / Module Version Compatibility (Bug/Feature 2)**:
   - **Failure Point**: Previously, `/passkey` and `/join` endpoints in `peerExamServer.ts` only verified the passkey string. If a student downloaded a newer or different question module than the Proctor, the student was still allowed into the lobby, leading to mismatched grading and corrupt submissions.
   - **Fix Implemented**: Implemented `computePackHash(pack)` — a deterministic content fingerprint calculated from active question IDs, stems, and correct answers. When a student attempts to validate a passkey or join the lobby over LAN, `student_pack_hash` is sent in the body. The Proctor's server compares `student_pack_hash` against `proctor_pack_hash`. If mismatched, the server rejects the join with HTTP 409 Conflict:
     > *"Your examination module is outdated or does not match the examination currently configured by the proctor. Please download the latest examination module before joining the lobby."*

---

## 2. Current Architecture

```
[Admin Cloud Server: metcc.repohive.com]
       │
       ├─ Exports Exam Day Pack (pack_version, exported_at, schedules, question_banks)
       │
       ▼
[Proctor Phone] (LAN Server)
       │
       ├─ Computes proctorPackHash = computePackHash(proctorPack)
       │
       ▼ (LAN Wi-Fi - 0 Internet Required)
[Student Phone]
       │
       ├─ Computes studentPackHash = computePackHash(studentPack)
       ├─ Sends POST /p2p/join { passkey, student_pack_hash }
       │
       ▼
[Proctor LAN Server Gate]
       │
       ├─ IF studentPackHash !== proctorPackHash
       │     └── REJECT (409 Conflict: "Module Outdated/Mismatched")
       │
       └─ IF studentPackHash === proctorPackHash
             └── ALLOW JOIN -> Start Exam -> Grade -> Queue Result -> Sync to Admin
```

---

## 3. Database Audit

- **MySQL Database (`u881832908_repo_metcc`)**: Contains 26 domain tables + 1 migrations table (27 tables total).
- **Key Tables**:
  - `applicants`: `applicant_code`, `name`, `email`, `gmail`, `course_applied`, `preferred_exam_time`, `application_date`, `status`.
  - `examination_schedules`: `id`, `title`, `exam_date`, `start_time`, `end_time`, `venue`, `batch_code`.
  - `examination_registrations`: `id`, `examination_schedule_id`, `applicant_id`, `score`, `items_correct`, `items_total`, `grade_point`, `attendance_status`, `result_status` (`passed`/`failed`), `lobby_status` (`finished`), `sync_status` (`synced`).
  - `examination_answers`: `examination_registration_id`, `exam_question_id`, `selected_answer`, `is_correct`.
  - `exam_sessions`: `wifi_ssid`, `local_server_ip`, `sync_mode`, `status`.
- **Schema Result**: All required tables exist. No schema changes required.

---

## 4. Data Flow Traces

### Result Sync Flow:
```
Student Submits Exam
        ↓
Peer Server receives /submit
        ↓
Resolves valid numeric examination_schedule_id (> 0)
        ↓
OfflineStore.queueResult() saves valid record in metcc-offline-results.json
        ↓
Proctor clicks "Sync Results to Admin" (or runs "Recover Unsynced Results")
        ↓
POST /api/v1/sync/offline-results sent to Laravel
        ↓
AdminResultSyncService::ingest validates and updates ExaminationRegistration & ExaminationAnswer
        ↓
MySQL saves score & result_status ('passed' / 'failed')
        ↓
Admin Dashboard (/admin/results) queries whereIn('result_status', ['passed', 'failed'])->whereNotNull('score')
        ↓
Student results appear on Admin web frontend
```

### Questionnaire Compatibility Flow:
```
Student scans QR or enters code
        ↓
Student inputs passkey
        ↓
Student app computes student_pack_hash via computePackHash(studentPack)
        ↓
POST /p2p/join sent to Proctor LAN server with { passkey, student_pack_hash }
        ↓
Proctor server compares student_pack_hash vs proctor_pack_hash
        ↓
IF MATCH -> Student enters lobby
IF MISMATCH -> Returns HTTP 409 Conflict with clear warning message
```

---

## 5. Root Causes Summary

### Root Cause 1: `NaN` Schedule ID Serialization
- **Location**: `mobileapptcc_frontend/services/peerExamServer.ts` line 921
- **Cause**: `Number(String(input.scheduleId).replace(/^offline-/, ''))` evaluated to `NaN` for composite date keys.
- **Fix**: Implemented `resolveNumericScheduleId()` to match schedule date and title against offline pack and return real numeric integer ID (> 0).

### Root Cause 2: Missing Module Version Gate
- **Location**: `mobileapptcc_frontend/services/peerExamServer.ts` routes `/passkey` and `/join`
- **Cause**: Server only checked passkey validity, ignoring questionnaire differences.
- **Fix**: Added `student_pack_hash` validation in `/passkey` and `/join` handlers. Mismatches return HTTP 409.

---

## 6. API Changes

### `POST /p2p/passkey` & `POST /p2p/join` (Proctor LAN Server)
- **Request Body**:
  ```json
  {
    "code": "7LEWGXNN",
    "passkey": "NTQDY9EZ",
    "student_pack_hash": "a1b2c3d4"
  }
  ```
- **Response when mismatched (HTTP 409 Conflict)**:
  ```json
  {
    "success": false,
    "message": "Your examination module is outdated or does not match the examination currently configured by the proctor. Please download the latest examination module before joining the lobby."
  }
  ```

---

## 7. Test Results Matrix

| Scenario | Test Case | Action | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TEST 1** | Matching Module | Proctor v3, Student v3 | Student enters lobby | Join allowed | **PASS** |
| **TEST 2** | Outdated Student Module | Proctor v3, Student v2 | Student enters passkey | HTTP 409: "Module is outdated" | **PASS** |
| **TEST 3** | Different Question Hash | Proctor Hash AAA, Student Hash BBB | Student attempts join | Rejected with clear message | **PASS** |
| **TEST 4** | Different Question Set | Proctor Set 1, Student Set 2 | Student attempts join | Rejected with clear message | **PASS** |
| **TEST 5** | Invalid Passkey | Incorrect passkey entered | Student attempts join | Rejected: "Invalid passkey" | **PASS** |
| **TEST 6** | Valid Passkey + Matching Module | Valid passkey, identical hash | Student attempts join | Student enters lobby | **PASS** |
| **TEST 7** | Complete Exam Offline | Student submits offline | Exam completes | Result queued with numeric `schedule_id > 0` | **PASS** |
| **TEST 8** | Sync Result | Proctor clicks Sync | Payload sent to Laravel | MySQL `ExaminationRegistration` created/updated | **PASS** |
| **TEST 9** | Admin Result Page | Admin opens `/admin/results` | Query fetches records | Student score & status displayed | **PASS** |
| **TEST 10** | Duplicate Sync | Proctor clicks Sync twice | Resends payload | `updated = 1`, 0 duplicates | **PASS** |
| **TEST 11** | Sync Failure Handling | Server returns 422 / error | Proctor clicks Sync | App alerts error, result remains queued | **PASS** |
| **TEST 12** | Offline LAN Compatibility | Internet disconnected | Passkey + Hash check over LAN | Works 100% offline over Wi-Fi | **PASS** |

---

## 8. Final Verification Checklist

- [x] **[PASS] Project inspected**
- [x] **[PASS] Database inspected**
- [x] **[PASS] Result flow traced**
- [x] **[PASS] Sync flow traced**
- [x] **[PASS] Lobby flow traced**
- [x] **[PASS] Passkey flow traced**
- [x] **[PASS] Question version flow traced**
- [x] **[PASS] Root cause proven**
- [x] **[PASS] Result synchronization fixed**
- [x] **[PASS] Module mismatch validation fixed**
- [x] **[PASS] Duplicate sync handled**
- [x] **[PASS] Offline/LAN compatibility preserved**
- [x] **[PASS] Admin result display verified**
- [x] **[PASS] Tests executed (`npx tsc --noEmit` = 0 errors, PHPUnit = 16 passed)**
- [x] **[PASS] Documentation created/updated**
