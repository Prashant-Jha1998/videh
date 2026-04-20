# Neon DB + Android APK Setup

## 1) Environment file

1. Copy `.env.example` to `.env`.
2. Fill these values:
   - `DATABASE_URL` = Neon connection string
   - `EXPO_PUBLIC_DOMAIN` = API domain (without `https://`)
   - Optional API keys (`FAST2SMS_*`, `AGORA_*`)

Example Neon URL:

`postgres://user:password@ep-xxxxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`

## 2) Push DB schema to Neon

Run in project root:

`$env:DATABASE_URL="YOUR_NEON_URL"; npx pnpm --filter @workspace/db run push`

## 3) Start API server (for local testing)

`$env:PORT="3000"; $env:DATABASE_URL="YOUR_NEON_URL"; npx pnpm --filter @workspace/api-server run build; node --enable-source-maps artifacts/api-server/dist/index.mjs`

## 4) Build Android APK (EAS cloud build)

Run in project root:

`npx pnpm --filter @workspace/videh exec eas login`

`npx pnpm --filter @workspace/videh exec eas build -p android --profile preview`

After build completes, download APK from the generated EAS URL and install on your Android phone.

## 5) Build Android APK (local Gradle, optional)

If Android SDK + Java are installed:

`npx pnpm --filter @workspace/videh exec expo prebuild --platform android`

`cd artifacts/videh/android; .\gradlew.bat assembleRelease`

APK path:

`artifacts/videh/android/app/build/outputs/apk/release/app-release.apk`
