# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Videh App

A full WhatsApp-clone mobile app named "Videh" built with Expo.

### Features
- **Splash screen** with Videh logo and animation
- **Phone + OTP login** — 6-digit OTP via Fast2SMS API (DLT registered)
- **Profile setup** after first login
- **Chats screen** — conversations list with search, filter tabs (All/Unread/Groups), pin, mute, archive
- **Chat screen** — real-time messaging UI, send/receive bubbles, typing indicator, image/video bubbles, voice messages (record/play), message reactions (❤️👍😂), ticks (single/double/green), delete for me/everyone, edit message, forward with "Forwarded"/"Forwarded many times", in-chat search, link highlight, view-once media, reply strip, attach menu
- **Status screen** — WhatsApp-style status updates, view/post statuses
- **Calls screen** — call logs with All/Missed tabs, call back
- **Call screen** — full-screen voice/video call UI with mute/speaker/camera controls
- **Settings screen** — profile card, account/privacy/notification settings, logout
- **Contacts screen** — contact list with new chat/new group
- **New Group screen** — select members + set group name

### Auth Flow
Phone number → OTP verification (Fast2SMS) → Profile setup → Main app

### API Keys (stored as secrets/env vars)
- `FAST2SMS_API_KEY` — secret
- `FAST2SMS_SENDER_ID` = VIDEHE
- `DLT_TEMPLATE_ID` = 1007181628875366114
- `FAST2SMS_MESSAGE_ID` = 209634

### Agora Voice & Video Calls
- **App ID**: `45625ba414d24e7b94712f3cdf4241fc` stored as `EXPO_PUBLIC_AGORA_APP_ID` + `AGORA_APP_ID`
- **Web** (`agora-rtc-sdk-ng`): Real audio/video calls work in browser right now — joins Agora RTC channel, publishes mic/camera tracks, renders remote video via `nativeID` DOM refs
- **Native** (`react-native-agora`): Full implementation ready — requests mic/camera permissions, joins channel, uses `RtcSurfaceView` for video rendering. Requires a development build (not Expo Go)
  - Build command: `eas build --profile development`
  - Expo Go shows a clear "Development Build Required" screen with the build command
- **Token server**: `GET /api/agora/token?channel=X&uid=Y` — returns null token when no App Certificate set (dev mode), generates real tokens with `agora-token` once `AGORA_APP_CERTIFICATE` secret is added
- **Permissions** added to `app.json`: `RECORD_AUDIO`, `CAMERA`, `BLUETOOTH_CONNECT`, `MODIFY_AUDIO_SETTINGS` (Android) + `NSMicrophoneUsageDescription`, `NSCameraUsageDescription` (iOS) + `UIBackgroundModes: [audio, voip]`
- **Platform isolation**: `hooks/useAgoraCall.web.ts` / `hooks/useAgoraCall.native.ts` + `components/AgoraVideoView.web.tsx` / `AgoraVideoView.native.tsx` — Metro picks the right file per platform, web bundle never sees native modules
- **Channel naming**: `videh_{chatId}` for each call
- **Call screen features**: Live duration timer, mute/speaker/camera toggle, end call, remote video fullscreen, local video PiP (picture-in-picture), encryption badge

### Legal Pages
- `/app/legal/terms.tsx` — Full Terms of Service (11 sections, professionally written)
- `/app/legal/privacy.tsx` — Full Privacy Policy (12 sections, covers E2E encryption, data rights)
- Links in phone screen are now clickable and navigate to these pages

### Settings Sub-screens
- `/app/settings/account.tsx` — Change number, two-step verification, linked devices, delete account
- `/app/settings/privacy.tsx` — Last seen, profile photo, about, read receipts, disappearing messages, blocked contacts
- `/app/settings/notifications.tsx` — Per-type notification toggles, tones, vibration, popup preview
- `/app/settings/chats.tsx` — Theme, wallpaper, font size, enter-to-send, backup, export, clear history
- `/app/settings/help.tsx` — Help centre, contact, rate, invite, Terms and Privacy links

### Additional Screens
- `/app/chat-info/[id].tsx` — Contact/Group info with quick call buttons, media section, disappearing messages, block/report
- Tapping contact name in chat header navigates to chat info
- Chat "more" menu includes: Chat info, Starred messages, Mute, Media, Search in chat, Export

