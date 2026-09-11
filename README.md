# METCC Mobile — TCC Entrance Examination

Expo (SDK 54) app for **proctors** and **applicants**. Administrators use `metcc_frontend`. API: `metcc_backend`.

**Start here**

- [docs/architecture.md](docs/architecture.md) — folder rules (do not move `app/` routes)
- [docs/FEATURE_MAP.md](docs/FEATURE_MAP.md) — feature barrels under `features/`
- [docs/user-manual.md](docs/user-manual.md)
- [docs/technical-manual.md](docs/technical-manual.md)

## Flows

**Proctor:** Login (online) → Download exam pack → Open room → QR / lobby → Start → Sync results  

**Applicant:** Home → Scan QR or enter code → Passkey → Lobby → Exam → Submit (questions wiped)

## Run

```bash
npm install
npx expo start
```

JS updates: `eas update --branch production`. Native/plugin changes need a new APK.

---

# INVESTIGATION REPORT: STUDENT LOBBY SYNCHRONIZATION FAILURE

## 1. Most Likely Root Cause: LAN Congestion & Response Serialization Latency
**Confidence: High (90%)**

In a 50–60 student environment, the proctor's phone (acting as the LAN server) is overwhelmed by the "Request Storm." 
- **The Math**: Each student performs a "Quick Status" check (2s), a "Full Lobby" poll (4s), and a "Heartbeat" (4s).
- **The Load**: For 60 students, the proctor phone must process approximately **45–60 HTTP requests per second**.
- **The Bottleneck**: `peerExamServer.ts` uses `buildSnapshot()`, which iterates through the entire roster of 60 students, performs string manipulations, and calculates remaining time for every single request. 
- **The Result**: The proctor's JavaScript thread locks up during JSON serialization. Requests timeout on the student side, causing the "Connection Interrupted" message. Because the "Start Exam" signal is delivered via these same congested channels, the student never receives the `in_progress` flag.

---

## 2. Second Most Likely Root Cause: Token-Gated Signal Monitor
**Confidence: Medium (75%)**

The "Quick Status" monitor (the fastest way to detect the start) is **hard-gated** by the `participationToken`.
- **Evidence**: In `lobby.tsx`, the `checkSignal` function requires a valid token to run.
- **The Chain Break**: If the initial "Join Handshake" is delayed by the LAN congestion mentioned above, the student never receives a token. Because they have no token, the "Quick Status" monitor **silently exits**. The student is now 100% dependent on the "Full Lobby Poll" which is the heaviest and most likely request to fail under load.

---

## 3. Third Most Likely Root Cause: State Machine "Transition Lock"
**Confidence: Medium (60%)**

The `LobbyState` in `lobby.tsx` relies on data snapshots that may become stale during network errors.
- **The Gap**: If the network returns partial errors (503/Timeout), the UI "trusts" the last known memory (storedSnapshot) which might still have the status as `lobby_open`, creating a visual illusion that the proctor hasn't started yet.

---

## 4. Summary of Findings
The system fails under load because it attempts to maintain **"Thick Data"** synchronization (sending full student rosters) over a **"Thin Pipe"** (Mobile Hotspot LAN). 

1.  Students who fail the initial "Handshake" never activate their high-speed signal monitors.
2.  The Proctor's phone cannot serialize the status of 60 students fast enough to respond to the high request volume.
3.  The student app defaults to stale memory when the network fails, preventing the "Start" transition.

**Overall Confidence Score: 85%**
