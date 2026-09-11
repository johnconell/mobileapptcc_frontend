# Implementation Plan - Fix "System Update Required" and Validate Offline Examination Flow

This plan addresses the blocking "System Update Required" message, ensures the offline examination workflow is robust, and improves the visibility of examination schedules.

## User Review Required

> [!IMPORTANT]
> The "System Update Required" check was previously very strict, requiring `examination_settings` to be present in the offline pack. We are relaxing this to use defaults (e.g., 90 minutes duration) if settings are missing, which prevents blocking proctors unnecessarily.

> [!TIP]
> We are updating the schedule display to show individual sessions instead of grouping them solely by date. This will help proctors distinguish between morning and afternoon batches on the same day.

## Proposed Changes

### Mobile App Frontend

#### [MODIFY] [lobby.tsx](file:///C:/Users/Casy/Documents/GitHub/mobileapptcc_frontend/app/(proctor)/lobby.tsx)
- Relax the `System Update Required` check.
- Add fallbacks for missing `examination_settings` or `question_banks`.
- Ensure `assertCampusWifiForJoin` handles the proctor's local hosting scenario without requiring a remote Laravel server.

#### [MODIFY] [room.tsx](file:///C:/Users/Casy/Documents/GitHub/mobileapptcc_frontend/app/(proctor)/room.tsx)
- Similar to `lobby.tsx`, relax the version/pack validation check.

#### [MODIFY] [OfflineExamRepository.ts](file:///C:/Users/Casy/Documents/GitHub/mobileapptcc_frontend/services/offlineExamRepository.ts)
- Update `getCachedSchedules` to include more granular session information (Time, Batch, Room).
- Ensure `ExamSchedule` objects returned from the repository contain the necessary data for the UI.

#### [MODIFY] [ScheduleCard.tsx](file:///C:/Users/Casy/Documents/GitHub/mobileapptcc_frontend/features/proctor/ScheduleCard.tsx)
- Update the UI to display the additional session information (Time, Batch, Venue/Room).

#### [MODIFY] [types/index.ts](file:///C:/Users/Casy/Documents/GitHub/mobileapptcc_frontend/types/index.ts)
- Extend `ExamSchedule` interface to include optional fields like `timeLabel`, `batchNumber`, and `venue`.

#### [MODIFY] [exam.tsx](file:///C:/Users/Casy/Documents/GitHub/mobileapptcc_frontend/app/(student)/exam.tsx)
- Ensure security features are only active for students (which they currently are by location, but adding a defensive role check if needed).
- Verify the `securityEnabled` logic.

## Verification Plan

### Automated Tests
- N/A (Manual verification on device is preferred for offline/LAN features).

### Manual Verification
1. **Offline Pack Check**:
   - Download the offline pack.
   - Disable internet.
   - Verify that "System Update Required" does NOT appear when opening a room or lobby.
2. **Schedule Visibility**:
   - Navigate to the "Examination Schedules" screen.
   - Verify that cards now show specific dates, times, and batch info.
3. **Offline Exam Workflow**:
   - Start an exam offline.
   - Verify student can join the lobby and start the exam without internet.
   - Verify security features (screenshots, app switching) are active for students during the exam.
4. **Security Check**:
   - Verify proctor device remains unrestricted.
   - Verify student security features deactivate after submission.
