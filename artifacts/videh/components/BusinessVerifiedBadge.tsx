import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { resolvePublicAssetUrl } from "@/lib/publicAssetUrl";

/** High-contrast verified badge for business accounts (visible on purple header + white card). */
export function BusinessVerifiedBadge({ size = 18 }: { size?: number }) {
  const inner = Math.round(size * 0.58);
  return (
    <View style={[styles.verifiedBadge, { width: size, height: size, borderRadius: size / 2 }]}>
      <Ionicons name="checkmark" size={inner} color="#FFFFFF" />
    </View>
  );
}

type LogoProps = {
  uri?: string | null;
  displayName: string;
  size?: number;
};

/** Business logo with CDN URL resolution and fallback initials on load failure. */
export function BusinessLogoAvatar({ uri, displayName, size = 88 }: LogoProps) {
  const [failed, setFailed] = useState(false);
  const resolved = resolvePublicAssetUrl(uri ?? undefined) ?? (uri?.trim() || undefined);
  const initials = displayName.split(/\s+/).map((p) => p[0]).join("").toUpperCase().slice(0, 2) || "B";
  const radius = size / 2;

  if (!resolved || failed) {
    return (
      <View style={[styles.logoFallback, { width: size, height: size, borderRadius: radius }]}>
        <Text style={[styles.logoFallbackTxt, { fontSize: size * 0.32 }]}>{initials}</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: resolved }}
      style={{ width: size, height: size, borderRadius: radius }}
      contentFit="cover"
      onError={() => setFailed(true)}
    />
  );
}

const styles = StyleSheet.create({
  verifiedBadge: {
    backgroundColor: "#00A884",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  logoFallback: {
    backgroundColor: "#5B4FE822",
    alignItems: "center",
    justifyContent: "center",
  },
  logoFallbackTxt: {
    fontFamily: "Inter_700Bold",
    color: "#5B4FE8",
  },
});
