# Mobile app — architecture

Expo Router + TypeScript. Two personas share one APK: **proctor** and **applicant**.

## Folder rules

| Path | May I move it? |
|---|---|
| `app/**` | **No.** File path = deep link / screen URL. |
| `features/<name>/index.ts` | Yes — this is the feature map. |
| `services/`, `repositories/`, `stores/` | Not in this pass. Import through `features/*` for new code. |
| `components/ui` | Shared primitives. Stay shared. |
| Native `android/`, `ios/`, `plugins/` | Native builds / exam security. Do not “organize” casually. |

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

Proctor phone runs `services/peerExamServer.ts` (HTTP on 9777).
Applicant uses `services/peerExamClient.ts`.
Pack persistence: `services/offlineStore.ts` + `offlineExamRepository.ts`.

## Setup

```bash
npm install
npx expo start
```

Production updates: `eas update --branch production` (JS). Native changes need a new APK.
