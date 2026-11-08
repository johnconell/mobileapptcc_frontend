# MasterExam iOS TestFlight deployment

This project builds its existing Expo React Native app with EAS Build. The iOS bundle identifier is `edu.tcc.entranceexam`, the displayed iOS name is **MasterExam – TCC**, the Expo version is `1.0.0`, and the starting iOS build number is `1`. EAS production builds use remote version management and auto-increment, so the first cloud build may assign the next number recorded for this EAS project. The EAS project ID is already configured in `app.json`.

The Android package, Android build type, API URLs, exam implementation, and offline protocol are unchanged. A Mac is not required for cloud builds or submissions from Windows.

## Apple account and institution enrollment

1. Have an authorized TCC representative enroll the institution as an organization in the [Apple Developer Program](https://developer.apple.com/programs/enroll/). Organization enrollment needs a legal entity, a D‑U‑N‑S number (except government entities), a working organization website/email, and someone authorized to accept Apple's agreements.
2. Because TCC is an educational institution, request the fee waiver during enrollment. Apple grants it only to qualifying accredited institutions and other eligible entities, subject to its conditions (including no paid apps/in-app purchases and no sale of digital goods/services in apps). Approval is Apple's decision. Otherwise the membership is USD 99/year, with local pricing where available. A free Apple Account alone cannot distribute through TestFlight.
3. Use the institution's organizational developer team and add the staff who will administer App Store Connect. Students do not need Developer Program membership to install a TestFlight build.

## Create the App Store Connect record

1. In [App Store Connect](https://appstoreconnect.apple.com/), select **Apps → + → New App**. Choose iOS, enter **MasterExam – TCC**, select the existing bundle ID `edu.tcc.entranceexam`, and choose a unique SKU such as an institution-controlled internal code. Do not create a different bundle ID.
2. Record the numeric **Apple ID** shown under the app's **App Information**. This is the App Store Connect `ascAppId`; it is not the bundle ID, Apple Account, or Team ID. Add it to `submit.production.ios.ascAppId` in `eas.json` after the record exists if you want submission to select the record without prompting. No value is guessed or committed here.
3. Fill in the app's privacy, age-rating, copyright, export compliance, contact, and beta review information as requested in App Store Connect. `ITSAppUsesNonExemptEncryption` is already `false` because the app uses exempt standard encryption; answer Apple's export questions truthfully for the final binary and current rules.

## Connect EAS and build from Windows

From PowerShell, open the project directory and install/login to EAS CLI:

```powershell
cd .\mobileapptcc_frontend
npm install
npx eas-cli login
npx eas-cli project:info
```

The existing EAS project ID should be shown. If authentication or ownership reports a mismatch, stop and have the Expo project owner grant access; do not replace the project ID casually. Start the iOS build:

```powershell
npx eas-cli build --platform ios --profile production
```

On first iOS build, EAS prompts to connect to the Apple Developer account and create or select the distribution certificate and App Store provisioning profile. Sign in interactively on the trusted workstation and approve creation/management through EAS. Apple passwords, API keys, certificates, and provisioning profiles do not belong in source control or this guide. Do not put credentials in `eas.json`.

The `production` profile explicitly selects iOS store distribution and retains the existing Android APK production settings. EAS produces an App Store Connect-compatible `.ipa` in Expo's cloud and provides a build page/download when complete. This configuration alone does not mean a build has succeeded; no Apple credentials were available in this workspace to start or verify a cloud build.

Submit the finished build from Windows:

```powershell
npx eas-cli submit --platform ios --profile production
```

EAS Submit can prompt for Apple authentication and build selection. It uploads to App Store Connect; it does not create the app's public TestFlight link or approve external testing. An API key can instead be configured in EAS credentials for unattended submissions, but keep its `.p8` file and identifiers in a protected secret store. Never commit it. If configuring `ascAppId`, use the number from the App Store Connect record.

## TestFlight groups and invitations

1. Wait for App Store Connect to process the uploaded build. Fix any processing or compliance warnings before continuing.
2. Under **TestFlight → Internal Testing**, create a group and add up to 100 App Store Connect users with access to the app. Add the processed build to the group. Internal testers generally do not require the external beta review.
3. For students/proctors outside the App Store Connect team, create an **External Testing** group, fill in beta app description, feedback email, and **What to Test**, then add the build. Apple's first external build review is required before external testing; later builds may also be reviewed. TestFlight approval is not App Store release approval.
4. When Apple marks the build ready, enable a public link for the external group if desired, set any device/participant limits, and copy its official URL (`https://testflight.apple.com/join/...`). Anyone receiving it still needs a supported iPhone/iPad and Apple's free TestFlight app. A public link is an invitation to the group, not a direct app download.
5. TestFlight builds are usable for at most 90 days. Before expiry, increment/build the next production iOS version, upload it, let Apple process/review it as applicable, and add it to the same testing group. Existing invite links can continue to serve the group when a new build is assigned, subject to group settings and Apple's status.

## Configure the exam email invitation

In the admin **Email Templates** editor, edit the examination schedule/passkey email. Enable **Show mobile application download section**, set the application name and campus exam Wi-Fi/offline preparation instructions, and paste the official TestFlight invitation URL into **Official TestFlight invitation URL**. The email's default iOS button text is **Install MasterExam for iOS**. Save and publish the template after reviewing the email preview. The iOS link is omitted unless a URL using the official `testflight.apple.com/join/...` format is saved. Android continues to use its separate existing download URL.

Students and proctors: install Apple's TestFlight app, open the invitation link on the iPhone, accept the invitation, tap **Install**, and open MasterExam. Install and download/update the exam pack while internet is available. At exam time, join the same campus examination Wi-Fi as the proctor; the exam's peer connection and cached pack/answer storage support the existing offline workflow. TestFlight installation, beta approval, and invitations cannot be performed inside MasterExam.

## Offline behavior and verification limits

The app already declares `NSLocalNetworkUsageDescription` and `NSAllowsLocalNetworking`. Its offline peer transport uses the room QR's direct private IP and TCP port 9777, not Bonjour browsing, so it does not need an `NSBonjourServices` entry. The LAN channel, pack storage, authentication, proctor rooms, student progress, reconnection, and queued synchronization remain in their existing features and are not changed for TestFlight. A build-device exam rehearsal is still required: iOS privacy prompts, campus access-point client isolation, power/background behavior, and recovery after a real Wi-Fi outage cannot be proven by config/type checks alone. On first local network access, users must allow iOS Local Network access for MasterExam.

## Checks and release commands

From `mobileapptcc_frontend`:

```powershell
npx expo config --type public
npm run typecheck
npm test
npx eas-cli build --platform ios --profile production
npx eas-cli submit --platform ios --profile production
```

The first three commands validate local configuration/code. The final two need an authenticated Expo account, working EAS project access, Apple Developer Program membership or approved waiver, and Apple signing/App Store Connect setup. After every native configuration change, upload a new iOS build; EAS Update alone cannot change native permissions or display metadata.
