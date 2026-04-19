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

### OTP Demo
Use "123456" as the OTP to bypass verification in demo mode.
