# Mobile Google Sign-In setup

Google sign-in uses the native Google OAuth authorization flow in Expo. The app sends only Google's ID token to Laravel; Laravel verifies it with Google's token verification endpoint, checks the token audience and expiry, then issues the existing Sanctum proctor session. No account is created automatically.

## Google Cloud configuration

Create OAuth client IDs for the deployed app:

- Web client ID for Expo web/browser sign-in.
- iOS client ID with bundle ID `edu.tcc.entranceexam`.
- Android client ID with package `edu.tcc.entranceexam` and the signing certificate SHA-1 fingerprints used by the installed builds.
- For Expo web, register the AuthSession redirect URI generated for that deployment on the web OAuth client.

Set the public client IDs in the mobile environment before building:

```text
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=
```

Set `GOOGLE_MOBILE_CLIENT_IDS` on Laravel to a comma-separated allowlist of those same client IDs. Keep `GOOGLE_CLIENT_SECRET` server-side; it is not used by or included in the mobile app. Clear Laravel's cached configuration and rebuild the Expo app after changing OAuth client IDs.

Only an active, already registered proctor account with a verified Google email can sign in. The first successful sign-in links that Google subject to the existing proctor record. The API does not register new accounts.
