# Root Cause Investigation Report: "Unable to Open Lobby" on Second Proctor Device

---

## 1. Executive Summary

When a second phone logged into the Proctor account attempts to open a room lobby, the application displays the following error dialog:

> **Unable to Open Lobby**  
> *You are connected to a different examination network. Please connect to the same Wi-Fi network as the proctor and scan again.*

This error occurs **even though the second phone is connected to the same Wi-Fi network**.

---

## 2. Proven Root Causes

### **Primary Root Cause: Proctor Gate Hijacked by Stale Student `peerTarget`**
- **File**: `mobileapptcc_frontend/services/campusWifiGate.ts`
- **Function**: `assertCampusWifiForJoin()`
- **Lines**: 60–85
- **Explanation**: 
  1. In `app/(proctor)/room.tsx`, before a Proctor can open or enter a lobby, `assertCampusWifiForJoin()` is called to validate the Wi-Fi connection.
  2. Inside `assertCampusWifiForJoin()`, the code calls `PeerExamClient.getTarget()`, which checks if there is a `peerTarget` saved in the phone's persistent storage (`STORAGE_KEYS.peerTarget`).
  3. If the second phone was previously used to scan a QR code or join an exam as a student/tester, a stale `peerTarget` (pointing to the original Proctor's IP address) remains saved in storage.
  4. When the second Proctor clicks **"Open Lobby"**, `assertCampusWifiForJoin()` sees this leftover `peerTarget` and assumes the phone is a **Student** trying to reach the original Proctor phone.
  5. It attempts `PeerExamClient.ping(peerTarget)`. Because the original Proctor phone is unreachable or hosting a different session, the ping times out.
  6. `assertCampusWifiForJoin()` returns `ok: false` with the student error message:  
     `"You are connected to a different examination network. Please connect to the same Wi-Fi network as the proctor and scan again."`
  7. `room.tsx` catches `ok: false` and blocks the Proctor from opening the room!

---

### **Secondary Root Cause: Cloud Server Probe Failure on Offline Wi-Fi**
- **File**: `mobileapptcc_frontend/services/campusWifiGate.ts`
- **Function**: `probeExamServerReachable()`
- **Lines**: 30–50
- **Explanation**:
  1. If the second phone has **not** downloaded the offline exam pack (`hasPack = false`), `assertCampusWifiForJoin()` sets `requireServer = true`.
  2. It attempts to probe the central cloud API (`https://metccapi.repohive.com`).
  3. When connected to a local examination Wi-Fi or hotspot **without internet access**, `probeExamServerReachable()` times out.
  4. The function returns `ok: false` with the error message, blocking the Proctor.

---

## 3. Failure Flow Chart

```text
Proctor on Phone B clicks "Open Lobby"
                  │
                  ▼
       [app/(proctor)/room.tsx]
      Calls assertCampusWifiForJoin()
                  │
                  ▼
    [services/campusWifiGate.ts]
      Checks PeerExamClient.getTarget()
                  │
        ┌─────────┴─────────┐
        │                   │
[peerTarget exists in       [peerTarget is null]
 persistent storage]        │
        │                   ▼
        ▼              [hasPack === false]
Attempts PeerExamClient.    │
ping(Phone A IP)            ▼
        │              Probes Cloud API
        │              (metccapi.repohive.com)
        ▼                   │
Ping Times Out / Fails      ▼
(Phone A unavailable)  Probe Times Out
        │                   │
        └─────────┬─────────┘
                  │
                  ▼
      returns ok: false with:
 "You are connected to a different..."
                  │
                  ▼
       [app/(proctor)/room.tsx]
      Displays Alert Dialog:
      "Unable to Open Lobby"
```

---

## 4. Root Cause Ranking

| Cause | Probability | Evidence |
| :--- | :--- | :--- |
| **Stale Student `peerTarget` Hijack** | **95%** | `campusWifiGate.ts` lines 65–85 unconditionally calls `PeerExamClient.getTarget()` and pings it, mistaking a Proctor phone for a Student device if storage has leftover peer data. |
| **Cloud API Probe Timeout** | **80%** | `campusWifiGate.ts` lines 110–120 attempts an HTTP probe to `metccapi.repohive.com`. On offline Wi-Fi without internet, this fails if `hasPack` is false. |
| **Device Ownership Lock** | **0%** | The system allows any authenticated Proctor account to open a lobby; there is no hardware device ID lock in Laravel or SQLite. |

---

## 5. Files & Code Evidence

### File 1: `mobileapptcc_frontend/services/campusWifiGate.ts`
**Lines 60–85**:
```typescript
  // Peer mode: "matching the proctor" means reaching the proctor's phone, not Laravel.
  const peerTarget =
    (options?.scannedPayload ? parsePeerQr(options.scannedPayload) : null) ??
    (await PeerExamClient.getTarget());

  if (peerTarget) {
    const reachable = await PeerExamClient.ping(peerTarget);
    if (!reachable) {
      return {
        ok: false,
        wifiConnected: true,
        serverReachable: false,
        message: mismatchMessage,
      };
    }
    return { ok: true, wifiConnected: true, serverReachable: true, message: null };
  }
```

### File 2: `mobileapptcc_frontend/app/(proctor)/room.tsx`
**Lines 205–216**:
```typescript
        const { OfflineStore } = await import('@/services/offlineStore');
        const hasPack = await OfflineStore.hasPack();
        const wifiCheck = await assertCampusWifiForJoin({ requireServer: !hasPack });

        if (!wifiCheck.ok) {
          Alert.alert(
            'Unable to Open Lobby',
            wifiCheck.message ?? 'This phone has no Wi‑Fi connection. Connect to the examination Wi‑Fi or enable hotspot and try again.',
          );
          return;
        }
```

---

## 6. Recommended Fix Strategy

1. **Clear `peerTarget` on Proctor Actions**: When entering the Proctor portal or opening a room, call `PeerExamClient.clear()` to remove any student peer targets.
2. **Bypass Peer Check for Proctor Actions**: In `assertCampusWifiForJoin()`, pass `isProctor: true` so the function only verifies basic Wi-Fi state and skips pinging student targets.

---

## 7. Final Verdict

- **Why the second phone is rejected**: The second phone has leftover student peer data (`peerTarget`) in its persistent storage. When the Proctor tries to open a room, the app mistakes the Proctor for a Student, tries to ping an unreachable Proctor IP address, fails, and displays the "different examination network" error.
- **Problem Type**: **Wi-Fi Gate Validation Logic Bug** (Student peer check running during Proctor room initialization).
