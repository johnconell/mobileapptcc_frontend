# Capstone project structure — Mobile Entrance Examination System

**Product:** Hybrid offline–online entrance examination client (React Native / Expo SDK 54).

**Roles in this app:** **Proctor** and **Examinee** (applicant). **Admin** uses the separate web dashboard (`metcc_frontend`); admin flows are not duplicated here.

**Architecture:** Cloud Laravel API (`metcc_backend`) for login, packs, and sync; **LAN** HTTP peer (port 9777) between proctor and examinee phones during the session.

This document is the **capstone folder tree** for advisers. The repo uses **Expo Router** (`app/` = navigation + screen shells) instead of a generic `src/screens` tree; behavior lives in `features/` and `shared/`.

---

## Full folder tree

```
mobileapptcc_frontend/
├── app/                              # Navigation (Expo Router) — thin screen shells, path = deep link
│   ├── _layout.tsx                   # Root layout, fonts, providers
│   ├── index.tsx                     # Landing (examinee entry + proctor link)
│   ├── offline-prepare.tsx           # Exam pack preparation shell
│   ├── (proctor)/                    # Proctor role routes
│   │   ├── login.tsx
│   │   ├── lobby.tsx | room.tsx | rooms.tsx | sessions.tsx | account.tsx
│   │   └── (tabs)/                   # Dashboard, examination, results, settings
│   └── (student)/                    # Examinee role routes (student = examinee)
│       ├── scan.tsx                  # QR + room code join
│       ├── passkey.tsx | confirmation.tsx
│       ├── lobby.tsx | exam.tsx | submitting.tsx | completed.tsx
│       └── …
│
├── features/                         # Role-aligned feature modules (domain logic)
│   ├── authentication/             # Proctor online login (Sanctum)
│   ├── proctors/                     # Proctor session profile / store
│   ├── applicants/                   # Examinee identity, passkey state
│   ├── examinations/                 # Exam UI, timer, questions, LAN peer, lifecycle
│   ├── lobby/                        # Waiting lobby (proctor + examinee)
│   ├── synchronization/              # Offline exam pack, local cache, result queue
│   ├── monitoring/                   # NetInfo, campus Wi‑Fi gate, network monitor
│   ├── security/                     # Barrel: anti-cheat & kiosk (see examinations + monitoring)
│   ├── schedules/                    # Proctor schedule / session lists
│   ├── results/                      # Proctor results & sync status views
│   ├── settings/                     # App settings store
│   ├── dashboard/                    # Proctor home summary
│   └── qr-scanner/                   # Join-flow helpers (with scan routes)
│
├── shared/                           # Cross-role reusable code
│   ├── components/                   # SchoolLogo, VersionInfo
│   │   └── ui/                       # Button, Card, Header, QuestionCard, …
│   ├── hooks/                        # useAppTheme, useHardwareBack, …
│   ├── services/                     # api.ts, storage, DeviceService
│   ├── constants/                    # STORAGE_KEYS, APP_NAME, …
│   ├── theme/                        # Colors, typography (Poppins), examProcess tokens
│   ├── types/                        # Shared TypeScript models
│   ├── utils/                        # Formatters, choice keys, navigation helpers
│   ├── providers/                    # AppProviders (React Query, etc.)
│   └── contexts/                     # SessionContext
│
├── config/                           # Capstone “config” entry — re-exports env + API helpers
│   ├── index.ts
│   └── env.ts
│
├── assets/                           # Static images & app icons (see assets/README.md)
│   └── README.md
│
├── plugins/                          # Expo config plugins (exam security native hooks)
├── patches/                          # patch-package fixes
│
├── tests/                            # Capstone test layout (unit + integration)
│   ├── unit/
│   │   └── README.md
│   └── integration/
│       ├── exam-flow.test.ts         # Join → passkey → lobby → exam (placeholders + smoke)
│       └── sync-logic.test.ts        # Pack / sync helpers (placeholders + smoke)
│
├── docs/                             # Architecture, manuals, this structure doc
├── scripts/                          # generate-mock-data, tooling
│
├── .env.example                      # EXPO_PUBLIC_* API URLs (never commit .env)
├── .gitignore
├── app.json | eas.json | package.json
├── tsconfig.json                     # Path alias `@/*` → repo root
└── README.md                         # Setup, env, run, architecture summary
```

Colocated tests also live next to the code they cover, e.g. `features/examinations/services/*.test.ts` (existing capstone-style unit tests).

---

## Folder purposes (for your adviser)

| Folder | Purpose |
|--------|--------|
| **`app/`** | **Navigation & screens (shells only).** Expo Router maps URLs to files. Keeps routing stable while business logic stays testable in `features/`. |
| **`features/authentication`** | Proctor sign-in against cloud API; Google redirect helper; offline proctor hash cache from exam pack. |
| **`features/proctors`** | Logged-in proctor profile (Zustand). |
| **`features/applicants`** | Examinee store, student repository, cleanup when leaving exam flow. |
| **`features/examinations`** | Core exam engine: LAN **peerExamServer** / **peerExamClient**, question repo, exam store, passkey classification, start coordinator, progress persistence, exam UI chrome. |
| **`features/lobby`** | Lobby repository and UI components; sync with proctor session before start. |
| **`features/synchronization`** | **Offline storage:** exam-day pack download, `offlineStore`, local exam material, queued results for cloud sync. |
| **`features/monitoring`** | **NetInfo-based** connectivity, campus Wi‑Fi validation before join, LAN discovery, violation hooks. |
| **`features/security`** | Single import surface for **anti-cheat**: screenshot blocking, recording detection, app-switch / kiosk (implemented in examinations + native plugins). |
| **`features/schedules` / `results` / `dashboard` / `settings`** | Proctor-facing tabs: schedules, results dashboard, settings. |
| **`features/qr-scanner`** | QR / code join coordination (screens in `app/(student)/scan.tsx`). |
| **`shared/components/ui`** | Reusable UI primitives (design system). |
| **`shared/services`** | **API client**, secure storage, device helpers — cloud + configurable LAN base URL. |
| **`shared/constants` + `config/`** | App-wide constants and **environment-driven API endpoints** (`EXPO_PUBLIC_*`). |
| **`assets/`** | Icons and branding referenced from `app.json`. |
| **`plugins/`** | Native exam-security integration (kiosk, capture blocking where supported). |
| **`tests/`** | Dedicated **unit / integration** layout for capstone documentation; extends colocated `*.test.ts` in features. |

---

## Mapping: generic capstone names → this repo

| Typical capstone folder | This project |
|-------------------------|--------------|
| `src/screens` | `app/**/*.tsx` (shells) + feature components |
| `src/navigation` | Expo Router file tree under `app/` |
| `src/services/api` | `shared/services/api.ts` |
| `src/services/lan` | `features/examinations/services/peerExam*.ts`, `features/monitoring/services/peerLanDiscovery.ts` |
| `src/services/sync` | `features/synchronization/**`, proctor sync routes in repositories |
| `src/offline-storage` | `features/synchronization/services/offlineStore.ts`, `examProgressStore.ts`, `appStorage` |
| `src/security` | `features/security/index.ts` → examinations + monitoring + plugins |
| `src/config` | `config/` + `.env` + `shared/constants` |

---

## Key flows (for defense slides)

1. **Examinee:** Landing → scan QR / enter code → passkey → confirm → lobby (download) → exam (kiosk + violations) → submit → completed.  
2. **Proctor:** Login (cloud) → download pack → open room → QR/code lobby → start exam → end session → sync results (cloud when online).  
3. **Hybrid:** Before/during setup, cloud or pack; during exam, **LAN** to proctor device; after exam, **auto-sync** when network returns.

See also [architecture.md](./architecture.md) and [FEATURE_MAP.md](./FEATURE_MAP.md).
