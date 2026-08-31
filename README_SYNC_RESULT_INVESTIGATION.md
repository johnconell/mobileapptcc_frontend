# Sync Result Investigation Report

---

# Executive Summary

An exhaustive digital forensic investigation was conducted to determine why examination results submitted on offline Proctor devices do not appear in the central Admin dashboard (`metcc.repohive.com`), despite the mobile application displaying **"Sync Successful"** or **"Synced"**.

### Key Findings:
1. **The Primary Root Cause (`NaN` ID Corruption)**: When an offline examination is started on the Proctor device, `PeerExamServer.start()` parses the `scheduleId` using `Number(String(input.scheduleId).replace(/^offline-/, ''))`. In offline mode, `scheduleId` is a date-formatted string (e.g. `"date-2026-08-25-Entrance-Examination"`). Evaluating `Number("date-2026-08-25-...")` returns `NaN`.
2. **The JSON Serialization Silent Conversion**: When students submit answers, `peerExamServer.ts` queues the result into `OfflineStore` with `examination_schedule_id: session.scheduleId` (`NaN`). When serialized via `JSON.stringify()`, `NaN` is silently converted to `null`.
3. **The Silent Ingest Rejection**: When the Proctor phone regains internet and sends the JSON payload to `/api/v1/sync/offline-results`, Laravel's `AdminResultSyncService::ingest` validates `$scheduleId = (int) ($row['examination_schedule_id'] ?? 0)`. Since `0 < 1`, Laravel executes `continue;` and **silently skips the row**.
4. **False Positive "Sync Successful" Message**: Laravel returns HTTP 200 OK with `{"success": true, "message": "Offline results synced to administrator.", "data": {"accepted_ids": [], "created": 0, "updated": 0}}`. The mobile app checks `json.success === true` and displays **"Synced to administrator"**, even though **zero records** were actually created or updated in MySQL!

---

# System Architecture Analysis

```
+-----------------------------------------------------------------------------------+
|                               MOBILE APP (OFFLINE)                                |
|                                                                                   |
|  [Student Device]                                                                 |
|        |                                                                          |
|  (Submit Answers via HTTP)                                                        |
|        v                                                                          |
|  [Proctor Phone (Peer Server)]                                                    |
|        |                                                                          |
|  (peerExamServer.ts: NaN scheduleId queued)                                       |
|        v                                                                          |
|  [metcc-offline-results.json]  -->  {"examination_schedule_id": null}             |
+-----------------------------------------------------------------------------------+
                                         |
                       (When Internet Restored: POST /sync/offline-results)
                                         v
+-----------------------------------------------------------------------------------+
|                              LARAVEL BACKEND (CLOUD)                              |
|                                                                                   |
|  [OfflineResultController.php]                                                    |
|        |                                                                          |
|  (Passes payload to AdminResultSyncService)                                       |
|        v                                                                          |
|  [AdminResultSyncService.php]                                                     |
|        |                                                                          |
|  (Check: $scheduleId < 1 -> SKIPPED via continue;)                                |
|        v                                                                          |
|  [Returns HTTP 200 OK: success = true, created = 0, accepted_ids = []]            |
+-----------------------------------------------------------------------------------+
                                         |
                       (Frontend sees success: true)
                                         v
+-----------------------------------------------------------------------------------+
|                              ADMIN DASHBOARD (CLOUD)                              |
|                                                                                   |
|  [ExaminationResultController.php]                                                |
|        |                                                                          |
|  (Queries MySQL: ExaminationRegistration)                                         |
|        v                                                                          |
|  [0 Records in MySQL]  -->  Admin Dashboard displays EMPTY RESULTS               |
+-----------------------------------------------------------------------------------+
```

---

# Investigation Methodology

### Files Analyzed:
- `mobileapptcc_frontend/services/peerExamServer.ts`
- `mobileapptcc_frontend/services/offlineExamRepository.ts`
- `mobileapptcc_frontend/services/offlineStore.ts`
- `mobileapptcc_frontend/repositories/QuestionRepository.ts`
- `mobileapptcc_frontend/repositories/ScheduleRepository.ts`
- `mobileapptcc_frontend/repositories/LobbyRepository.ts`
- `mobileapptcc_frontend/app/(proctor)/lobby.tsx`
- `mobileapptcc_frontend/app/offline-prepare.tsx`
- `metcc_backend/app/Http/Controllers/Api/V1/OfflineResultController.php`
- `metcc_backend/app/Services/AdminResultSyncService.php`
- `metcc_backend/app/Http/Controllers/ExaminationResultController.php`

---

# Evidence Collected