### Advanced Chat Features
- **Online status** — tracks AppState foreground/background; real-time "online" indicator in chat header via GET /api/users/:id/online; PUT /api/users/:id/online updates DB
- **Group management** — real members list with admin badges, add/remove members, promote to admin, leave/delete group; all from chat-info screen
- **Disappearing messages** — 24h/7d/90d options; chat-info → Disappearing messages → sets timer; messages with non-null `disappear_at` auto-deleted on API side
- **Block/Unblock** — real block stored in `user_blocks` table; blocked indicator in chat screen; block/unblock from chat-info
- **Profile photo fullscreen** — tapping avatar in chat-info opens fullscreen viewer
- **Message info** — long-press → "Message info" → shows Read/Delivered/Sent receipts per recipient in `/chat/message-info`
- **Status reply** — reply button in status viewer sends reply as a private chat message
- **@mentions** — "@" in group chat opens autocomplete dropdown with member names; selected name inserted as "@name "; mentions highlighted in green (#00A884) in bubbles
- **Chat wallpaper** — per-user per-chat wallpaper stored in `chat_members.wallpaper`; set via chat menu "Wallpaper" → image picker; rendered as full-bleed background in chat screen
- **Push notifications** — `expo-notifications@~0.32.16`; `users.push_token` column; token registered on login; `PUT /api/users/:id/push-token`; message send endpoint calls Expo push API with sender name + preview; foreground alerts enabled; tapping notification navigates to correct chat
- **Notification tap routing** — `addNotificationResponseReceivedListener` in _layout.tsx routes to the relevant chat on notification tap

### Removed
- All sample/demo data (Priya Sharma, Rahul Verma, etc.) — starts clean and real
- Auto-reply simulation in chat screen

### Database Integration
- OTP `/verify` endpoint now **upserts user in PostgreSQL** and returns `dbId`, `name`, `about`, `avatarUrl`
- Returning users (name already set) skip the profile screen and go straight to main app
- Profile name/about saved to DB via `PUT /api/users/:id` on every profile save
- Avatar uploaded as base64 and stored as data URL in `users.avatar_url` column
- `AppContext` syncs messages, statuses, chats to the DB via API; falls back to local state if API is unreachable

### Image Upload Flow
- Both profile setup screen and settings screen use `base64: true` in `ImagePicker` options
- `updateAvatar(base64, mimeType)` in AppContext calls `POST /api/users/:id/avatar`
- DB stores the full `data:image/jpeg;base64,...` data URL in `users.avatar_url`

### OTP Demo
Use "123456" as the OTP to bypass verification in demo mode.

## Videh Web (WhatsApp Web equivalent)

A browser-based companion app at `/videh-web/` that mirrors the mobile Videh experience.

### Architecture
- **Artifact**: `artifacts/videh-web` — React + Vite web app
- **API Routes**: `artifacts/api-server/src/routes/web-session.ts` registered at `/api/web-session`
- **DB table**: `web_sessions` — stores token (64-char hex), status (pending/linked/expired), user_id, created_at, expires_at

### QR Linking Flow
1. Web app loads → POSTs `/api/web-session` → gets a 64-char random token
2. Token encoded as `videh://scan?token=TOKEN&host=ORIGIN` into QR code (with Videh logo overlay)
3. Web app polls `/api/web-session/:token/status` every 2 seconds
4. Mobile user opens Chats → ⋮ menu → "Linked devices" → scans QR
5. Mobile calls `POST /api/web-session/:token/link` with userId
6. Web detects `status: "linked"` → loads full chat interface
7. Sessions expire after 5 minutes if not linked

### Web UI
- Landing page: WhatsApp Web-style layout with numbered steps + live QR panel
- Chat interface: sidebar with chat list + search + avatars + unread badges
- Message view: WhatsApp bubble design, auto-scrolls, auto-refreshes every 5s
- Send messages via Enter key or send button
- Videh green theme (#00a884) throughout

### Mobile QR Scanner
- Screen: `artifacts/videh/app/linked-devices.tsx`
- Uses `expo-camera` with barcode scanning (QR type)
- "Linked devices" menu item in Chats screen navigates to this screen
- Parses `videh://scan?token=...` QR data, posts to API, shows success animation
