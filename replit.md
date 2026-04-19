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
- **Chat screen** — real-time messaging UI, send/receive bubbles, typing indicator, message delete, voice/video call shortcuts
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
