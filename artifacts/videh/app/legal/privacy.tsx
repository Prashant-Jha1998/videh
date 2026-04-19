import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const SECTIONS = [
  {
    title: "1. Information We Collect",
    body: `We collect the following types of information when you use Videh:\n\n**Account Information**\n• Phone number (required for registration and OTP verification)\n• Profile name and about text (set by you)\n• Profile photo (uploaded by you, stored securely)\n\n**Usage Information**\n• Last seen timestamp and online status\n• Message delivery and read receipts\n• Call logs (duration, timestamp, call type)\n\n**Device Information**\n• Device type and operating system version (for compatibility)\n• App version\n• Crash reports and diagnostics (anonymised)\n\nWe do NOT collect your location data, contacts list, or browsing history.`,
  },
  {
    title: "2. How We Use Your Information",
    body: `We use your information exclusively to:\n• Verify your identity and secure your account\n• Provide and maintain the messaging service\n• Display your profile to contacts who have your phone number\n• Send you important service-related notifications\n• Improve app performance and fix bugs\n• Comply with legal obligations\n\nWe do NOT use your personal data for targeted advertising or sell your information to third parties.`,
  },
  {
    title: "3. Message Privacy & End-to-End Encryption",
    body: `Videh uses end-to-end encryption (E2EE) for private messages between users. This means:\n• Only you and the person you communicate with can read your messages\n• Videh cannot read, access, or decrypt your private messages\n• Even if our servers were compromised, your message content would remain private\n\nGroup messages are also encrypted. Status updates are stored on our servers temporarily but are encrypted in transit.\n\nNote: If you back up your chats, the backup may not be end-to-end encrypted depending on your storage provider.`,
  },
  {
    title: "4. Data Sharing",
    body: `We do not sell, trade, or share your personal data with third parties except in the following limited circumstances:\n\n• **Service Providers**: We use SMS gateway (Fast2SMS) solely to deliver OTP verification codes. They receive only your phone number for this purpose.\n• **Legal Requirements**: We may disclose information if required by law, court order, or government authority.\n• **Business Transfer**: In the event of a merger or acquisition, user data may be transferred with appropriate notice.\n• **Safety**: We may share information to prevent fraud, abuse, or threats to safety.\n\nAll third-party service providers are contractually bound to protect your data.`,
  },
  {
    title: "5. Data Retention",
    body: `We retain your personal data for as long as your account is active or as needed to provide services. Specifically:\n\n• **Messages**: Stored on our servers until delivered, then deleted from transit storage. Conversation history is retained until you delete it.\n• **Profile data**: Retained until you delete your account\n• **Call logs**: Retained for 90 days, then automatically deleted\n• **Status updates**: Automatically deleted after 24 hours\n\nYou can request deletion of your account and associated data at any time through Settings → Account → Delete Account.`,
  },
  {
    title: "6. Your Rights",
    body: `Under applicable data protection laws, you have the following rights:\n\n• **Access**: Request a copy of the data we hold about you\n• **Correction**: Update or correct inaccurate personal information\n• **Deletion**: Request deletion of your personal data\n• **Portability**: Request your data in a portable format\n• **Objection**: Object to certain processing of your data\n\nTo exercise any of these rights, contact us at privacy@videh.app or through the in-app Settings → Help → Contact Us.`,
  },
  {
    title: "7. Data Security",
    body: `We implement industry-standard security measures to protect your data:\n\n• All data is encrypted in transit using TLS 1.3\n• Database access is restricted and audited\n• We conduct regular security audits\n• Passwords and sensitive credentials are never stored in plain text\n• Two-factor authentication available for account security\n\nDespite our best efforts, no security system is impenetrable. We will notify you promptly in the event of any security breach that affects your personal data.`,
  },
  {
    title: "8. Children's Privacy",
    body: `Videh is not directed at children under the age of 13. We do not knowingly collect personal information from children under 13. If we become aware that a child under 13 has provided us with personal information, we will promptly delete such data.\n\nIf you are a parent or guardian and believe your child has used Videh in violation of our Terms, please contact us immediately at privacy@videh.app.`,
  },
  {
    title: "9. Cookies & Tracking",
    body: `The Videh mobile application does not use cookies. We may use anonymised analytics to understand app usage patterns (e.g., which screens are visited most often). This data is aggregated and cannot identify individual users.\n\nWe do NOT use cross-site tracking, advertising pixels, or third-party analytics that share data with advertisers.`,
  },
  {
    title: "10. International Data Transfers",
    body: `Videh's servers are located in India. If you are accessing the App from outside India, your data may be transferred to and processed in India. By using the App, you consent to this transfer.\n\nWe ensure that any international data transfers comply with applicable data protection regulations.`,
  },
  {
    title: "11. Changes to This Policy",
    body: `We may update this Privacy Policy from time to time. When we make significant changes, we will notify you through the App or via SMS. The updated policy will be effective from the date it is posted.\n\nWe encourage you to review this Privacy Policy periodically to stay informed about how we protect your information.`,
  },
  {
    title: "12. Contact Us",
    body: `If you have questions, concerns, or requests regarding this Privacy Policy or how we handle your data, please contact our Data Protection Officer:\n\nVideh Technologies\nPrivacy Team\nEmail: privacy@videh.app\nAddress: New Delhi, India\nPhone: Available through in-app support\n\nLast updated: April 2026`,
  },
];

export default function PrivacyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: insets.top + (Platform.OS === "web" ? 67 : 10) }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.badge, { backgroundColor: "#00A884" + "20" }]}>
          <Ionicons name="shield-checkmark-outline" size={24} color="#00A884" />
          <Text style={[styles.badgeText, { color: "#00A884" }]}>Your privacy is our priority</Text>
        </View>

        <Text style={[styles.intro, { color: colors.foreground }]}>
          At Videh, we take your privacy seriously. This Privacy Policy explains what information we collect, how we use it, and what choices you have. We believe in transparency — we will never sell your data or use it for advertising.
        </Text>

        {SECTIONS.map((s) => (
          <View key={s.title} style={[styles.section, { borderLeftColor: "#00A884" }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{s.title}</Text>
            <Text style={[styles.sectionBody, { color: colors.mutedForeground }]}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8, paddingBottom: 12 },
  backBtn: { padding: 8 },
  headerTitle: { flex: 1, color: "#fff", fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  content: { padding: 20 },
  badge: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, marginBottom: 20 },
  badgeText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  intro: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22, marginBottom: 24 },
  section: { marginBottom: 24, paddingLeft: 14, borderLeftWidth: 3 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 10 },
  sectionBody: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 21 },
});
