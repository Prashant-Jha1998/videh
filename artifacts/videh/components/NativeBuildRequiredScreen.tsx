import React from "react";
import { Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { nativeBuildRequiredMessage } from "@/lib/appRuntime";

const STEPS = [
  {
    title: "Windows / Mac — local dev build (recommended)",
    body:
      "Connect your phone with USB debugging on, then from the project folder run:\n\n" +
      "cd Videh-Messenger/artifacts/videh\npnpm android\n\n" +
      "This installs Videh with calls on your device. Metro opens automatically.",
  },
  {
    title: "Cloud dev APK (team testing)",
    body:
      "cd Videh-Messenger/artifacts/videh\npnpm build:dev-apk\n\n" +
      "Install the APK from the EAS link, then run:\npnpm start\n" +
      "and open the Videh dev app (not Expo Go).",
  },
  {
    title: "Preview / Play Store build",
    body: "pnpm build:preview-apk  or  pnpm build:production",
  },
];

export function NativeBuildRequiredScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.badge}>Expo Go not supported</Text>
        <Text style={styles.title}>Install the Videh app</Text>
        <Text style={styles.sub}>{nativeBuildRequiredMessage()}</Text>

        {STEPS.map((step, i) => (
          <View key={step.title} style={styles.card}>
            <Text style={styles.stepNum}>{i + 1}</Text>
            <Text style={styles.cardTitle}>{step.title}</Text>
            <Text style={styles.cardBody}>{step.body}</Text>
          </View>
        ))}

        {Platform.OS === "android" ? (
          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() => Linking.openURL("https://docs.expo.dev/develop/development-builds/introduction/")}
            activeOpacity={0.85}
          >
            <Text style={styles.linkBtnText}>Expo development builds — docs</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0B141A" },
  scroll: { paddingHorizontal: 22, paddingBottom: 32 },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(234,88,12,0.2)",
    color: "#FB923C",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 12,
  },
  title: { color: "#fff", fontSize: 26, fontFamily: "Inter_700Bold", marginBottom: 10 },
  sub: { color: "rgba(255,255,255,0.65)", fontSize: 15, lineHeight: 22, fontFamily: "Inter_400Regular", marginBottom: 22 },
  card: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  stepNum: { color: "#00A884", fontSize: 13, fontFamily: "Inter_700Bold", marginBottom: 6 },
  cardTitle: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  cardBody: { color: "rgba(255,255,255,0.72)", fontSize: 13, lineHeight: 20, fontFamily: "Inter_400Regular" },
  linkBtn: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: "#00A884",
  },
  linkBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
