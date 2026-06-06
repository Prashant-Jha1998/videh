import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DisappearMessagesIllustration } from "@/components/DisappearMessagesIllustration";
import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import {
  CHAT_DISAPPEAR_TIMER_OPTIONS,
  isSameDisappearTimer,
} from "@/lib/disappearTimerOptions";

const WA_GREEN = "#00A884";

function RadioOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.optionRow} onPress={onPress} activeOpacity={0.65}>
      <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
        {selected ? <View style={styles.radioInner} /> : null}
      </View>
      <Text style={styles.optionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function DisappearingMessagesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { chats, setChatDisappear } = useApp();

  const chat = chats.find((c) => c.id === id);
  const currentSeconds = chat?.disappearAfterSeconds ?? null;
  const [pending, setPending] = useState<number | null | undefined>(undefined);

  const selectedSeconds = pending !== undefined ? pending : currentSeconds;
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const applyTimer = useCallback(
    async (seconds: number | null) => {
      if (!id) return;
      if (isSameDisappearTimer(seconds, currentSeconds)) {
        router.back();
        return;
      }
      setPending(seconds);
      try {
        await setChatDisappear(id, seconds);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.back();
      } catch {
        setPending(undefined);
        Alert.alert("Error", "Could not update the message timer. Try again.");
      }
    },
    [currentSeconds, id, router, setChatDisappear],
  );

  const learnMore = () => {
    Alert.alert(
      "Disappearing messages",
      "When enabled, new messages in this chat disappear for everyone after the time you choose. Anyone in the chat can change this setting.\n\nKept messages stay in the chat. Media may remain on your device after it disappears from the chat.",
      [{ text: "OK" }],
    );
  };

  const options = useMemo(() => CHAT_DISAPPEAR_TIMER_OPTIONS, []);

  return (
    <View style={[styles.container, { backgroundColor: "#fff" }]}>
      <View style={[styles.header, { paddingTop: topPad, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={24} color="#111B21" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Disappearing messages</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        <DisappearMessagesIllustration />

        <View style={styles.copyBlock}>
          <Text style={styles.heading}>Make messages in this chat disappear</Text>
          <Text style={styles.body}>
            For more privacy and storage, new messages will disappear from this chat for everyone after the selected duration except when kept. Anyone in the chat can change this setting.{" "}
            <Text style={styles.learnMore} onPress={learnMore}>
              Learn more
            </Text>
          </Text>
        </View>

        <Text style={styles.sectionLabel}>Message timer</Text>

        <View style={styles.optionsBlock}>
          {options.map((opt) => (
            <RadioOption
              key={opt.label}
              label={opt.label}
              selected={isSameDisappearTimer(selectedSeconds, opt.seconds)}
              onPress={() => void applyTimer(opt.seconds)}
            />
          ))}
        </View>

        <View style={[styles.footerDivider, { backgroundColor: colors.border }]} />

        <Text style={styles.footer}>
          Update your{" "}
          <Text style={styles.footerLink} onPress={() => router.push("/settings/privacy")}>
            default message timer
          </Text>{" "}
          in Settings
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: "#fff",
  },
  backBtn: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  headerTitle: {
    flex: 1,
    fontSize: 19,
    fontFamily: "Inter_600SemiBold",
    color: "#111B21",
    textAlign: "center",
    marginRight: 48,
  },
  copyBlock: { paddingHorizontal: 28, paddingTop: 8, paddingBottom: 20 },
  heading: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: "#111B21",
    marginBottom: 10,
    lineHeight: 24,
  },
  body: {
    fontSize: 14.5,
    fontFamily: "Inter_400Regular",
    color: "#667781",
    lineHeight: 21,
  },
  learnMore: { color: "#027EB5", fontFamily: "Inter_500Medium" },
  sectionLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#667781",
    paddingHorizontal: 28,
    marginBottom: 4,
  },
  optionsBlock: { paddingHorizontal: 20, paddingTop: 4 },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 8,
    gap: 18,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#8696A0",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterSelected: { borderColor: WA_GREEN },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: WA_GREEN,
  },
  optionLabel: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: "#111B21",
  },
  footerDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 28,
    marginTop: 20,
    marginBottom: 16,
  },
  footer: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#667781",
    textAlign: "center",
    paddingHorizontal: 32,
    lineHeight: 21,
  },
  footerLink: { color: WA_GREEN, fontFamily: "Inter_600SemiBold" },
});
