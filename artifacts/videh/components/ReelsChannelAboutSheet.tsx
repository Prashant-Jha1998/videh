import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DismissibleModal } from "@/components/DismissibleModal";
import { useColors } from "@/hooks/useColors";
import {
  formatJoinedDate,
  linkDisplayHost,
  linkIconName,
} from "@/lib/channelLinkUtils";
import {
  formatViewCount,
  type ReelsChannel,
  type ReelsChannelLink,
} from "@/lib/reelsApi";

type Props = {
  visible: boolean;
  onClose: () => void;
  channel: ReelsChannel;
  links: ReelsChannelLink[];
  videoCount: number;
};

export function ReelsChannelAboutSheet({ visible, onClose, channel, links, videoCount }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const displayLabel = channel.displayName?.trim() || `@${channel.handle}`;

  return (
    <DismissibleModal visible={visible} onClose={onClose} animationType="slide" backdropOpacity={0.5}>
      <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.handleBar}>
          <View style={[styles.pill, { backgroundColor: colors.muted }]} />
        </View>
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
            {displayLabel}
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={24} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {channel.bio ? (
            <View style={styles.block}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Description</Text>
              <Text style={[styles.body, { color: colors.foreground }]}>{channel.bio}</Text>
            </View>
          ) : null}

          {links.length > 0 ? (
            <View style={styles.block}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Links</Text>
              {links.map((link) => (
                <TouchableOpacity
                  key={link.id}
                  style={styles.linkRow}
                  onPress={() => void Linking.openURL(link.url)}
                >
                  <View style={[styles.linkIcon, { backgroundColor: colors.muted }]}>
                    <Ionicons name={linkIconName(link.url)} size={20} color={colors.foreground} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.linkTitle, { color: colors.foreground }]}>{link.title}</Text>
                    <Text style={[styles.linkUrl, { color: colors.primary }]} numberOfLines={1}>
                      {linkDisplayHost(link.url)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          <View style={styles.block}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>More info</Text>
            <InfoRow icon="globe-outline" label={`@${channel.handle}`} colors={colors} />
            {channel.createdAt ? (
              <InfoRow
                icon="information-circle-outline"
                label={`Joined ${formatJoinedDate(channel.createdAt)}`}
                colors={colors}
              />
            ) : null}
            <InfoRow
              icon="trending-up-outline"
              label={`${formatViewCount(channel.totalViews)} views`}
              colors={colors}
            />
            <InfoRow
              icon="videocam-outline"
              label={`${videoCount} video${videoCount === 1 ? "" : "s"}`}
              colors={colors}
            />
            <InfoRow
              icon="people-outline"
              label={`${formatViewCount(channel.subscriberCount)} subscribers`}
              colors={colors}
            />
          </View>
        </ScrollView>
      </View>
    </DismissibleModal>
  );
}

function InfoRow({
  icon,
  label,
  colors,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={20} color={colors.mutedForeground} />
      <Text style={[styles.infoText, { color: colors.foreground }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "88%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  handleBar: { alignItems: "center", paddingTop: 10, paddingBottom: 4 },
  pill: { width: 36, height: 4, borderRadius: 2 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", flex: 1, marginRight: 12 },
  scroll: { paddingHorizontal: 20, paddingBottom: 24 },
  block: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 10 },
  body: { fontSize: 14, lineHeight: 21 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  linkIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  linkTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  linkUrl: { fontSize: 13, marginTop: 2 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  infoText: { fontSize: 14 },
});
