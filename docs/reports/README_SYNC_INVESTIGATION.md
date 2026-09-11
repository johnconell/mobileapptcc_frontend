# Investigation Report: Offline Sync Failure & "Lobby Not Available"

## 1. EXECUTIVE SUMMARY
The examination system is suffering from a **"Post-Exam Data Lockdown"**. While the offline examination itself works perfectly, the application architecture prevents the Proctor from accessing or synchronizing the data once the session is marked as **"Ended"**. 

The student data is **NOT lost**; it is successfully stored on the Proctor's phone. However, a "Security Gate" in the session restoration logic incorrectly treats ended offline sessions as invalid, causing the UI to show "Lobby not available" and blocking the path to the synchronization button.

---

## 2. MOST LIKELY ROOT CAUSE
**Primary Cause: Session Restoration Lock (95% Confidence)**
The function `PeerExamServer.restore()` explicitly refuses to load any session that has a status of `ended`. 

Because `LobbyRepository.fetchProctorLobby` depends on this restoration to "see" offline data, it receives a `null` result. It then tries to ask the central server for the data, but since the exam was offline, the server returns a **404 Not Found**. This chain of events results in the "Lobby not available" error, effectively orphaning the results on the phone.

---

## 3. ROOT CAUSE EVIDENCE
- **File**: `services/peerExamServer.ts`
- **Function**: `restore()`
- **Code**: `if (!saved || saved.status === 'ended') return false;`
- **Impact**: This line prevents the UI from ever reading the student roster of a finished offline exam. Without the roster, the "Sync" button is never rendered.

---

## 4. DATA LIFECYCLE (THE BREAKPOINT)
1. **Student**: Submits answers via LAN.
2. **Proctor Phone**: Receives submission → Saves to `metcc-offline-results.json` (Queue).
3. **Proctor**: Clicks "End Exam" → Local status becomes `ended`.
4. **Proctor**: Clicks "View results & sync".
5. **Lobby UI**: Calls `restore()` → Sees `ended` → **CRASHES** with "Lobby not available".
6. **Laravel/Admin**: **[EMPTY]** Data never leaves the phone because the sync UI is unreachable.

---

## 5. RELATIONSHIP AUDIT
- **Lobby vs. Result**: The system incorrectly assumes that if the "Lobby" (the live network server) is stopped, the "Results" (the student data) no longer exist.
- **Identity Consistency**: Offline sessions use IDs like `offline-123`. The sync engine must ensure the Laravel backend accepts these prefixed IDs during the reconciliation phase.

---

## 6. WHY "LOBBY NOT AVAILABLE" APPEARS
The `ProctorLobbyScreen` (lobby.tsx) is designed to be the "Command Center" for both live and ended exams. However, it has a "Guard" at the top of its loading logic:
1. It tries to load the local session.
2. The local session says "I am ended, do not load me."
3. The screen then thinks there is no data at all.
4. It displays the `openError` message: *"This room lobby is not available..."*

---

## 7. PROOF REQUIRED BEFORE FIXING
- **Step 1**: Open the app and navigate to the ended room.
- **Step 2**: Observe the "Lobby not available" error.
- **Step 3**: Change `saved.status === 'ended'` to `false` in the code.
- **Step 4**: If the student list suddenly appears, the root cause is 100% proven.

---

## 8. PERMANENT FIX PLAN
1. **Unlock Data Retrieval**: Modify `PeerExamServer.ts` to allow `restore()` to load ended sessions for **viewing purposes**, while keeping the network server stopped.
2. **Smart Fetching**: Update `LobbyRepository.ts` to recognize that an `offline-` session ID should always check local storage before attempting a cloud request.
3. **Unified Sync Button**: Ensure the "Sync results to Admin" button in the lobby detects offline results and triggers the `syncQueuedToCloud()` worker.
4. **Data Shield**: Prevent the app from clearing the local session cache until a "Sync Success" signal is received from the central server.
