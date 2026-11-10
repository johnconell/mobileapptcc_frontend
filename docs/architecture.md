# Mobile app — architecture

Expo Router + TypeScript. Two personas share one APK: **proctor** and **applicant**.

## Layout

```
app/                 Expo Router shells only (path = deep link)
features/<name>/     components, hooks, services, repositories, stores,
                     utils, validation, plus an index.ts barrel
shared/              cross-feature primitives (see docs/FEATURE_MAP.md)
plugins/ patches/    native build + exam-security glue
docs/                this documentation; docs/reports/ keeps past investigations
```

A module belongs in `shared/` only when more than one feature imports it.
Everything else lives with its feature.

## Folder rules

| Path | May I move it? |
|---|---|
| `app/**` | **No.** File path = deep link / screen URL. |
| `features/<name>/**` | Yes, within the feature. Update the barrel. |
| `shared/**` | Yes, but check callers — everything imports through `@/shared/...`. |
| Native `android/`, `ios/`, `plugins/` | Native builds / exam security. Do not "organize" casually. |

Path alias `@/*` maps to the repo root in both `tsconfig.json` and
`babel.config.js`. Keep those two in sync.

## Route tree (stable)

```
/                          landing
/(proctor)/login           proctor sign-in
/(proctor)/(tabs)/dashboard|examination|results|settings
/(proctor)/lobby|room|rooms|sessions|account
/(student)/scan|enter-code|verify|passkey|confirmation|lobby|exam|submitting|completed
/offline-prepare
```

## Offline LAN

Proctor phone runs `features/examinations/services/peerExamServer.ts` on port
9777; applicant traffic uses `features/examinations/services/peerExamClient.ts`.
The HTTP socket carries only a public-key handshake and AES-256-GCM ciphertext.
The proctor's room-specific X25519 identity public key is embedded in the room QR
code and pinned by the applicant before any exam request. Handshake failures,
identity mismatches, and replayed/out-of-order messages fail closed; there is
no plaintext request fallback.

No certificate installation is required. QR scanning remains the strongest
identity provisioning path. Typed-code discovery first reuses a previously
pinned target and otherwise probes the current Wi-Fi subnet for the code-only
bootstrap endpoint. That endpoint returns only the matching room code and
public identity key; the applicant then performs the same encrypted handshake
and passkey/room/assignment validation as QR joins. If the proctor identity
changes, the current room QR or a fresh typed-code discovery is required.
Pack persistence: `features/synchronization/services/offlineStore.ts` and
`offlineExamRepository.ts`.

The proctor resolves its private Wi-Fi address when opening/restoring a room and
refreshes it on network-state events (with an 8-second fallback poll). An address
change restarts the listener on port 9777, updates the live lobby snapshot/QR,
and syncs the current session address for code-based discovery. The address is
not retained in the local peer-session record. Peer QR JSON carries `h` (host),
`p` (port), `c` (exam code), `s` (schedule), `r` (room), and `w` (Wi-Fi name).
Applicants establish the authenticated encrypted channel before probing
`/p2p/health` or submitting a passkey. An unreachable host is reported as a
connection/Wi-Fi issue, not as a rejected key. QR-based peer joins do not
require internet access.
Other data-bearing API calls use HTTPS in release builds; the app rejects
cleartext API base URLs instead of falling back to HTTP. The peer listener is
the only LAN exam-data path and accepts requests only through its encrypted
channel. Network-discovery probes carry no credentials or exam answers.

### Proctor phone during a room

Keep the proctor phone plugged into power, set this app to unrestricted battery
use, and keep the app open while the room is active. Android shows an ongoing
exam-room notification and the host service holds partial CPU and Wi-Fi locks
while the room is running. These protections reduce background suspension, but
they cannot keep the LAN listener alive after a force-stop or power-off; opening
the app again restores the saved room and rebinds its listener.

## Setup

```bash
npm install
npx expo start
npm test          # node:test suites
npm run typecheck # tsc --noEmit
```

Production updates: `eas update --branch production` (JS). Native changes need a new APK.
