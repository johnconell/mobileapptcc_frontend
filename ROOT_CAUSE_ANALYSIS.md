# Root Cause Analysis: Auto-Login & Bottom Navigation Architecture

---

## 1. Auto-Login & Session Restoration
- **Root Cause**: On app launch, route resolution to `(proctor)` defaulted to `login.tsx` before asynchronous session storage reads (`AuthRepository.getSession()`) finished resolving. This caused a transient render frame showing the login form skeleton before redirecting.
- **Evidence**: Absence of an immediate synchronous gatekeeper route and reliance on `useEffect` redirection inside `login.tsx`.
- **Solution**: Created `app/(proctor)/index.tsx` as an instant synchronous/asynchronous auth gatekeeper that checks session state and routes directly to the Dashboard if valid, entirely preventing the login page from mounting for authenticated proctors.

---

## 2. Menu Visibility on Login Page
- **Root Cause**: Previous navigation layouts rendered global navigation overlays and drawer menus across all proctor routes unconditionally.
- **Solution**: Restructured Expo Router layout (`app/(proctor)/_layout.tsx`) to isolate authentication routes (`login`, `index`) from authenticated tab routes (`(tabs)`). Bottom navigation and proctor menus are strictly rendered only when `isLogin` is false.

---

## 3. Navigation Usability & Complexity (Sidebar vs Bottom Tabs)
- **Root Cause**: Complex side drawer navigation required multiple taps and felt non-standard for high-pressure proctor monitoring.
- **Solution**: Replaced the side drawer entirely with a modern, high-contrast, thumb-friendly TikTok-style bottom navigation (`Dashboard`, `Examination`, `Results`, `Settings`).
