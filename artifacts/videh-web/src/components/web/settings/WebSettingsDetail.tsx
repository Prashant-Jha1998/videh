import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useState } from "react";
import {
  daysLeftInThemeTrial,
  GRADIENT_APP_THEMES,
  SOLID_APP_THEMES,
  type AppThemeOption,
} from "../../../lib/webAppThemes";
import { applyWebThemeFromPrefs } from "../../../lib/webTheme";
import { WebAdvancedThemeSection } from "./WebAdvancedThemeSection";
import { loadBool, loadString, saveBool, saveString, WEB_PREFS } from "../../../lib/webLocalPrefs";
import type { SettingsSectionId, VisibilityLabel, WebPrivacySettings } from "../../../lib/webSettingsTypes";
import {
  DISAPPEAR_OPTIONS,
  VISIBILITY_OPTIONS,
  visibilityLabelToApi,
} from "../../../lib/webSettingsTypes";
import { webApi, type WebUser } from "../../../lib/webApi";
import {
  SettingsBadge,
  SettingsDetailShell,
  SettingsInfoBox,
  SettingsModal,
  SettingsOptionRow,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
  SettingsThemeGrid,
} from "./webSettingsUi";

const LANGUAGES = [
  { code: "en", name: "English", native: "English" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "bn", name: "Bengali", native: "বাংলা" },
  { code: "te", name: "Telugu", native: "తెలుగు" },
  { code: "mr", name: "Marathi", native: "मराठी" },
  { code: "ta", name: "Tamil", native: "தமிழ்" },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી" },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ" },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "ur", name: "Urdu", native: "اردو" },
];

const WALLPAPERS = ["Default", "Dark", "Classic Dark", "Light Blue", "Solid Black", "Solid White"];
const FONT_SIZES = ["Small", "Medium", "Large", "Extra Large"];
const CHAT_THEMES = ["System default", "Light", "Dark"];
const SOUND_OPTIONS = ["Default", "Chime", "Pop", "Bell", "Soft"];
const PREVIEW_OPTIONS = ["Always show preview", "Only show sender name", "No preview"];

const SECTION_TITLES: Record<SettingsSectionId, string> = {
  assistant: "Hey Videh",
  account: "Account",
  privacy: "Privacy",
  theme: "App theme",
  "advanced-theme": "Advanced theme",
  chats: "Chats",
  broadcasts: "Broadcasts",
  sos: "SOS",
  notifications: "Notifications",
  "premium-sounds": "Premium sounds",
  storage: "Storage and data",
  accessibility: "Accessibility",
  language: "App language",
  help: "Help",
  invite: "Invite a friend",
  updates: "App updates",
  "qr-code": "QR code",
};

type BlockedUser = { id: number; name?: string | null; phone?: string; avatar_url?: string | null };
type LinkedDevice = { token: string; device_name: string; platform: string; linked_at: string; last_active: string };
type SosContact = { id: number; contact_name: string; contact_phone: string | null; linked_name: string | null };

