import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

export default function HelpScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const rows = [
    {
      icon: "help-circle-outline", iconBg: "#2196F3", label: "Help Centre",
      hint: "Find answers to common questions",
      onPress: () => Alert.alert("Help Centre", "Visit help.videh.app for full documentation and FAQs."),
    },
    {
      icon: "chatbubble-outline", iconBg: "#4CAF50", label: "Contact us",
      hint: "Get in touch with our support team",
      onPress: () => Alert.alert("Contact Us", "Email us at support@videh.app\nWe respond within 24 hours."),
    },
    {
      icon: "star-outline", iconBg: "#FF9800", label: "Rate us",
      hint: "If you enjoy Videh, please leave a rating",
      onPress: () => Alert.alert("Rate Videh", "Thank you for your support! Rating will open the app store."),
    },
    {
      icon: "people-outline", iconBg: "#9C27B0", label: "Invite a friend",
      hint: "Share Videh with your contacts",
      onPress: () => Alert.alert("Invite", "Share Videh with friends!\n\nDownload Videh for instant messaging."),
    },
    {
      icon: "document-text-outline", iconBg: "#00BCD4", label: "Terms of Service",
      hint: "Read our terms and conditions",
      onPress: () => router.push("/legal/terms"),
    },
    {
      icon: "shield-checkmark-outline", iconBg: "#00A884", label: "Privacy Policy",
      hint: "How we handle your data",
      onPress: () => router.push("/legal/privacy"),
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help and Feedback</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 60 }}>
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          {rows.map((row, i) => (
            <TouchableOpacity
              key={row.label}
              style={[styles.row, i < rows.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}
              onPress={row.onPress}
              activeOpacity={0.7}
            >
              <View style={[styles.iconWrap, { backgroundColor: row.iconBg }]}>
                <Ionicons name={row.icon as any} size={18} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: colors.foreground }]}>{row.label}</Text>
                <Text style={[styles.rowHint, { color: colors.mutedForeground }]}>{row.hint}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.versionBlock}>
          <Text style={[styles.versionText, { color: colors.mutedForeground }]}>Videh v1.0.0</Text>
          <Text style={[styles.versionSub, { color: colors.mutedForeground }]}>© 2026 Videh Technologies</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8, paddingBottom: 12 },
  backBtn: { padding: 8 },
  headerTitle: { flex: 1, color: "#fff", fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  section: { marginBottom: 10, paddingHorizontal: 16, paddingVertical: 4 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 14, gap: 14 },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  rowHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  versionBlock: { alignItems: "center", paddingVertical: 24, gap: 4 },
  versionText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  versionSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
