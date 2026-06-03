# Videh native app (Expo Go is not used)

Videh needs **react-native-webrtc**, **CallKeep**, and custom Android plugins. These do **not** run in Expo Go.

Use one of these workflows instead.

## Option A — Local build on your PC (best for daily dev)

**Requirements:** Android Studio, USB debugging enabled on phone, Node 20+, pnpm.

```bash
cd Videh-Messenger/artifacts/videh
pnpm install
pnpm android
```

- First run compiles the native app and installs **Videh** on the device.
- Metro bundler starts; shake device → reload after JS changes.
- **Group calls and voice/video work** in this build.

iOS (Mac only):

```bash
pnpm ios
```

## Option B — EAS development APK (no Android Studio)

```bash
cd Videh-Messenger/artifacts/videh
pnpm build:dev-apk
```

1. Open the EAS build URL and install the APK on Android.
2. Start Metro:

```bash
pnpm start
```

3. Open the **Videh** dev app (icon says Videh, not Expo Go) and scan the QR or enter the URL.

## Option C — Preview / production APK or AAB

| Command | Output |
|---------|--------|
| `pnpm build:preview-apk` | Internal test APK |
| `pnpm build:production` | Play Store AAB |

## Do not use

- **Expo Go** from Play Store — blocked in app with an explanation screen.
- `expo start` without `--dev-client` after you have a dev build — use `pnpm start` (script sets `--dev-client`).

## Web

Browser chat works without a native build. Calls on web use browser WebRTC (`pnpm` web target if configured).
