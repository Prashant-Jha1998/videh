import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const SECTIONS = [
  {
    title: "1. Acceptance of Terms",
    body: `By downloading, installing, or using Videh ("the App"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, please do not use the App.\n\nThese Terms apply to all users of the App. We reserve the right to update these Terms at any time. Continued use of the App after any changes constitutes your acceptance of the new Terms.`,
  },
  {
    title: "2. Eligibility",
    body: `You must be at least 13 years of age to use Videh. By using the App, you represent and warrant that you meet this minimum age requirement. Users between the ages of 13 and 18 may use the App only with the consent of a parent or legal guardian.`,
  },
  {
    title: "3. Account Registration & OTP Verification",
    body: `To use Videh, you must register using a valid Indian mobile phone number. We verify your number via a One-Time Password (OTP) sent through SMS. You are responsible for maintaining the confidentiality of your account and for all activities that occur under your account.\n\nYou agree to:\n• Provide accurate and complete information\n• Keep your phone number up to date\n• Notify us immediately of any unauthorized use of your account`,
  },
  {
    title: "4. User Conduct",
    body: `You agree not to use Videh to:\n• Send spam, unsolicited messages, or promotional content\n• Harass, threaten, or abuse other users\n• Share illegal content including child exploitation material\n• Impersonate any person or entity\n• Distribute malware, viruses, or harmful code\n• Violate any applicable laws or regulations\n• Infringe any intellectual property rights\n\nViolation of these rules may result in immediate account termination.`,
  },
  {
    title: "5. Messaging & Content",
    body: `Videh uses end-to-end encryption for messages between users. We do not have access to the content of your private messages.\n\nYou retain ownership of all content you share through Videh. By posting content, you grant Videh a non-exclusive, royalty-free license to store and transmit that content solely for the purpose of providing the service.\n\nYou are solely responsible for all content you send or share through the App.`,
  },
  {
    title: "6. Privacy",
    body: `Your privacy is important to us. Our Privacy Policy explains how we collect, use, and protect your personal information. By using Videh, you agree to our Privacy Policy, which is incorporated into these Terms by reference.\n\nWe collect minimal personal information — primarily your phone number and profile data — to provide and improve the service.`,
  },
  {
    title: "7. Intellectual Property",
    body: `Videh and all associated logos, designs, trademarks, and software are the exclusive property of Videh Technologies. You may not copy, modify, distribute, or create derivative works based on our intellectual property without express written permission.\n\nThe Videh name, logo, and brand identity are protected trademarks.`,
  },
  {
    title: "8. Disclaimers & Limitation of Liability",
    body: `Videh is provided "as is" without warranties of any kind, either express or implied. We do not guarantee that the App will be uninterrupted, error-free, or free of viruses.\n\nTo the maximum extent permitted by law, Videh shall not be liable for any indirect, incidental, special, or consequential damages arising out of or in connection with your use of the App.\n\nVideh's total liability to you for any cause shall not exceed the amount paid by you, if any, for accessing the App.`,
  },
  {
    title: "9. Termination",
    body: `We reserve the right to suspend or terminate your access to Videh at any time, with or without cause, and with or without notice. Upon termination, your right to use the App will immediately cease.\n\nYou may terminate your account at any time by deleting the App and requesting account deletion through the Settings screen.`,
  },
  {
    title: "10. Governing Law",
    body: `These Terms shall be governed by and construed in accordance with the laws of India. Any disputes arising under these Terms shall be subject to the exclusive jurisdiction of the courts located in New Delhi, India.\n\nIf any provision of these Terms is found to be unenforceable, the remaining provisions will remain in full force and effect.`,
  },
  {
    title: "11. Contact Us",
    body: `If you have any questions, concerns, or complaints regarding these Terms, please contact us at:\n\nVideh Technologies\nEmail: legal@videh.app\nAddress: New Delhi, India\n\nLast updated: April 2026`,
  },
];

export default function TermsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: insets.top + (Platform.OS === "web" ? 67 : 10) }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.badge, { backgroundColor: colors.primary + "20" }]}>
          <Ionicons name="document-text-outline" size={24} color={colors.primary} />
          <Text style={[styles.badgeText, { color: colors.primary }]}>Last updated: April 2026</Text>
        </View>

        <Text style={[styles.intro, { color: colors.foreground }]}>
          Welcome to Videh. Please read these Terms of Service carefully before using our messaging application. These terms govern your use of Videh and form a legally binding agreement between you and Videh Technologies.
        </Text>

        {SECTIONS.map((s) => (
          <View key={s.title} style={[styles.section, { borderLeftColor: colors.primary }]}>
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