function buildContactQr(user: WebUser) {
  const params = new URLSearchParams();
  params.set("uid", String(user.id));
  if (user.phone) params.set("phone", user.phone);
  if (user.name) params.set("name", user.name);
  return `videh://contact?${params.toString()}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 2) return "Active now";
  if (mins < 60) return `Active ${mins} min ago`;
  if (hrs < 24) return `Active ${hrs}h ago`;
  return `Active ${days}d ago`;
}

function VisibilityPicker({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: VisibilityLabel;
  onChange: (v: VisibilityLabel) => void;
  disabled?: boolean;
}) {
  return (
    <SettingsSelect
      label={label}
      value={value}
      options={[...VISIBILITY_OPTIONS]}
      onChange={(v) => onChange(v as VisibilityLabel)}
      disabled={disabled}
    />
  );
}

export function WebSettingsDetail({
  section,
  token,
  user,
  currentToken,
  onLogout,
  onOpenSupportChat,
}: {
  section: SettingsSectionId;
  token: string;
  user: WebUser;
  currentToken: string;
  onLogout: () => void;
  onOpenSupportChat?: () => void;
}) {
  const title = SECTION_TITLES[section];

  if (section === "assistant") return <AssistantSection title={title} />;
  if (section === "account")
    return <AccountSection title={title} token={token} user={user} currentToken={currentToken} onLogout={onLogout} />;
  if (section === "privacy") return <PrivacySection title={title} token={token} />;
  if (section === "theme") return <ThemeSection title={title} />;
  if (section === "advanced-theme") return <WebAdvancedThemeSection title={title} />;
  if (section === "chats") return <ChatsSection title={title} />;
  if (section === "broadcasts") return <BroadcastsSection title={title} />;
  if (section === "sos") return <SosSection title={title} token={token} />;
  if (section === "notifications") return <NotificationsSection title={title} />;
  if (section === "premium-sounds") return <PremiumSoundsSection title={title} />;
  if (section === "storage") return <StorageSection title={title} token={token} />;
  if (section === "accessibility") return <AccessibilitySection title={title} />;
  if (section === "language") return <LanguageSection title={title} token={token} />;
  if (section === "help") return <HelpSection title={title} onOpenSupportChat={onOpenSupportChat} />;
  if (section === "invite") return <InviteSection title={title} />;
  if (section === "updates") return <UpdatesSection title={title} />;
  if (section === "qr-code") return <QrCodeSection title={title} user={user} />;
  return null;
}

function AssistantSection({ title }: { title: string }) {
  return (
    <SettingsDetailShell title={title} subtitle="Voice assistant preferences">
      <SettingsInfoBox>
        Hey Videh is your voice assistant on Videh. On web you can view preferences here; voice enrollment and wake-word
        activation work best in the Videh mobile app.
      </SettingsInfoBox>
      <SettingsSection label="Assistant">
        <SettingsSwitch
          label="Hey Videh assistant"
          hint="Say Hey Videh to open the assistant (mobile app)"
          checked={loadBool("assistant_enabled", true)}
          onChange={(v) => saveBool("assistant_enabled", v)}
        />
        <SettingsRow
          label="Voice enrollment"
          hint="Record your voice so Hey Videh recognizes you"
          value="Use the Videh app on your phone"
        />
        <SettingsRow label="Assistant language" value="Same as app language" />
      </SettingsSection>
    </SettingsDetailShell>
  );
}

function AccountSection({
  title,
  token,
  user,
  currentToken,
  onLogout,
}: {
  title: string;
  token: string;
  user: WebUser;
  currentToken: string;
  onLogout: () => void;
}) {
  const [twoStep, setTwoStep] = useState(false);
  const [devices, setDevices] = useState<LinkedDevice[]>([]);
  const [pinInput, setPinInput] = useState("");
  const [pinMode, setPinMode] = useState<"off" | "set" | "remove">("off");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void webApi.twoStepStatus(token).then((d) => setTwoStep(d.enabled)).catch(() => {});
    void webApi.linkedDevices(token).then((d) => setDevices(d.devices)).catch(() => {});
  }, [token]);

  const savePin = async () => {
    if (pinInput.length !== 6 || !/^\d+$/.test(pinInput)) {
      alert("Enter a 6-digit numeric PIN.");
      return;
    }
    setBusy(true);
    try {
      if (pinMode === "set") {
        await webApi.setTwoStepPin(token, pinInput);
        setTwoStep(true);
        setPinMode("off");
        setPinInput("");
        alert("Two-step verification enabled.");
      } else if (pinMode === "remove") {
        await webApi.removeTwoStepPin(token, pinInput);
        setTwoStep(false);
        setPinMode("off");
        setPinInput("");
        alert("Two-step verification disabled.");
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not update PIN.");
    } finally {
      setBusy(false);
    }
  };

  const logoutDevice = async (deviceToken: string) => {
    if (!confirm("Log out this linked device?")) return;
    try {
      await webApi.logoutDevice(deviceToken);
      setDevices((prev) => prev.filter((d) => d.token !== deviceToken));
    } catch {
      alert("Could not log out device.");
    }
  };

  return (
    <SettingsDetailShell title={title} subtitle="Security, devices, and account info">
      <SettingsSection label="Phone number">
        <SettingsRow label="Your phone" value={`+91 ${user.phone}`} />
      </SettingsSection>
      <SettingsSection label="Security">
        <SettingsRow
          label="Two-step verification"
          value={twoStep ? "On" : "Off"}
          onClick={() => {
            if (twoStep) setPinMode("remove");
            else setPinMode("set");
          }}
        />
        {pinMode !== "off" ? (
          <div className="vs-form">
            <div className="vs-row__hint" style={{ marginBottom: 10 }}>
              {pinMode === "set" ? "Create a 6-digit PIN" : "Enter your PIN to disable"}
            </div>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="••••••"
              className="vs-input vs-pin-input"
            />
            <div className="vs-btn-row">
              <button type="button" disabled={busy} onClick={() => void savePin()} className="vs-btn vs-btn--primary">
                {pinMode === "set" ? "Enable" : "Disable"}
              </button>
              <button
                type="button"
                onClick={() => { setPinMode("off"); setPinInput(""); }}
                className="vs-btn vs-btn--ghost"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        <SettingsRow
          label="Change number"
          hint="Transfer account to a new phone number"
          value="Use the Videh app to verify your new number"
        />
      </SettingsSection>
      <SettingsSection label="Linked devices">
        {devices.length === 0 ? (
          <SettingsRow label="No linked devices" value="Link Videh Web or Desktop from your phone" />
        ) : (
          devices.map((d) => (
            <SettingsRow
              key={d.token}
              label={d.device_name || d.platform || "Device"}
              value={`${d.platform} · ${timeAgo(d.last_active)}${d.token === currentToken ? " · This device" : ""}`}
              onClick={d.token !== currentToken ? () => void logoutDevice(d.token) : undefined}
              right={
                d.token === currentToken ? (
                  <SettingsBadge>Current</SettingsBadge>
                ) : (
                  <SettingsBadge variant="red">Log out</SettingsBadge>
                )
              }
            />
          ))
        )}
      </SettingsSection>
      <SettingsSection label="Account data">
        <SettingsRow
          label="Request account info"
          hint="Get a report of your Videh account information"
          onClick={() => alert("Your account information report will be ready within 3 days.")}
        />
      </SettingsSection>
      <SettingsSection>
        <SettingsRow
          label="Delete account"
          hint="Delete your account and all data permanently"
          danger
          onClick={() => {
            if (confirm("Delete your Videh account? This cannot be undone.")) {
              if (confirm("Are you sure? All chats and data will be removed.")) onLogout();
            }
          }}
        />
      </SettingsSection>
    </SettingsDetailShell>
  );
}

function PrivacySection({ title, token }: { title: string; token: string }) {
  const [settings, setSettings] = useState<WebPrivacySettings | null>(null);
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [saving, setSaving] = useState(false);
  const [showBlocked, setShowBlocked] = useState(false);

  const load = useCallback(async () => {
    try {
      const [privacy, blockedRes] = await Promise.all([webApi.privacy(token), webApi.blocked(token)]);
      setSettings(privacy);
      setBlocked(blockedRes.blocked);
    } catch {
      /* ignore */
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const savePatch = async (patch: Parameters<typeof webApi.patchPrivacy>[1]) => {
    if (saving) return;
    setSaving(true);
    try {
      const next = await webApi.patchPrivacy(token, patch);
      setSettings(next);
    } catch {
      alert("Could not save privacy settings.");
      void load();
    } finally {
      setSaving(false);
    }
  };

  const saveVisibility = (
    field: "profilePhotoPrivacy" | "aboutPrivacy" | "statusPrivacy" | "groupsPrivacy",
    label: VisibilityLabel,
  ) => {
    const apiValue = visibilityLabelToApi(label);
    void savePatch({ [field]: apiValue });
    setSettings((prev) => {
      if (!prev) return prev;
      const key =
        field === "profilePhotoPrivacy" ? "profilePhotoLabel"
        : field === "aboutPrivacy" ? "aboutLabel"
        : field === "statusPrivacy" ? "statusLabel"
        : "groupsLabel";
      return { ...prev, [key]: label };
    });
  };

  const unblock = async (contact: BlockedUser) => {
    if (!confirm(`Unblock ${contact.name || contact.phone || "this contact"}?`)) return;
    try {
      await webApi.unblock(token, contact.id);
      setBlocked((prev) => prev.filter((c) => c.id !== contact.id));
    } catch {
      alert("Could not unblock contact.");
    }
  };

  return (
    <SettingsDetailShell title={title} subtitle="Control who sees your info and activity">
      <SettingsSection label="Who can see my personal info">
        <SettingsRow
          label="Last seen and online"
          value={settings?.lastSeenLabel === "Nobody" ? "Nobody" : settings?.onlineLabel ?? "My contacts"}
        />
        <VisibilityPicker
          label="Profile photo"
          value={settings?.profilePhotoLabel ?? "My contacts"}
          onChange={(v) => saveVisibility("profilePhotoPrivacy", v)}
          disabled={!settings || saving}
        />
        <VisibilityPicker
          label="About"
          value={settings?.aboutLabel ?? "My contacts"}
          onChange={(v) => saveVisibility("aboutPrivacy", v)}
          disabled={!settings || saving}
        />
        <VisibilityPicker
          label="Status"
          value={settings?.statusLabel ?? "My contacts"}
          onChange={(v) => saveVisibility("statusPrivacy", v)}
          disabled={!settings || saving}
        />
        <VisibilityPicker
          label="Groups"
          value={settings?.groupsLabel ?? "Everyone"}
          onChange={(v) => saveVisibility("groupsPrivacy", v)}
          disabled={!settings || saving}
        />
      </SettingsSection>
      <SettingsSection label="Messaging">
        <SettingsSwitch
          label="Read receipts"
          hint="When off, you won't send or receive read receipts. Group chats always send receipts."
          checked={settings?.readReceiptsEnabled ?? true}
          onChange={(v) => {
            setSettings((p) => (p ? { ...p, readReceiptsEnabled: v } : p));
            void savePatch({ readReceiptsEnabled: v });
          }}
          disabled={!settings || saving}
        />
      </SettingsSection>
      <SettingsSection label="Default message timer">
        <SettingsSelect
          label="Disappearing messages"
          value={settings?.disappearLabel ?? "Off"}
          options={DISAPPEAR_OPTIONS.map((o) => o.label)}
          onChange={(label) => {
            const opt = DISAPPEAR_OPTIONS.find((o) => o.label === label);
            if (!opt) return;
            setSettings((p) => (p ? { ...p, disappearLabel: label, defaultDisappearSeconds: opt.seconds } : p));
            void savePatch({ defaultDisappearSeconds: opt.seconds });
          }}
          disabled={!settings || saving}
        />
      </SettingsSection>
      <SettingsSection label="Calls">
        <SettingsSwitch
          label="Silence unknown callers"
          hint="Calls from unknown numbers will be silenced and shown in the call log."
          checked={settings?.silenceUnknownCallers ?? false}
          onChange={(v) => {
            setSettings((p) => (p ? { ...p, silenceUnknownCallers: v } : p));
            void savePatch({ silenceUnknownCallers: v });
          }}
          disabled={!settings || saving}
        />
      </SettingsSection>
      <SettingsSection>
        <SettingsRow
          label="Blocked contacts"
          value={`${blocked.length} contact${blocked.length === 1 ? "" : "s"}`}
          onClick={() => setShowBlocked(true)}
          danger
        />
      </SettingsSection>
      <SettingsModal
        title="Blocked contacts"
        hint="Blocked contacts cannot message, call, or see your status updates."
        open={showBlocked}
        onClose={() => setShowBlocked(false)}
      >
        {blocked.length === 0 ? (
          <div className="vs-empty-nav">No blocked contacts</div>
        ) : (
          blocked.map((c) => (
            <button key={c.id} type="button" className="vs-contact-row" onClick={() => void unblock(c)}>
              <div className="vs-contact-avatar">{(c.name || c.phone || "?").slice(0, 1).toUpperCase()}</div>
              <div className="vs-row__main">
                <div className="vs-row__label">{c.name || c.phone || "Unknown"}</div>
                <div className="vs-row__hint">Tap to unblock</div>
              </div>
            </button>
          ))
        )}
      </SettingsModal>
    </SettingsDetailShell>
  );
}

function ThemeSection({ title }: { title: string }) {
  const [themeId, setThemeId] = useState(() => loadString(WEB_PREFS.appThemeId, "videh-green"));
  const trialStart = loadString(WEB_PREFS.appThemeTrialStart, "");
  const trialDays = daysLeftInThemeTrial(trialStart || null);

  const selectTheme = (id: string) => {
    if (trialDays <= 0 && id !== themeId) {
      alert("Your free theme trial has ended. Use the Videh app to manage theme subscription.");
      return;
    }
    if (!trialStart) saveString(WEB_PREFS.appThemeTrialStart, new Date().toISOString());
    setThemeId(id);
    saveString(WEB_PREFS.appThemeId, id);
    applyWebThemeFromPrefs();
  };

  useEffect(() => {
    applyWebThemeFromPrefs();
  }, [themeId]);

  const renderGrid = (themes: AppThemeOption[], sectionLabel: string) => (
    <SettingsSection label={sectionLabel}>
      <SettingsThemeGrid themes={themes} selectedId={themeId} onSelect={selectTheme} />
    </SettingsSection>
  );

  return (
    <SettingsDetailShell title={title} subtitle="Personalize your Videh experience">
      {trialDays > 0 ? (
        <SettingsInfoBox>{trialDays} days left in your free theme trial.</SettingsInfoBox>
      ) : (
        <SettingsInfoBox>Theme trial ended. Current theme is kept; switch themes in the Videh app.</SettingsInfoBox>
      )}
      {renderGrid(SOLID_APP_THEMES, "Solid themes")}
      {renderGrid(GRADIENT_APP_THEMES, "Gradient themes")}
    </SettingsDetailShell>
  );
}

function ChatsSection({ title }: { title: string }) {
  const [enterSend, setEnterSend] = useState(() => loadBool(WEB_PREFS.enterIsSend, false));
  const [mediaVis, setMediaVis] = useState(() => loadBool(WEB_PREFS.mediaVisibility, true));
  const [theme, setTheme] = useState(() => loadString(WEB_PREFS.chatTheme, "System default"));
  const [font, setFont] = useState(() => loadString(WEB_PREFS.chatFont, "Medium"));
  const [wallpaper, setWallpaper] = useState(() => loadString(WEB_PREFS.chatWallpaper, "Default"));
  const [backup, setBackup] = useState(() => loadString(WEB_PREFS.chatBackup, "Weekly"));

  return (
    <SettingsDetailShell title={title}>
      <SettingsSection label="Display">
        <SettingsSelect label="Theme" value={theme} options={CHAT_THEMES} onChange={(v) => { setTheme(v); saveString(WEB_PREFS.chatTheme, v); }} />
        <SettingsSelect label="Font size" value={font} options={FONT_SIZES} onChange={(v) => { setFont(v); saveString(WEB_PREFS.chatFont, v); }} />
        <SettingsSelect label="Wallpaper" value={wallpaper} options={WALLPAPERS} onChange={(v) => { setWallpaper(v); saveString(WEB_PREFS.chatWallpaper, v); }} />
      </SettingsSection>
      <SettingsSection label="Chat settings">
        <SettingsSwitch
          label="Enter is send"
          hint="Press Enter to send messages (Shift+Enter for new line)"
          checked={enterSend}
          onChange={(v) => { setEnterSend(v); saveBool(WEB_PREFS.enterIsSend, v); }}
        />
        <SettingsSwitch
          label="Media visibility"
          hint="Show newly downloaded media in your phone's gallery"
          checked={mediaVis}
          onChange={(v) => { setMediaVis(v); saveBool(WEB_PREFS.mediaVisibility, v); }}
        />
        <SettingsSelect label="Chat backup" value={backup} options={["Never", "Daily", "Weekly", "Monthly"]} onChange={(v) => { setBackup(v); saveString(WEB_PREFS.chatBackup, v); }} />
      </SettingsSection>
      <SettingsSection label="Chat history">
        <SettingsRow label="Export chat" hint="Download a copy of your chats" onClick={() => alert("Open a chat and use Export from chat menu, or use the Videh app for full backup.")} />
        <SettingsRow label="Clear all chats" hint="Delete all messages" danger onClick={() => alert("Use the Videh app to clear all chat history safely.")} />
      </SettingsSection>
    </SettingsDetailShell>
  );
}

function BroadcastsSection({ title }: { title: string }) {
  return (
    <SettingsDetailShell title={title}>
      <SettingsInfoBox>
        Broadcast lists let you send the same message to many contacts at once. Create and manage broadcasts from the
        Videh app; messages you send from broadcasts appear in your chats on web.
      </SettingsInfoBox>
      <SettingsSection>
        <SettingsRow label="Create broadcast list" hint="Add contacts and send updates to everyone at once" value="Open Videh app → Settings → Broadcasts" />
        <SettingsRow label="Manage lists" hint="Edit or delete your broadcast lists" value="Available in the mobile app" />
      </SettingsSection>
    </SettingsDetailShell>
  );
}

function SosSection({ title, token }: { title: string; token: string }) {
  const [contacts, setContacts] = useState<SosContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await webApi.sosContacts(token);
      setContacts(d.contacts);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const addContact = async () => {
    if (!name.trim()) return;
    setAdding(true);
    try {
      await webApi.addSosContact(token, { contactName: name.trim(), contactPhone: phone.trim() || undefined });
      setName("");
      setPhone("");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not add contact.");
    } finally {
      setAdding(false);
    }
  };

  const removeContact = async (id: number) => {
    if (!confirm("Remove this SOS contact?")) return;
    try {
      await webApi.removeSosContact(token, id);
      setContacts((prev) => prev.filter((c) => c.id !== id));
    } catch {
      alert("Could not remove contact.");
    }
  };

  return (
    <SettingsDetailShell title={title}>
      <SettingsInfoBox>
        SOS sends an emergency alert to your trusted contacts. Hold the SOS button in the Videh app to trigger; manage
        contacts here on web.
      </SettingsInfoBox>
      <SettingsSection label="Emergency contacts">
        {loading ? (
          <SettingsRow label="Loading…" />
        ) : contacts.length === 0 ? (
          <SettingsRow label="No SOS contacts yet" hint="Add up to 5 trusted contacts" />
        ) : (
          contacts.map((c) => (
            <SettingsRow
              key={c.id}
              label={c.contact_name}
              value={c.contact_phone || c.linked_name || undefined}
              onClick={() => void removeContact(c.id)}
              right={<SettingsBadge variant="red">Remove</SettingsBadge>}
            />
          ))
        )}
      </SettingsSection>
      <SettingsSection label="Add contact">
        <div className="vs-form">
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="vs-input" />
          <input placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} className="vs-input" />
          <button
            type="button"
            disabled={adding || !name.trim()}
            onClick={() => void addContact()}
            className="vs-btn vs-btn--primary"
          >
            Add SOS contact
          </button>
        </div>
      </SettingsSection>
    </SettingsDetailShell>
  );
}

function NotificationsSection({ title }: { title: string }) {
  const [msgNotifs, setMsgNotifs] = useState(() => loadBool(WEB_PREFS.msgNotifs, true));
  const [msgVibrate, setMsgVibrate] = useState(() => loadBool(WEB_PREFS.msgVibrate, true));
  const [msgPreview, setMsgPreview] = useState(() => loadString(WEB_PREFS.msgPreview, PREVIEW_OPTIONS[0]));
  const [groupNotifs, setGroupNotifs] = useState(() => loadBool(WEB_PREFS.groupNotifs, true));
  const [callNotifs, setCallNotifs] = useState(() => loadBool(WEB_PREFS.callNotifs, true));
  const [callVibrate, setCallVibrate] = useState(() => loadBool(WEB_PREFS.callVibrate, true));
  const [statusNotifs, setStatusNotifs] = useState(() => loadBool(WEB_PREFS.statusNotifs, true));
  const [reactionNotifs, setReactionNotifs] = useState(() => loadBool(WEB_PREFS.reactionNotifs, true));

  return (
    <SettingsDetailShell title={title}>
      <SettingsSection label="Messages">
        <SettingsSwitch label="Message notifications" checked={msgNotifs} onChange={(v) => { setMsgNotifs(v); saveBool(WEB_PREFS.msgNotifs, v); }} />
        <SettingsSwitch label="Vibrate" checked={msgVibrate} onChange={(v) => { setMsgVibrate(v); saveBool(WEB_PREFS.msgVibrate, v); }} />
        <SettingsSelect label="Notification preview" value={msgPreview} options={PREVIEW_OPTIONS} onChange={(v) => { setMsgPreview(v); saveString(WEB_PREFS.msgPreview, v); }} />
      </SettingsSection>
      <SettingsSection label="Groups">
        <SettingsSwitch label="Group notifications" checked={groupNotifs} onChange={(v) => { setGroupNotifs(v); saveBool(WEB_PREFS.groupNotifs, v); }} />
      </SettingsSection>
      <SettingsSection label="Calls">
        <SettingsSwitch label="Show notifications" checked={callNotifs} onChange={(v) => { setCallNotifs(v); saveBool(WEB_PREFS.callNotifs, v); }} />
        <SettingsSwitch label="Vibrate" checked={callVibrate} onChange={(v) => { setCallVibrate(v); saveBool(WEB_PREFS.callVibrate, v); }} />
      </SettingsSection>
      <SettingsSection label="Status">
        <SettingsSwitch label="Status reactions" checked={reactionNotifs} onChange={(v) => { setReactionNotifs(v); saveBool(WEB_PREFS.reactionNotifs, v); }} />
        <SettingsSwitch label="Status updates" checked={statusNotifs} onChange={(v) => { setStatusNotifs(v); saveBool(WEB_PREFS.statusNotifs, v); }} />
      </SettingsSection>
    </SettingsDetailShell>
  );
}

function PremiumSoundsSection({ title }: { title: string }) {
  const [msgSound, setMsgSound] = useState(() => loadString(WEB_PREFS.messageSound, "Default"));
  const [groupSound, setGroupSound] = useState(() => loadString(WEB_PREFS.groupSound, "Default"));
  const [ringtone, setRingtone] = useState(() => loadString(WEB_PREFS.callRingtone, "Default"));

  return (
    <SettingsDetailShell title={title}>
      <SettingsSection label="Message tones">
        <SettingsSelect label="Message sound" value={msgSound} options={SOUND_OPTIONS} onChange={(v) => { setMsgSound(v); saveString(WEB_PREFS.messageSound, v); }} />
        <SettingsSelect label="Group message sound" value={groupSound} options={SOUND_OPTIONS} onChange={(v) => { setGroupSound(v); saveString(WEB_PREFS.groupSound, v); }} />
      </SettingsSection>
      <SettingsSection label="Calls">
        <SettingsSelect label="Ringtone" value={ringtone} options={SOUND_OPTIONS} onChange={(v) => { setRingtone(v); saveString(WEB_PREFS.callRingtone, v); }} />
      </SettingsSection>
      <SettingsInfoBox>Per-contact custom sounds are available in the Videh mobile app.</SettingsInfoBox>
    </SettingsDetailShell>
  );
}

function StorageSection({ title, token }: { title: string; token: string }) {
  const [stats, setStats] = useState<{ total_chats: number; total_messages: number; media_messages: number; text_messages: number } | null>(null);
  const [autoImg, setAutoImg] = useState(() => loadBool(WEB_PREFS.autoDownloadImages, true));
  const [autoVid, setAutoVid] = useState(() => loadBool(WEB_PREFS.autoDownloadVideos, false));
  const [autoDoc, setAutoDoc] = useState(() => loadBool(WEB_PREFS.autoDownloadDocs, true));

  useEffect(() => {
    void webApi.storageStats(token).then((d) => setStats(d.stats)).catch(() => {});
  }, [token]);

  return (
    <SettingsDetailShell title={title}>
      <SettingsSection label="Storage usage">
        <SettingsRow label="Total chats" value={stats ? String(stats.total_chats) : "…"} />
        <SettingsRow label="Total messages" value={stats ? String(stats.total_messages) : "…"} />
        <SettingsRow label="Media messages" value={stats ? String(stats.media_messages) : "…"} />
        <SettingsRow label="Text messages" value={stats ? String(stats.text_messages) : "…"} />
      </SettingsSection>
      <SettingsSection label="Media auto-download">
        <SettingsSwitch label="Photos" checked={autoImg} onChange={(v) => { setAutoImg(v); saveBool(WEB_PREFS.autoDownloadImages, v); }} />
        <SettingsSwitch label="Videos" checked={autoVid} onChange={(v) => { setAutoVid(v); saveBool(WEB_PREFS.autoDownloadVideos, v); }} />
        <SettingsSwitch label="Documents" checked={autoDoc} onChange={(v) => { setAutoDoc(v); saveBool(WEB_PREFS.autoDownloadDocs, v); }} />
      </SettingsSection>
    </SettingsDetailShell>
  );
}

function AccessibilitySection({ title }: { title: string }) {
  const [fontSize, setFontSize] = useState(() => loadString(WEB_PREFS.fontSize, "medium"));
  const [highContrast, setHighContrast] = useState(() => loadBool(WEB_PREFS.highContrast, false));
  const [reduceMotion, setReduceMotion] = useState(() => loadBool(WEB_PREFS.reduceMotion, false));
  const [boldText, setBoldText] = useState(() => loadBool(WEB_PREFS.boldText, false));

  const FONT_OPTS = [
    { key: "small", label: "Small" },
    { key: "medium", label: "Normal" },
    { key: "large", label: "Large" },
    { key: "xlarge", label: "Extra large" },
  ];

  return (
    <SettingsDetailShell title={title}>
      <SettingsSection label="Text">
        {FONT_OPTS.map((f) => (
          <SettingsOptionRow
            key={f.key}
            label={f.label}
            selected={fontSize === f.key}
            onClick={() => { setFontSize(f.key); saveString(WEB_PREFS.fontSize, f.key); }}
          />
        ))}
        <SettingsSwitch label="Bold text" checked={boldText} onChange={(v) => { setBoldText(v); saveBool(WEB_PREFS.boldText, v); }} />
      </SettingsSection>
      <SettingsSection label="Display">
        <SettingsSwitch label="High contrast" checked={highContrast} onChange={(v) => { setHighContrast(v); saveBool(WEB_PREFS.highContrast, v); }} />
        <SettingsSwitch label="Reduce motion" checked={reduceMotion} onChange={(v) => { setReduceMotion(v); saveBool(WEB_PREFS.reduceMotion, v); }} />
      </SettingsSection>
    </SettingsDetailShell>
  );
}

function LanguageSection({ title, token }: { title: string; token: string }) {
  const [selected, setSelected] = useState(() => loadString(WEB_PREFS.locale, "en"));

  const select = async (code: string) => {
    setSelected(code);
    saveString(WEB_PREFS.locale, code);
    try {
      await webApi.setLanguage(token, code);
    } catch {
      /* saved locally */
    }
    const lang = LANGUAGES.find((l) => l.code === code);
    alert(`Language set to ${lang?.name ?? code}. Refresh the page to apply everywhere.`);
  };

  return (
    <SettingsDetailShell title={title}>
      <SettingsInfoBox>Select your preferred language. Chat translations use this setting.</SettingsInfoBox>
      <SettingsSection>
        {LANGUAGES.map((l) => (
          <SettingsOptionRow
            key={l.code}
            label={l.name}
            sub={l.native}
            selected={selected === l.code}
            onClick={() => void select(l.code)}
          />
        ))}
      </SettingsSection>
    </SettingsDetailShell>
  );
}

function HelpSection({ title, onOpenSupportChat }: { title: string; onOpenSupportChat?: () => void }) {
  return (
    <SettingsDetailShell title={title}>
      <SettingsSection>
        <SettingsRow label="Help Centre" hint="Find answers to common questions" onClick={() => window.open("https://help.videh.app", "_blank")} />
        <SettingsRow label="Contact us" hint="Message Videh Support" onClick={onOpenSupportChat} />
        <SettingsRow label="Terms and Privacy Policy" onClick={() => window.open("https://videh.app/privacy", "_blank")} />
        <SettingsRow label="App info" value="Videh Messenger · web.videh.co.in" />
      </SettingsSection>
    </SettingsDetailShell>
  );
}

function InviteSection({ title }: { title: string }) {
  const message = "Use Videh - India's fastest messaging app!\n\nDownload: https://videh.app";

  return (
    <SettingsDetailShell title={title}>
      <SettingsInfoBox>Share Videh with friends and family.</SettingsInfoBox>
      <SettingsSection>
        <SettingsRow
          label="Share invite link"
          hint="https://videh.app"
          onClick={async () => {
            if (navigator.share) {
              try {
                await navigator.share({ title: "Videh", text: message, url: "https://videh.app" });
              } catch {
                /* cancelled */
              }
            } else {
              void navigator.clipboard.writeText(message);
              alert("Invite message copied to clipboard.");
            }
          }}
        />
        <SettingsRow
          label="Copy invite message"
          onClick={() => {
            void navigator.clipboard.writeText(message);
            alert("Copied to clipboard.");
          }}
        />
      </SettingsSection>
    </SettingsDetailShell>
  );
}

function UpdatesSection({ title }: { title: string }) {
  return (
    <SettingsDetailShell title={title}>
      <SettingsSection>
        <SettingsRow label="Videh Web" value="Latest version" />
        <SettingsRow
          label="What's new"
          hint="Broadcasts, SOS, disappearing messages, QR codes, and more"
          onClick={() => alert("You're on the latest Videh Web. For Android app updates, check the Play Store or videh.app.")}
        />
        <SettingsRow label="Check for updates" onClick={() => alert("Videh Web is always up to date when you refresh the page.")} />
      </SettingsSection>
    </SettingsDetailShell>
  );
}

function QrCodeSection({ title, user }: { title: string; user: WebUser }) {
  const qrValue = buildContactQr(user);
  return (
    <SettingsDetailShell title={title} subtitle="Share your contact with friends">
      <div className="vs-qr-wrap">
        <div className="vs-qr-card">
          <QRCodeSVG value={qrValue} size={220} level="M" includeMargin />
        </div>
        <div className="vs-qr-user">
          <div className="vs-qr-user__name">{user.name}</div>
          <div className="vs-qr-user__phone">+91 {user.phone}</div>
        </div>
        <SettingsInfoBox>
          Your contacts can scan this code to add you on Videh. Linking new devices still requires the phone app.
        </SettingsInfoBox>
      </div>
    </SettingsDetailShell>
  );
}
