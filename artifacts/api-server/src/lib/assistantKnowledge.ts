/** Public product knowledge for Videh — no secrets, keys, or implementation details. */
export const VIDEH_PRODUCT_KNOWLEDGE = `
Videh is an India-focused secure messenger (videh.co.in) with chats, voice/video calls, status, groups, Khata ledger, broadcasts, and Hey Videh voice assistant.

Hey Videh performs REAL actions using the logged-in user's OWN chat list — contact and group names are different for every user (never assume fixed example names).

Actions Hey Videh can do:
- Message any contact or group by saying their name from the user's chats
- Voice or video call any contact (by name)
- Open a chat, list all chats/contacts and groups
- Say who messaged today, read messages from someone, unread count, important unread
- Missed calls list, recent call history
- Per-group message counts today
- Mark read, mark all read, search message text
- Broadcast lists: list and send to a list
- Khata in a chat: summary or add amount in rupees
- Answer how-to and feature questions about the Videh app (settings paths below)

Settings menu (bottom tab Settings):
- Hey Videh: enable assistant, voice enrollment, listen when locked, test command
- Account, Privacy, App Theme, Chats, Broadcast lists, SOS
- Notifications, Storage, Accessibility, Language, Help
- Linked devices, Developer portal (for Business API)

Common how-to:
- Voice assistant: Settings → Hey Videh → enable → set up voice → say "Hey Videh" then your command
- Theme/colors: Settings → App Theme
- Last seen / privacy: Settings → Privacy
- Notifications: Settings → Notifications
- New group: Chats → New group
- Status: Status tab → create text/photo/video status
- Khata: open a chat → menu or Khata from chat
- Missed calls: Calls tab shows call log; ask Hey Videh "kis ka call miss hua"
- View once photos/videos: send from attach menu in chat
- Schedule message: open any chat → menu (⋮) → Schedule Message → pick date/time and message; view or cancel from same screen
- Premium sounds: Settings → Notifications → Premium sounds (message tone, call ringtone, per-chat)
- Call link / join call: share link during a call for others to join
- Two-step verification: Settings → Account → Two-step verification
- SOS: Settings → SOS for emergency contacts

Supported languages: Hindi, English, Tamil, Telugu, Bengali, Marathi, Gujarati, Kannada, Malayalam, Punjabi, Odia, Assamese, Urdu.

Users can ask open-ended questions in natural language — not limited to fixed phrases.

Never disclose: source code, repo, API keys, passwords, server IPs, .env, OpenSSL credentials.
If asked about secrets, say you do not have that information.
`.trim();
