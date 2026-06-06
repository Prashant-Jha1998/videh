import { useMemo, useState } from "react";
import {
  APP_THEME_OPTIONS,
  daysLeftInThemeTrial,
  getAppThemeById,
  type AppThemeOption,
} from "../../../lib/webAppThemes";
import {
  CHAT_BUBBLE_PRESETS,
  bubbleOverrideFromPreset,
  isBubblePresetSelected,
  selectedBubbleLabel,
  type BubbleOverride,
} from "../../../lib/webBubblePresets";
import { loadString, saveString, WEB_PREFS } from "../../../lib/webLocalPrefs";
import {
  ANIMATED_WALLPAPERS,
  APP_ICON_STYLES,
  THEME_PACK_META,
  getThemeAppearanceById,
  listAppearancesByPack,
  type AnimatedWallpaperId,
  type AppIconStyleId,
  type ThemePackId,
} from "../../../lib/webThemeAppearance";
import {
  applyWebThemeFromPrefs,
  getAnimatedWallpaper,
  loadBubbleOverride,
  saveAnimatedWallpaper,
  saveBubbleOverride,
} from "../../../lib/webTheme";
import {
  SettingsDetailShell,
  SettingsInfoBox,
  SettingsSection,
  SettingsThemeGrid,
} from "./webSettingsUi";

function PackChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      className={`vs-pack-chip${active ? " vs-pack-chip--active" : ""}`}
      onClick={onPress}
    >
      {label}
    </button>
  );
}

