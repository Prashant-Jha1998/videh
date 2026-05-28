import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { ErrorFallbackProps } from "@/components/ErrorFallback";
import { useColors } from "@/hooks/useColors";

type Props = ErrorFallbackProps & {
  title?: string;
  message?: string;
};

/** Lightweight fallback for a single screen — keeps the rest of the app alive. */
export function ScreenErrorFallback({
  error,
  resetError,
  title = "Something went wrong",
  message = "This screen ran into a problem. You can go back and try again.",
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const goBack = () => {
    resetError();
    if (router.canGoBack()) router.back();
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.message, { color: colors.mutedForeground }]}>{message}</Text>
      {__DEV__ ? (
        <Text style={[styles.devHint, { color: colors.mutedForeground }]} numberOfLines={3}>
          {error.message}
        </Text>
      ) : null}
      <Pressable
        onPress={goBack}
        style={({ pressed }) => [styles.btn, { backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1 }]}
      >
        <Text style={[styles.btnText, { color: colors.primaryForeground }]}>Go back</Text>
      </Pressable>
      <Pressable onPress={resetError} style={styles.linkBtn}>
        <Text style={[styles.linkText, { color: colors.primary }]}>Try again on this screen</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 28, justifyContent: "center", alignItems: "center", gap: 12 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  message: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  devHint: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 4 },
  btn: { marginTop: 12, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 10, minWidth: 180 },
  btnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  linkBtn: { paddingVertical: 10 },
  linkText: { fontSize: 14, fontFamily: "Inter_500Medium" },
});
