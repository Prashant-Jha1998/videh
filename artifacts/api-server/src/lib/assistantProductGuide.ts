/**
 * A–Z Videh product knowledge for Hey Videh assistant.
 * Used for instant regex/keyword answers (no OpenAI) and as context for AI QA.
 */

export type ProductKnowledgeEntry = {
  id: string;
  category: string;
  keywords: string[];
  title: string;
  path: string;
  answerEn: string;
  answerHi: string;
};

export const PRODUCT_KNOWLEDGE_ENTRIES: ProductKnowledgeEntry[] = [
  // ——— OVERVIEW ———
  {
    id: "overview",
    category: "Overview",
    keywords: ["videh", "what is videh", "app kya hai", "messenger", "about videh", "features"],
    title: "What is Videh",
    path: "videh.co.in",
    answerEn: "Videh is an India-focused secure messenger with chats, voice/video calls, Status stories, Videh Video, Khata ledger, broadcasts, business messages, and Hey Videh voice assistant.",
    answerHi: "Videh ek secure Indian messenger hai — chat, voice/video call, Status, Videh Video, Khata, broadcast, business messages aur Hey Videh voice assistant ke saath.",
  },
  {
    id: "tabs",
    category: "Navigation",
    keywords: ["tabs", "bottom bar", "menu", "kahan hai", "navigation", "home screen"],
    title: "Main tabs",
    path: "Bottom tabs: Chats | Status | Video | Calls | Settings",
    answerEn: "Bottom tabs: Chats (messages), Status (stories), Video (Videh Video), Calls (call log), Settings (account & preferences).",
    answerHi: "Neeche 5 tabs: Chats (messages), Status (stories), Video (Videh Video), Calls (call history), Settings (account aur settings).",
  },

  // ——— HEY VIDEH ———
  {
    id: "hey-videh-enable",
    category: "Hey Videh",
    keywords: ["hey friend", "hey videh", "voice assistant", "assistant on", "assistant enable", "mic", "wake word"],
    title: "Enable Hey Videh",
    path: "Settings → Hey Videh",
    answerEn: "Open Settings → Hey Videh, turn it on, complete voice enrollment (3 samples), then say Hey Friend to wake Videh. On Android it keeps listening even when the app is closed (persistent notification). Disable battery optimization for best results.",
    answerHi: "Settings → Hey Videh on kijiye, voice setup kijiye, phir Hey Friend boliye. Android par app band hone ke baad bhi sunta hai (notification). Battery optimization band karein.",
  },
  {
    id: "hey-videh-commands",
    category: "Hey Videh",
    keywords: ["commands", "kya kar sakte", "what can you do", "examples", "bol kar"],
    title: "Hey Videh commands",
    path: "Say Hey Friend, then…",
    answerEn: "Examples: who messaged today, unread count, call Rahul, open Priya chat, send message to Monty, khata summary, missed calls, search messages, list broadcasts.",
    answerHi: "Examples: aaj kis ka message aaya, kitne unread, Rahul ko call karo, Priya ki chat kholo, Monty ko message bhejo, khata batao, missed calls, message search, broadcast list.",
  },

  // ——— CHATS ———
  {
    id: "new-chat",
    category: "Chats",
    keywords: ["new chat", "naya chat", "message someone", "start chat", "contact"],
    title: "Start a new chat",
    path: "Chats tab → New chat icon / Contacts",
    answerEn: "Chats tab → tap the new message icon or open Contacts, pick a contact, and start typing.",
    answerHi: "Chats tab → naya message icon ya Contacts se contact chuniye aur message likhiye.",
  },
  {
    id: "new-group",
    category: "Groups",
    keywords: ["new group", "group banao", "create group", "naya group"],
    title: "Create a group",
    path: "Chats → New group",
    answerEn: "Chats tab → New group, add members, set group name and photo, then create.",
    answerHi: "Chats tab → New group, members add kijiye, naam aur photo set kijiye, create karein.",
  },
  {
    id: "group-admin",
    category: "Groups",
    keywords: ["group admin", "admin", "promote", "group settings", "who can send"],
    title: "Group admin & permissions",
    path: "Group chat → Chat info → Group settings",
    answerEn: "Open group → Chat info (top) → manage members, admins, and who can send messages.",
    answerHi: "Group chat → upar Chat info → members, admins aur kaun message bhej sakta hai manage karein.",
  },
  {
    id: "send-photo",
    category: "Messaging",
    keywords: ["photo", "image", "picture", "bhej", "send image", "gallery", "camera"],
    title: "Send photos & videos",
    path: "Chat → Attach (📎) → Gallery or Camera",
    answerEn: "In any chat tap attach (paperclip), choose Gallery or Camera, pick media, add caption, send.",
    answerHi: "Chat mein attach (📎) dabaiye, Gallery ya Camera chuniye, media select karke caption ke saath bhejiye.",
  },
  {
    id: "voice-note",
    category: "Messaging",
    keywords: ["voice note", "voice message", "audio message", "mic hold", "record voice"],
    title: "Voice messages",
    path: "Chat → hold microphone button",
    answerEn: "Hold the microphone button in chat to record a voice message; release to send or slide to cancel.",
    answerHi: "Chat mein mic button hold karke voice message record kijiye; chhod kar bhejiye ya cancel ke liye slide karein.",
  },
  {
    id: "document",
    category: "Messaging",
    keywords: ["document", "file", "pdf", "attach file", "document bhej"],
    title: "Send documents",
    path: "Chat → Attach → Document",
    answerEn: "Chat → attach → Document to send PDFs, files, and other documents.",
    answerHi: "Chat → attach → Document se PDF aur files bhej sakte hain.",
  },
  {
    id: "location",
    category: "Messaging",
    keywords: ["location", "live location", "map", "share location", "jagah"],
    title: "Share location",
    path: "Chat → Attach → Location",
    answerEn: "Chat → attach → Location to share current location or live location for a set time.",
    answerHi: "Chat → attach → Location se apni location ya live location share karein.",
  },
  {
    id: "contact-card",
    category: "Messaging",
    keywords: ["contact card", "share contact", "number bhej", "contact share"],
    title: "Share a contact",
    path: "Chat → Attach → Contact",
    answerEn: "Chat → attach → Contact to share someone's phone number as a contact card.",
    answerHi: "Chat → attach → Contact se kisi ka number contact card ki tarah bhejiye.",
  },
  {
    id: "view-once",
    category: "Messaging",
    keywords: ["view once", "ek baar", "disappearing photo", "one time"],
    title: "View once media",
    path: "Chat → Attach → Camera/Gallery → View once toggle",
    answerEn: "When sending a photo or video, enable View once so the recipient can open it only one time.",
    answerHi: "Photo ya video bhejte waqt View once on karein — receiver sirf ek baar dekh sakta hai.",
  },
  {
    id: "disappearing-messages",
    category: "Messaging",
    keywords: ["disappearing", "disappear", "auto delete", "timer", "vanish", "gayab"],
    title: "Disappearing messages",
    path: "Chat → Chat info → Disappearing messages",
    answerEn: "Open chat → Chat info → Disappearing messages and pick 24 hours, 7 days, or 90 days. New messages auto-delete after that.",
    answerHi: "Chat → Chat info → Disappearing messages se 24 ghante, 7 din ya 90 din timer set karein.",
  },
  {
    id: "translate-message",
    category: "Messaging",
    keywords: ["translate", "translation", "anuvad", "language change message"],
    title: "Translate a message",
    path: "Chat → long-press message → Translate",
    answerEn: "Long-press any message in chat and tap Translate to see it in your preferred language.",
    answerHi: "Message par long-press karke Translate chuniye — aapki language mein dikhega.",
  },
  {
    id: "reply-forward",
    category: "Messaging",
    keywords: ["reply", "forward", "jawab", "aage bhej", "swipe reply"],
    title: "Reply & forward",
    path: "Chat → swipe message or long-press menu",
    answerEn: "Swipe a message to reply. Long-press for Forward, Copy, Star, Delete, and more.",
    answerHi: "Message swipe karke reply karein. Long-press se Forward, Copy, Star, Delete aur zyada options.",
  },
  {
    id: "edit-delete",
    category: "Messaging",
    keywords: ["edit message", "delete message", "delete for everyone", "edit", "delete"],
    title: "Edit & delete messages",
    path: "Chat → long-press your message",
    answerEn: "Long-press your own message within 15 minutes to Edit. Delete for me or Delete for everyone from the menu.",
    answerHi: "Apna message 15 minute ke andar long-press karke Edit kar sakte hain. Delete for me ya everyone bhi hai.",
  },
  {
    id: "reactions",
    category: "Messaging",
    keywords: ["reaction", "emoji react", "like message", "heart"],
    title: "Message reactions",
    path: "Chat → long-press message → emoji",
    answerEn: "Long-press a message and pick an emoji reaction. Tap existing reactions to change yours.",
    answerHi: "Message long-press karke emoji reaction lagaiye.",
  },
  {
    id: "starred",
    category: "Messaging",
    keywords: ["starred", "star message", "saved messages", "important message"],
    title: "Starred messages",
    path: "Chat menu → Starred messages OR long-press → Star",
    answerEn: "Long-press a message → Star. View all starred messages from chat menu (⋮) → Starred messages.",
    answerHi: "Message long-press → Star. Saari starred messages chat menu → Starred messages se dekhein.",
  },
  {
    id: "schedule-message",
    category: "Messaging",
    keywords: ["schedule", "scheduled message", "baad mein bhej", "time par bhej"],
    title: "Schedule a message",
    path: "Chat → menu (⋮) → Schedule message",
    answerEn: "Say: schedule message to Rahul tomorrow 5 PM saying hello. Or Chat → menu → Schedule message.",
    answerHi: "Bolein: Rahul ko kal 5 baje message schedule karo. Ya chat → menu → Schedule message.",
  },
  {
    id: "chat-wallpaper",
    category: "Chats",
    keywords: ["wallpaper", "background", "chat theme", "chat background"],
    title: "Chat wallpaper",
    path: "Chat info → Wallpaper OR Settings → Chats → Wallpaper",
    answerEn: "Per-chat: Chat info → Wallpaper. Global default: Settings → Chats → Chat wallpaper.",
    answerHi: "Har chat ke liye: Chat info → Wallpaper. Default: Settings → Chats → Chat wallpaper.",
  },
  {
    id: "mute-archive-pin",
    category: "Chats",
    keywords: ["mute", "archive", "pin chat", "unread hide", "pin"],
    title: "Mute, archive, pin chats",
    path: "Long-press chat in list OR Chat info",
    answerEn: "Long-press a chat in the list to Mute, Archive, or Pin. Unarchive from Archived section at top of Chats.",
    answerHi: "Chat list mein long-press se Mute, Archive ya Pin karein. Archived chats list ke upar se milenge.",
  },
  {
    id: "block-report",
    category: "Chats",
    keywords: ["block", "report", "spam", "block contact"],
    title: "Block & report",
    path: "Chat info → Block OR Chat menu → Report",
    answerEn: "Chat info → Block contact. Report from chat menu (⋮) → Report. Blocked contacts cannot message or call you.",
    answerHi: "Chat info se Block karein. Menu se Report karein. Blocked contact message/call nahi kar sakta.",
  },
  {
    id: "business-chat",
    category: "Business",
    keywords: ["business", "business message", "template", "verified business", "stop offers", "marketing"],
    title: "Business chats",
    path: "Business chat intro card",
    answerEn: "Verified businesses message you via Videh Business API. Use Stop on the intro card to opt out of offers; Resume to opt back in. Tap Profile for business info.",
    answerHi: "Verified business aapko template messages bhejte hain. Intro card par Stop se offers band; Resume se wapas on. Profile se business info.",
  },
  {
    id: "unsaved-contact",
    category: "Chats",
    keywords: ["unsaved", "save contact", "add contact", "phone book"],
    title: "Unsaved contacts",
    path: "Chat intro card → Add to contacts",
    answerEn: "When someone not in your phone book messages you, an intro card offers Add to contacts, Block, or Report.",
    answerHi: "Jo contact phone book mein nahi hai, unki chat mein Add to contacts, Block ya Report option aata hai.",
  },

  // ——— CALLS ———
  {
    id: "voice-video-call",
    category: "Calls",
    keywords: ["call", "video call", "voice call", "phone call", "call karo"],
    title: "Voice & video calls",
    path: "Chat header → phone or video icon",
    answerEn: "Open a chat and tap the phone icon for voice call or video icon for video call. Or ask Hey Videh: call Rahul.",
    answerHi: "Chat khol kar phone icon se voice, video icon se video call. Ya Hey Videh: Rahul ko call karo.",
  },
  {
    id: "call-log",
    category: "Calls",
    keywords: ["call history", "call log", "recent calls", "missed call"],
    title: "Call history",
    path: "Calls tab",
    answerEn: "Calls tab shows all recent, incoming, outgoing, and missed calls. Ask Hey Videh: missed calls today.",
    answerHi: "Calls tab par saari call history. Hey Videh se poochhiye: aaj kitne missed calls.",
  },
  {
    id: "join-call-link",
    category: "Calls",
    keywords: ["call link", "join call", "share call", "link se join"],
    title: "Join call via link",
    path: "During call → share link OR join-call screen",
    answerEn: "During a call you can share a join link so others open Videh and join. Incoming links open the Join call screen.",
    answerHi: "Call ke dauran join link share karein — log link se join kar sakte hain.",
  },
  {
    id: "group-call-limit",
    category: "Calls",
    keywords: ["group call", "group video"],
    title: "Group calls",
    path: "Group chat → call icons",
    answerEn: "Group voice/video calls are available from group chats. Hey Videh currently supports 1:1 calls by contact name only.",
    answerHi: "Group chat se group call ho sakti hai. Hey Videh abhi sirf ek contact ko naam se call karta hai.",
  },

  // ——— STATUS ———
  {
    id: "status-post",
    category: "Status",
    keywords: ["status", "story", "status lagao", "post status"],
    title: "Post Status",
    path: "Status tab → + Add status",
    answerEn: "Status tab → tap to add text, photo, or video status. Visible to contacts for 24 hours.",
    answerHi: "Status tab → + se text, photo ya video status lagaiye. 24 ghante ke liye contacts ko dikhega.",
  },
  {
    id: "status-privacy",
    category: "Status",
    keywords: ["status privacy", "who sees status", "status kaun dekhe"],
    title: "Status privacy",
    path: "Settings → Privacy → Status",
    answerEn: "Settings → Privacy → Status to control who can see your status updates.",
    answerHi: "Settings → Privacy → Status se control karein kaun aapka status dekhe.",
  },
  {
    id: "status-viewers",
    category: "Status",
    keywords: ["who viewed", "status viewers", "kaun dekha"],
    title: "Status viewers",
    path: "Your status → eye icon / viewers list",
    answerEn: "Open your own status and tap the viewers list to see who watched it.",
    answerHi: "Apna status khol kar viewers list se dekhein kisne dekha.",
  },

  // ——— VIDEH VIDEO ———
  {
    id: "videh-video-watch",
    category: "Videh Video",
    keywords: ["video", "reels", "watch video", "videh video", "short video"],
    title: "Watch Videh Video",
    path: "Video tab",
    answerEn: "Video tab shows recommended short videos. Tap to watch, like, comment, and subscribe to channels.",
    answerHi: "Video tab par short videos dekhein — like, comment, subscribe kar sakte hain.",
  },
  {
    id: "videh-video-upload",
    category: "Videh Video",
    keywords: ["upload video", "post video", "video upload", "channel video"],
    title: "Upload a video",
    path: "Video tab → Upload (+)",
    answerEn: "Video tab → Upload (+), pick video, add title, description, tags, then publish. You need a channel first.",
    answerHi: "Video tab → Upload (+), video chuniye, title/tags add karke publish karein. Pehle channel banana hoga.",
  },
  {
    id: "videh-channel",
    category: "Videh Video",
    keywords: ["channel", "create channel", "your channel", "youtube channel"],
    title: "Create a video channel",
    path: "Video tab → profile → Create channel",
    answerEn: "Video tab → your profile icon → Create channel. Set handle, name, logo, and bio to start uploading.",
    answerHi: "Video tab → profile → Create channel. Handle, naam, logo set karke upload shuru karein.",
  },
  {
    id: "video-library",
    category: "Videh Video",
    keywords: ["library", "history", "watch history", "downloads", "playlist", "liked videos"],
    title: "Video Library",
    path: "Video tab → Library icon",
    answerEn: "Video tab → Library icon for History, Liked videos, Playlists, Downloads, and Your videos — like YouTube Library.",
    answerHi: "Video tab → Library icon se History, Liked, Playlists, Downloads aur Your videos dekhein.",
  },
  {
    id: "video-search",
    category: "Videh Video",
    keywords: ["search video", "video search", "hashtag"],
    title: "Search videos",
    path: "Video tab → Search",
    answerEn: "Video tab → Search to find videos, channels, and hashtags.",
    answerHi: "Video tab → Search se videos, channels aur hashtags dhundhein.",
  },

  // ——— BROADCAST ———
  {
    id: "broadcast",
    category: "Broadcast",
    keywords: ["broadcast", "broadcast list", "ek saath message", "bulk message"],
    title: "Broadcast lists",
    path: "Settings → Broadcast lists OR Chats → Broadcasts",
    answerEn: "Settings → Broadcast lists to create named lists. Send one message to many contacts privately. Hey Videh: list my broadcasts.",
    answerHi: "Settings → Broadcast lists se list banaiye. Ek message kai logon ko privately. Hey Videh: meri broadcast list sunao.",
  },

  // ——— KHATA ———
  {
    id: "khata",
    category: "Khata",
    keywords: ["khata", "udhar", "hisab", "ledger", "credit", "debit", "paisa"],
    title: "Khata (ledger)",
    path: "Chat → Khata OR Settings → Khata",
    answerEn: "Per-chat Khata tracks udhar/credit in rupees. Open chat menu → Khata. Hey Videh: Ramesh ka khata batao or add 500 udhar.",
    answerHi: "Har chat mein Khata se udhar/credit likhein. Chat menu → Khata. Hey Videh: Ramesh ka khata batao.",
  },

  // ——— SETTINGS ———
  {
    id: "account",
    category: "Settings",
    keywords: ["account", "profile", "name change", "about", "phone number"],
    title: "Account & profile",
    path: "Settings → tap profile OR Settings → Account",
    answerEn: "Settings → tap your profile photo/name to edit name, about, and photo. Account screen has phone, delete account, change number.",
    answerHi: "Settings → profile photo/name se naam, about, photo badlein. Account mein phone, delete account, change number.",
  },
  {
    id: "privacy",
    category: "Settings",
    keywords: ["privacy", "last seen", "online", "profile photo privacy", "read receipts"],
    title: "Privacy",
    path: "Settings → Privacy",
    answerEn: "Settings → Privacy: last seen, online, profile photo, about, read receipts, groups, and status visibility.",
    answerHi: "Settings → Privacy: last seen, online, profile photo, about, read receipts, groups, status.",
  },
  {
    id: "theme",
    category: "Settings",
    keywords: ["theme", "dark mode", "light mode", "colour", "color"],
    title: "App theme",
    path: "Settings → App Theme",
    answerEn: "Settings → App Theme for light, dark, or system theme and accent colors.",
    answerHi: "Settings → App Theme se light, dark ya system theme chuniye.",
  },
  {
    id: "advanced-theme",
    category: "Settings",
    keywords: ["advanced theme", "chat bubble color", "custom theme"],
    title: "Advanced theme",
    path: "Settings → Advanced theme",
    answerEn: "Settings → Advanced theme for chat bubble colors, gradients, and fine-tuned appearance.",
    answerHi: "Settings → Advanced theme se chat bubble colors aur gradients customize karein.",
  },
  {
    id: "chats-settings",
    category: "Settings",
    keywords: ["chat settings", "font size", "enter to send", "backup", "export chat"],
    title: "Chat settings",
    path: "Settings → Chats",
    answerEn: "Settings → Chats: font size, enter-to-send, media visibility, chat backup, export chats, clear all history.",
    answerHi: "Settings → Chats: font size, enter-to-send, backup, export, clear history.",
  },
  {
    id: "notifications",
    category: "Settings",
    keywords: ["notification", "alert", "sound", "vibrate", "banner"],
    title: "Notifications",
    path: "Settings → Notifications",
    answerEn: "Settings → Notifications to control message alerts, previews, and sounds.",
    answerHi: "Settings → Notifications se message alerts aur sounds control karein.",
  },
  {
    id: "premium-sounds",
    category: "Settings",
    keywords: ["premium sound", "ringtone", "notification tone", "per chat sound"],
    title: "Premium sounds",
    path: "Settings → Premium sounds",
    answerEn: "Settings → Premium sounds for custom message tones, call ringtones, and per-chat notification sounds.",
    answerHi: "Settings → Premium sounds se message tone, ringtone aur per-chat sound set karein.",
  },
  {
    id: "storage",
    category: "Settings",
    keywords: ["storage", "data usage", "clear cache", "space"],
    title: "Storage & data",
    path: "Settings → Storage and data",
    answerEn: "Settings → Storage and data to see usage and manage downloaded media cache.",
    answerHi: "Settings → Storage and data se usage dekhein aur cache manage karein.",
  },
  {
    id: "language",
    category: "Settings",
    keywords: ["language", "bhasha", "hindi", "english", "app language"],
    title: "App language",
    path: "Settings → App language",
    answerEn: "Settings → App language for Hindi, English, Tamil, Telugu, Bengali, Marathi, Gujarati, Kannada, Malayalam, Punjabi, Odia, Assamese, Urdu.",
    answerHi: "Settings → App language se Hindi, English aur 10+ Indian languages chuniye.",
  },
  {
    id: "accessibility",
    category: "Settings",
    keywords: ["accessibility", "font size", "large text", "contrast"],
    title: "Accessibility",
    path: "Settings → Accessibility",
    answerEn: "Settings → Accessibility for larger text and readability options.",
    answerHi: "Settings → Accessibility se bada text aur readability options.",
  },
  {
    id: "two-step",
    category: "Security",
    keywords: ["two step", "2 step", "pin", "two-step verification", "security pin"],
    title: "Two-step verification",
    path: "Settings → Account → Two-step verification",
    answerEn: "Settings → Account → Two-step verification to add a 6-digit PIN for extra account security.",
    answerHi: "Settings → Account → Two-step verification se 6-digit PIN lagaiye.",
  },
  {
    id: "sos",
    category: "Security",
    keywords: ["sos", "emergency", "help alert", "emergency contact"],
    title: "SOS emergency",
    path: "Settings → SOS",
    answerEn: "Settings → SOS to add trusted emergency contacts and trigger SOS alerts with location.",
    answerHi: "Settings → SOS se emergency contacts add karein aur SOS alert bhejiye.",
  },
  {
    id: "linked-devices",
    category: "Settings",
    keywords: ["linked devices", "web", "desktop", "qr code", "videh web", "multi device"],
    title: "Linked devices (Videh Web)",
    path: "Settings → QR code icon OR Linked devices",
    answerEn: "Settings → QR code (top) or Linked devices to scan and link Videh Web on desktop browser.",
    answerHi: "Settings → QR code ya Linked devices se desktop par Videh Web link karein.",
  },
  {
    id: "help-support",
    category: "Settings",
    keywords: ["help", "support", "contact support", "problem", "issue"],
    title: "Help & support",
    path: "Settings → Help",
    answerEn: "Settings → Help to contact Videh support or read FAQs.",
    answerHi: "Settings → Help se support contact karein ya FAQ padhein.",
  },
  {
    id: "logout",
    category: "Settings",
    keywords: ["logout", "log out", "sign out", "nikal"],
    title: "Log out",
    path: "Settings → scroll down → Log out",
    answerEn: "Settings → scroll to bottom → Log out. You will need OTP to sign in again.",
    answerHi: "Settings → neeche scroll → Log out. Dubara OTP se login karna hoga.",
  },

  // ——— BUSINESS / DEVELOPER ———
  {
    id: "developer-portal",
    category: "Business API",
    keywords: ["developer", "business api", "api", "template message", "developer portal", "business account"],
    title: "Videh Business API",
    path: "developer.videh.co.in",
    answerEn: "Businesses register at developer.videh.co.in for verified Business API, template messages with images and buttons, and billing per conversation.",
    answerHi: "Businesses developer.videh.co.in par register karke verified API, template messages (image + buttons) aur conversation billing use karte hain.",
  },

  // ——— MISC ———
  {
    id: "contacts",
    category: "Contacts",
    keywords: ["contacts", "sync contacts", "phone contacts", "address book"],
    title: "Contacts",
    path: "Settings → search icon OR Contacts screen",
    answerEn: "Sync phone contacts to find friends on Videh. Open Contacts from Settings search icon or new chat flow.",
    answerHi: "Phone contacts sync karke Videh par dost dhundhein. Settings search ya new chat se Contacts kholiye.",
  },
  {
    id: "search-messages",
    category: "Chats",
    keywords: ["search message", "find message", "message search", "dhundho"],
    title: "Search messages",
    path: "Chats → Search OR Hey Videh",
    answerEn: "Chats tab search finds chats and messages. In-chat search from menu. Hey Videh: search messages for order.",
    answerHi: "Chats tab search se chats/messages dhundhein. Hey Videh: message search order.",
  },
  {
    id: "encryption",
    category: "Security",
    keywords: ["encryption", "secure", "end to end", "safe", "privacy secure"],
    title: "Security & encryption",
    path: "All chats",
    answerEn: "Videh uses secure transport for messages and calls. Chats show an encryption notice for direct and group conversations.",
    answerHi: "Videh messages aur calls secure transport use karta hai. Chats mein encryption notice dikhta hai.",
  },
];