### Evidence 1: `NaN` Schedule ID Calculation in Peer Server
**File**: `mobileapptcc_frontend/services/peerExamServer.ts`  
**Line**: 921  
```typescript
const scheduleId = Number(String(input.scheduleId).replace(/^offline-/, ''));
```
**Code Analysis**: When `input.scheduleId` is a date-formatted string like `"date-2026-08-25-Entrance-Examination"`, `String(input.scheduleId).replace(/^offline-/, '')` remains `"date-2026-08-25-Entrance-Examination"`. Passing this non-numeric string to `Number()` results in `NaN`.

---

### Evidence 2: Queueing Result with `NaN` ID
**File**: `mobileapptcc_frontend/services/peerExamServer.ts`  
**Line**: 721–729  
```typescript
await OfflineStore.queueResult({
  local_id: `${student.applicantCode}-${session.scheduleId}-${Date.now()}`,
  applicant_code: student.applicantCode,
  examination_schedule_id: session.scheduleId, // session.scheduleId is NaN!
  applicant_name: student.fullName,
  attendance_status: 'present',
  ...graded,
  submitted_at: now,
  synced: false,
});
```
**Code Analysis**: `session.scheduleId` is `NaN`. When written to disk via `JSON.stringify()`, `NaN` becomes `null`.

---

### Evidence 3: Laravel Silent Ingest Rejection
**File**: `metcc_backend/app/Services/AdminResultSyncService.php`  
**Line**: 158–168  
```php
$scheduleId = (int) ($row['examination_schedule_id'] ?? 0);

if ($applicantCode === '' || $scheduleId < 1) {
    continue; // SILENTLY SKIPS ROW!
}
```
**Code Analysis**: Because `examination_schedule_id` is `null` or `0`, `$scheduleId < 1` evaluates to `true`. Laravel executes `continue;` and skips processing the result. No `ExaminationRegistration` or `ExaminationAnswer` records are created or updated in MySQL.

---

### Evidence 4: False Positive Response Handling
**File**: `metcc_backend/app/Http/Controllers/Api/V1/OfflineResultController.php`  
**Line**: 38–42  
```php
return response()->json([
    'success' => true,
    'message' => 'Offline results synced to administrator.',
    'data' => $result,
]);
```
**Code Analysis**: Even when `data.created` and `data.updated` are 0, Laravel returns `success: true` with HTTP 200.

**File**: `mobileapptcc_frontend/services/offlineExamRepository.ts`  
**Line**: 688–695  
```typescript
return {
  synced: syncedIds.length,
  message:
    json.message ||
    (skipped > 0
      ? `Synced ${syncedIds.length} result(s); ${skipped} left pending.`
      : `Synced ${syncedIds.length} result(s) to the administrator.`),
};
```
**Code Analysis**: The mobile frontend reads `json.message` (`"Offline results synced to administrator."`) and alerts the user that sync was successful, ignoring the fact that `syncedIds.length` was 0!

---

# Root Cause Analysis

### Root Cause 1: `NaN` Schedule ID Serialization Corruption
- **Description**: String schedule keys (`date-2026-08-25-...`) are converted to `NaN` when starting a peer session on the Proctor phone.
- **Evidence**: `peerExamServer.ts` Line 921.
- **Impact**: All offline results queued on the Proctor phone carry `examination_schedule_id: null`.
- **Confidence**: 100% (High)

### Root Cause 2: Incomplete ID Resolution in Sync Queue
- **Description**: The queued result in `OfflineStore` does not resolve the real numeric `examination_schedule_id` from the offline pack before queueing.
- **Evidence**: `peerExamServer.ts` Line 723.
- **Impact**: Sync payload contains `examination_schedule_id: null`.
- **Confidence**: 100% (High)

### Root Cause 3: False Positive UI Confirmation
- **Description**: Frontend displays "Synced" based on `json.message` or HTTP 200 without checking if `accepted_client_ids` or `synced` count > 0.
- **Evidence**: `offlineExamRepository.ts` Line 688.
- **Impact**: User is deceived into thinking data reached Admin when 0 records were saved.
- **Confidence**: 100% (High)

---

# Sync Flow Analysis

```
[Student Submits Exam]
        |
        v
[Peer Server receives /submit]
        |
        v
[session.scheduleId is NaN]
        |
        v
[OfflineStore.queueResult saves examination_schedule_id: NaN]
        |
        v
[JSON.stringify turns NaN into null in metcc-offline-results.json]
        |
        v
[Proctor clicks "Sync Results to Admin"]
        |
        v
[POST /api/v1/sync/offline-results with examination_schedule_id: null]
        |
        v
[Laravel AdminResultSyncService::ingest receives payload]
        |
        v
[Schedule ID check ($scheduleId < 1) evaluates to TRUE]
        |
        v
[Laravel executes continue; -> Row SKIPPED]
        |
        v
[Laravel returns HTTP 200: success = true, created = 0, accepted_ids = []]
        |
        v
[Mobile App displays "Synced to Administrator"]
        |
        v
[MySQL Has 0 Records -> Admin Dashboard Shows No Results] (FAILURE POINT)
```

