# Videh — Call system (complete file index)

**Kaise kholein:** Left sidebar se ye file kholo → link par **Ctrl+Click** (Mac: Cmd+Click).

Pehle wali list sirf **main** files thi. Neeche **poora** call ecosystem hai (~65 files).

---

## A. Core — zaroor padho (15 files)

| File | Role |
|------|------|
| [webrtc.ts](artifacts/api-server/src/routes/webrtc.ts) | Server: invite, accept, offer/answer, ICE |
| [CallSessionContext.tsx](artifacts/videh/context/CallSessionContext.tsx) | App call brain |
| [useVidehCall.native.ts](artifacts/videh/hooks/useVidehCall.native.ts) | Android WebRTC engine |
| [_layout.tsx](artifacts/videh/app/_layout.tsx) | Incoming poll, SSE, push, CallKeep |
| [call/[id].tsx](artifacts/videh/app/call/[id].tsx) | In-call UI |
| [calls.ts](artifacts/api-server/src/routes/calls.ts) | Call history API |
| [callMessages.ts](artifacts/api-server/src/lib/callMessages.ts) | SSE `publishCallSignal` |
| [sharedState.ts](artifacts/api-server/src/lib/sharedState.ts) | Session/call memory |
| [realtime.ts](artifacts/api-server/src/lib/realtime.ts) | SSE bus |
| [callEvents.ts](artifacts/videh/lib/callEvents.ts) | Parse SSE call events |
| [callRole.ts](artifacts/videh/lib/callRole.ts) | Caller vs callee |
| [signalingClient.ts](artifacts/videh/lib/videhCall/signalingClient.ts) | HTTP signaling |
| [webrtcIce.ts (server)](artifacts/api-server/src/lib/webrtcIce.ts) | TURN/STUN API |
| [webrtcIce.ts (client)](artifacts/videh/lib/webrtcIce.ts) | Load ICE servers |
| [ecosystem.config.cjs](artifacts/api-server/ecosystem.config.cjs) | PM2 (1 worker!) |

---

## B. Incoming call pipeline

- [hydrateIncomingCall.ts](artifacts/videh/lib/hydrateIncomingCall.ts)
- [fetchIncomingCallDetails.ts](artifacts/videh/lib/fetchIncomingCallDetails.ts)
- [rejectIncomingCall.ts](artifacts/videh/lib/rejectIncomingCall.ts)
- [incomingCallPush.ts](artifacts/videh/lib/incomingCallPush.ts)
- [incomingCallNotification.ts](artifacts/videh/lib/incomingCallNotification.ts)
- [incomingCallNotification.web.ts](artifacts/videh/lib/incomingCallNotification.web.ts)
- [incomingCallExperience.ts](artifacts/videh/lib/incomingCallExperience.ts)
- [incomingCallExperience.web.ts](artifacts/videh/lib/incomingCallExperience.web.ts)
- [incomingCallBackgroundTask.ts](artifacts/videh/lib/incomingCallBackgroundTask.ts)
- [incomingCallUiBridge.ts](artifacts/videh/lib/incomingCallUiBridge.ts)
- [incomingCallBattery.ts](artifacts/videh/lib/incomingCallBattery.ts)
- [IncomingCallOverlay.tsx](artifacts/videh/components/IncomingCallOverlay.tsx)
- [connectChatEventStream.ts](artifacts/videh/lib/connectChatEventStream.ts) — SSE stream

---

## C. CallKeep / native Android

- [callKeep.native.ts](artifacts/videh/lib/callKeep.native.ts)
- [callKeep.web.ts](artifacts/videh/lib/callKeep.web.ts)
- [callKeep.ts](artifacts/videh/lib/callKeep.ts)
- [callKeepBridge.ts](artifacts/videh/lib/callKeepBridge.ts)
- [callKeepUuid.ts](artifacts/videh/lib/callKeepUuid.ts)
- [videhNativeCallUi.native.ts](artifacts/videh/lib/videhNativeCallUi.native.ts)
- [videhNativeCallUi.web.ts](artifacts/videh/lib/videhNativeCallUi.web.ts)
- [videhNativeCallUi.ts](artifacts/videh/lib/videhNativeCallUi.ts)
- [withIncomingCallAndroid.js](artifacts/videh/plugins/withIncomingCallAndroid.js)
- [withVidehCallPip.js](artifacts/videh/plugins/withVidehCallPip.js)
- [index.js](artifacts/videh/index.js) — headless / background entry

---

## D. UI screens & components

- [call/_layout.tsx](artifacts/videh/app/call/_layout.tsx)
- [(tabs)/calls.tsx](artifacts/videh/app/(tabs)/calls.tsx)
- [join-call.tsx](artifacts/videh/app/join-call.tsx)
- [CallOutcomeScreen.tsx](artifacts/videh/components/CallOutcomeScreen.tsx)
- [CallWaitingOverlay.tsx](artifacts/videh/components/CallWaitingOverlay.tsx)
- [OngoingCallBanner.tsx](artifacts/videh/components/OngoingCallBanner.tsx)
- [HeldCallBanner.tsx](artifacts/videh/components/HeldCallBanner.tsx)
- [GroupCallGrid.tsx](artifacts/videh/components/GroupCallGrid.tsx)
- [AddCallParticipantModal.tsx](artifacts/videh/components/AddCallParticipantModal.tsx)
- [VidehVideoView.native.tsx](artifacts/videh/components/VidehVideoView.native.tsx)
- [VidehVideoView.tsx](artifacts/videh/components/VidehVideoView.tsx)