function tokenizeQuery(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

/** Score how well an entry matches a user question (higher = better). */
function scoreEntry(entry: ProductKnowledgeEntry, query: string, tokens: string[]): number {
  const n = query.toLowerCase();
  let score = 0;
  for (const kw of entry.keywords) {
    const k = kw.toLowerCase();
    if (n.includes(k)) score += k.length > 6 ? 12 : 8;
  }
  for (const t of tokens) {
    if (entry.title.toLowerCase().includes(t)) score += 3;
    if (entry.category.toLowerCase().includes(t)) score += 2;
    if (entry.path.toLowerCase().includes(t)) score += 2;
    for (const kw of entry.keywords) {
      if (kw.toLowerCase().includes(t) || t.includes(kw.toLowerCase())) score += 4;
    }
    if (entry.answerEn.toLowerCase().includes(t)) score += 1;
  }
  if (entry.id === "overview" && /what\s+is\s+videh|videh\s+kya/.test(n)) score += 15;
  return score;
}

/** Find best matching product knowledge entries for a question. */
export function searchProductKnowledge(question: string, limit = 4): ProductKnowledgeEntry[] {
  const q = question.trim();
  if (!q) return [];
  const tokens = tokenizeQuery(q);
  const scored = PRODUCT_KNOWLEDGE_ENTRIES.map((entry) => ({
    entry,
    score: scoreEntry(entry, q, tokens),
  }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.entry);
}

/** Format top matches for OpenAI context (compact). */
export function formatKnowledgeContext(entries: ProductKnowledgeEntry[]): string {
  if (!entries.length) return "";
  return entries
    .map(
      (e) =>
        `[${e.category}] ${e.title}\nPath: ${e.path}\n${e.answerEn}`,
    )
    .join("\n\n");
}

import { parseAssistantIntent } from "./assistantIntents";

function looksLikeDataOrActionQuery(q: string): boolean {
  const n = q.toLowerCase();
  if (/(kaise|how\s+to|kahan\s+se|where\s+to|tutorial|steps|tarika|tareeka)/.test(n)) return false;
  return /\b(karo|kar\s+do|bhej|send|schedule|sunao|batao|banakar|banao|summary|samri|samjh|count|kitne|kitna|kis[\s-]?ka|kaun|who|call|kholo|open|messaged|aaya|aaye|unread)\b/.test(n);
}

/** Instant spoken answer from knowledge base if confidence is high enough. */
export function answerFromProductKnowledge(
  question: string,
  lang: "en" | "hi",
  userName: string,
  minScore = 6,
): string | null {
  if (parseAssistantIntent(question).type !== "unknown") return null;
  if (looksLikeDataOrActionQuery(question)) return null;

  const tokens = tokenizeQuery(question);
  const scored = PRODUCT_KNOWLEDGE_ENTRIES.map((entry) => ({
    entry,
    score: scoreEntry(entry, question, tokens),
  })).sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < minScore) return null;

  const name = userName.trim().split(/\s+/)[0] || "there";
  const ans = lang === "en" ? best.entry.answerEn : best.entry.answerHi;
  return `${name}${lang === "en" ? "," : " ji,"} ${ans}`;
}

/** Compact A–Z index for system prompts (categories only). */
export function productKnowledgeIndex(): string {
  const cats = new Map<string, string[]>();
  for (const e of PRODUCT_KNOWLEDGE_ENTRIES) {
    const list = cats.get(e.category) ?? [];
    list.push(e.title);
    cats.set(e.category, list);
  }
  const lines: string[] = ["Videh A–Z feature index:"];
  for (const [cat, titles] of cats) {
    lines.push(`${cat}: ${titles.join("; ")}`);
  }
  return lines.join("\n");
}
// Let me check - I wrote `id: "contact-card"` without opening brace