export function WebAdvancedThemeSection({ title }: { title: string }) {
  const [appThemeId, setAppThemeId] = useState(() => loadString(WEB_PREFS.appThemeId, "videh-green"));
  const [bubbleOverride, setBubbleOverride] = useState<BubbleOverride | null>(() => loadBubbleOverride());
  const [wallpaper, setWallpaper] = useState<AnimatedWallpaperId>(() => getAnimatedWallpaper());
  const [iconStyle, setIconStyle] = useState<AppIconStyleId>(() => {
    const raw = loadString(WEB_PREFS.appIconStyle, "default");
    return APP_ICON_STYLES.some((s) => s.id === raw) ? (raw as AppIconStyleId) : "default";
  });
  const [packFilter, setPackFilter] = useState<ThemePackId | "all">("all");

  const trialStart = loadString(WEB_PREFS.appThemeTrialStart, "");
  const trialDays = daysLeftInThemeTrial(trialStart || null);
  const appearance = getThemeAppearanceById(appThemeId);
  const usingThemeDefaultBubbles = bubbleOverride == null;
  const activeBubbleLabel = selectedBubbleLabel(bubbleOverride);

  const filteredThemes = useMemo(() => {
    if (packFilter === "all") return APP_THEME_OPTIONS;
    if (packFilter === "custom") return [];
    const ids = new Set(listAppearancesByPack(packFilter).map((a) => a.id));
    return APP_THEME_OPTIONS.filter((t) => ids.has(t.id));
  }, [packFilter]);

  const selectTheme = (id: string) => {
    if (trialDays <= 0 && id !== appThemeId) {
      alert("Your free theme trial has ended. Use the Videh app to manage theme subscription.");
      return;
    }
    if (!trialStart) saveString(WEB_PREFS.appThemeTrialStart, new Date().toISOString());
    setAppThemeId(id);
    saveString(WEB_PREFS.appThemeId, id);
    applyWebThemeFromPrefs();
  };

  const selectBubble = (presetId: string) => {
    const preset = CHAT_BUBBLE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const next = bubbleOverrideFromPreset(preset);
    setBubbleOverride(next);
    saveBubbleOverride(next);
  };

  const resetBubbles = () => {
    setBubbleOverride(null);
    saveBubbleOverride(null);
  };

  const selectWallpaper = (id: AnimatedWallpaperId) => {
    setWallpaper(id);
    saveAnimatedWallpaper(id);
  };

  const selectIcon = (id: AppIconStyleId) => {
    setIconStyle(id);
    saveString(WEB_PREFS.appIconStyle, id);
  };

  return (
    <SettingsDetailShell title={title} subtitle="Bubbles, wallpapers, accents & icons">
      <div
        className="vs-adv-hero"
        style={{ background: `linear-gradient(135deg, ${appearance.accent[0]} 0%, ${appearance.accent[1]} 100%)` }}
      >
        <div className="vs-adv-hero__title">Whole app look</div>
        <div className="vs-adv-hero__sub">
          Accent, chat bubbles, badges, and chat backgrounds change together — like the Videh mobile app.
        </div>
        <div className="vs-adv-hero__preview">
          <div className="vs-adv-hero__bubble vs-adv-hero__bubble--sent" style={{ backgroundColor: appearance.bubbleSentLight }} />
          <div className="vs-adv-hero__bubble vs-adv-hero__bubble--recv" style={{ backgroundColor: appearance.bubbleReceivedLight }} />
        </div>
      </div>

      <SettingsInfoBox>Advanced theme options are saved on this browser and sync with your phone when you use the same account.</SettingsInfoBox>

      <SettingsSection label="1. Chat bubble colors">
        <div className="vs-adv-selected">
          <span>Selected:</span>
          <strong>{activeBubbleLabel}</strong>
        </div>
        <div className="vs-bubble-grid">
          {CHAT_BUBBLE_PRESETS.map((p) => {
            const selected = isBubblePresetSelected(bubbleOverride, p);
            return (
              <button
                key={p.id}
                type="button"
                className={`vs-bubble-preset${selected ? " vs-bubble-preset--active" : ""}`}
                onClick={() => selectBubble(p.id)}
              >
                {selected ? <span className="vs-bubble-preset__check">✓</span> : null}
                <div className="vs-bubble-preset__swatches">
                  <span style={{ backgroundColor: p.sent }} />
                  <span style={{ backgroundColor: p.received }} />
                </div>
                <span className="vs-bubble-preset__name">{p.name}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className={`vs-reset-bubbles${usingThemeDefaultBubbles ? " vs-reset-bubbles--active" : ""}`}
          onClick={resetBubbles}
        >
          {usingThemeDefaultBubbles ? "✓ " : ""}Use theme default bubbles
        </button>
      </SettingsSection>

      <SettingsSection label="2. App accent color">
        <div className="vs-pack-scroll">
          <PackChip label="All" active={packFilter === "all"} onPress={() => setPackFilter("all")} />
          {(Object.keys(THEME_PACK_META) as ThemePackId[]).map((id) => (
            <PackChip
              key={id}
              label={THEME_PACK_META[id].title}
              active={packFilter === id}
              onPress={() => setPackFilter(id)}
            />
          ))}
        </div>
        {packFilter !== "custom" && packFilter !== "all" ? (
          <p className="vs-pack-hint">{THEME_PACK_META[packFilter].subtitle}</p>
        ) : null}
        <SettingsThemeGrid
          themes={filteredThemes as AppThemeOption[]}
          selectedId={appThemeId}
          onSelect={selectTheme}
        />
      </SettingsSection>

      <SettingsSection label="3. Animated chat wallpaper">
        <div className="vs-wallpaper-grid">
          {ANIMATED_WALLPAPERS.map((w) => (
            <button
              key={w.id}
              type="button"
              className={`vs-wallpaper-chip${wallpaper === w.id ? " vs-wallpaper-chip--active" : ""}`}
              onClick={() => selectWallpaper(w.id)}
            >
              <span className={`vs-wallpaper-chip__preview vs-wallpaper-chip__preview--${w.id}`} />
              <span>{w.name}</span>
            </button>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection label="4. App icon style">
        <p className="vs-pack-hint">Saved here for reference. To change the actual app icon on your phone, use the Videh mobile app.</p>
        <div className="vs-icon-grid">
          {APP_ICON_STYLES.map((icon) => (
            <button
              key={icon.id}
              type="button"
              className={`vs-icon-style${iconStyle === icon.id ? " vs-icon-style--active" : ""}`}
              onClick={() => selectIcon(icon.id)}
            >
              <span className="vs-icon-style__swatch" style={{ backgroundColor: icon.color }} />
              <span>{icon.name}</span>
            </button>
          ))}
        </div>
      </SettingsSection>
    </SettingsDetailShell>
  );
}