---

## E. Audio, media, state helpers

- [inCallAudio.native.ts](artifacts/videh/lib/inCallAudio.native.ts)
- [inCallAudio.web.ts](artifacts/videh/lib/inCallAudio.web.ts)
- [inCallAudio.ts](artifacts/videh/lib/inCallAudio.ts)
- [callRingtone.ts](artifacts/videh/lib/callRingtone.ts)
- [callRingtone.web.ts](artifacts/videh/lib/callRingtone.web.ts)
- [callMediaSettings.ts](artifacts/videh/lib/callMediaSettings.ts)
- [callAudioPrefs.ts](artifacts/videh/lib/callAudioPrefs.ts)
- [callConstants.ts](artifacts/videh/lib/callConstants.ts)
- [callState.ts](artifacts/videh/lib/callState.ts)
- [callDebug.ts](artifacts/videh/lib/callDebug.ts)
- [callNavigationGuard.ts](artifacts/videh/lib/callNavigationGuard.ts)
- [callParticipants.ts](artifacts/videh/lib/callParticipants.ts)
- [callMessage.ts](artifacts/videh/lib/callMessage.ts)
- [callDeclineQuickMessages.ts](artifacts/videh/lib/callDeclineQuickMessages.ts)
- [callLinks.ts](artifacts/videh/lib/callLinks.ts)
- [callPip.native.ts](artifacts/videh/lib/callPip.native.ts)
- [callPip.web.ts](artifacts/videh/lib/callPip.web.ts)
- [callPip.ts](artifacts/videh/lib/callPip.ts)
- [webrtcApi.ts](artifacts/videh/lib/webrtcApi.ts)
- [useVidehCall.web.ts](artifacts/videh/hooks/useVidehCall.web.ts)
- [useVidehCall.ts](artifacts/videh/hooks/useVidehCall.ts)
- [videhCallTypes.ts](artifacts/videh/hooks/videhCallTypes.ts)

---

## F. Call entry points (chat se call start)

- [chat/[id].tsx](artifacts/videh/app/chat/[id].tsx) — voice/video buttons
- [chat-info/[id].tsx](artifacts/videh/app/chat-info/[id].tsx)
- [contacts.tsx](artifacts/videh/app/contacts.tsx)

---

## G. Push notifications (server)

- [fcmPush.ts](artifacts/api-server/src/lib/fcmPush.ts)
- [expoPush.ts](artifacts/api-server/src/lib/expoPush.ts)
- [pushNotify.ts](artifacts/api-server/src/lib/pushNotify.ts)
- [pushNotifications.ts](artifacts/videh/lib/pushNotifications.ts)

---

## H. Web / desktop call UI

- [WebCallsListPane.tsx (videh-web)](artifacts/videh-web/src/components/web/WebCallsListPane.tsx)
- [WebCallMessageBubble.tsx](artifacts/videh-web/src/components/web/WebCallMessageBubble.tsx)
- [callMessage.ts (videh-web)](artifacts/videh-web/src/lib/callMessage.ts)
- [WebCallsListPane.tsx (videh)](artifacts/videh/components/web/WebCallsListPane.tsx)
- [webCallActions.ts](artifacts/videh/lib/web/webCallActions.ts)

---

## I. Server routes & wiring

- [callLinks.ts (routes)](artifacts/api-server/src/routes/callLinks.ts)
- [routes/index.ts](artifacts/api-server/src/routes/index.ts) — `/webrtc` mount
- [app.ts](artifacts/api-server/src/app.ts)
- [agora.ts](artifacts/api-server/src/routes/agora.ts) — **legacy** (purana Agora, ab WebRTC use hota hai)

---

## J. Database

- [schema/index.ts — `calls` table](lib/db/src/schema/index.ts)
- [031_calls_chat_id.sql](artifacts/api-server/sql/031_calls_chat_id.sql)
- [036_call_links.sql](artifacts/api-server/sql/036_call_links.sql)

---

## K. Settings / privacy / i18n (call-related strings)

- [privacy.tsx](artifacts/videh/app/settings/privacy.tsx)
- [privacySettings.ts](artifacts/videh/lib/privacySettings.ts)
- [userPrivacySettings.ts](artifacts/api-server/src/lib/userPrivacySettings.ts)
- [notifications.tsx](artifacts/videh/app/settings/notifications.tsx)
- [app.config.js](artifacts/videh/app.config.js) — Android permissions (mic, phone)
- i18n: [en.ts](artifacts/videh/lib/i18n/en.ts), [hi.ts](artifacts/videh/lib/i18n/locales/hi.ts), etc.

---

## Summary

| Category | ~Count |
|----------|--------|
| Core (must read) | 15 |
| Full call system | **~65 files** |
| + chat buttons, push, web, SQL, i18n | included above |

Pehle jo list di thi wo **shortlist** thi — poora system zyada bada hai.