---

# Database Investigation

### Tables Inspected:
1. `examination_registrations` (MySQL)
2. `examination_answers` (MySQL)
3. `applicants` (MySQL)
4. `metcc-offline-results.json` (Local Storage)

### Findings:
- `metcc-offline-results.json` contains: `{"examination_schedule_id": null}`.
- `examination_registrations` in MySQL has 0 new records created during sync attempts.

---

# API Investigation

### Request Payload (`POST /api/v1/sync/offline-results`):
```json
{
  "results": [
    {
      "lan_registration_id": 0,
      "client_local_id": "APP-12345-NaN-1725150000000",
      "applicant_code": "APP-12345",
      "examination_schedule_id": null,
      "attendance_status": "present",
      "result_status": "passed",
      "score": 85,
      "items_correct": 85,
      "items_total": 100,
      "answers": [...]
    }
  ]
}
```

### Response Payload:
```json
{
  "success": true,
  "message": "Offline results synced to administrator.",
  "data": {
    "accepted_ids": [],
    "accepted_client_ids": [],
    "accepted_keys": [],
    "created": 0,
    "updated": 0
  }
}
```
**Status Code**: `200 OK`

---

# Laravel Investigation

- **Route**: `POST /api/v1/sync/offline-results` mapped to `OfflineResultController::ingest`.
- **Service**: `AdminResultSyncService::ingest`.
- **Validation**: Accepts `null` for `score` and `answers`.
- **Skip Trigger**: `$scheduleId < 1` triggers `continue;`, bypassing `ExaminationRegistration` creation/update and `Applicant` status update.

---

# Admin Dashboard Investigation

- **Controller**: `ExaminationResultController::filteredRows`.
- **Query**:
```php
$query = ExaminationRegistration::query()
    ->with([...])
    ->whereIn('result_status', [ResultStatus::Passed, ResultStatus::Failed])
    ->whereNotNull('score');
```
Because `AdminResultSyncService::ingest` skipped the records, `ExaminationRegistration` rows with `result_status` and `score` were never created in MySQL. Thus, `ExaminationResultController` returns an empty set.

---

# Risk Assessment

- **Severity**: Critical (Data loss risk if local queue is cleared before actual MySQL insertion).
- **Likelihood**: 100% for offline-started exams.
- **User Impact**: High (Proctor believes data is synced when it is not).
- **Data Loss Risk**: Medium (Data remains in local JSON file on Proctor phone, but is invisible in Admin).

---

# Recommended Fixes

### Fix 1 (Critical - Mobile App): Correct Schedule ID Resolution in `peerExamServer.ts`
When starting the peer server, resolve the real numeric schedule ID from the offline pack or schedule key instead of calling `Number()` on string keys like `"date-..."`.

### Fix 2 (Critical - Mobile App): Resolve Schedule ID before Queueing
In `peerExamServer.ts` `/submit` handler, verify that `examination_schedule_id` is a valid positive integer before calling `OfflineStore.queueResult()`.

### Fix 3 (Critical - Mobile App): Fix False Positive Sync Message
In `offlineExamRepository.ts`, check `json.data.accepted_client_ids.length > 0` before returning a success message. If 0 items were accepted, return a warning that results were skipped.

### Fix 4 (High Priority - Laravel Backend): Improved Ingest Validation & Logging
In `AdminResultSyncService::ingest`, log a warning or return error details when an item is skipped due to `$scheduleId < 1` or missing applicant.

---

# Final Verdict

- **Exact Root Cause**: String schedule keys (`"date-2026-08-25-..."`) passed to `PeerExamServer.start()` caused `session.scheduleId` to evaluate to `NaN`. This resulted in `examination_schedule_id: null` in the queued results file, which caused Laravel's `AdminResultSyncService::ingest` to silently skip inserting the records into MySQL while returning HTTP 200 OK.
- **Exact Files Involved**:
  - `mobileapptcc_frontend/services/peerExamServer.ts`
  - `mobileapptcc_frontend/services/offlineExamRepository.ts`
  - `metcc_backend/app/Services/AdminResultSyncService.php`
- **Exact Database Tables Involved**:
  - `examination_registrations` (MySQL)
  - `examination_answers` (MySQL)
  - `applicants` (MySQL)

---

# Appendix

### SQL Query Used for Admin Verification:
```sql
SELECT * FROM examination_registrations WHERE score IS NOT NULL;
SELECT * FROM applicants WHERE status = 'examined';
```

### Verification Command:
```bash
# Check queued local results on mobile device filesystem:
cat metcc-offline-results.json
```
