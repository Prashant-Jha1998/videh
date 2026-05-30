import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";

export type FilterChip = { id: string; label: string; count?: number };

type Props = {
  chips: FilterChip[];
  activeId: string;
  onChange: (id: string) => void;
};

export function WebFilterChips({ chips, activeId, onChange }: Props) {
  const colors = useColors();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {chips.map((chip) => {
        const active = chip.id === activeId;
        return (
          <TouchableOpacity
            key={chip.id}
            onPress={() => onChange(chip.id)}
            style={[
              styles.chip,
              {
                backgroundColor: active
                  ? colors.isDark
                    ? "#005C4B"
                    : colors.primary + "22"
                  : colors.isDark
                    ? "#202C33"
                    : colors.card,
                borderColor: active ? colors.primary : "transparent",
              },
            ]}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.chipTxt,
                { color: active ? (colors.isDark ? "#E9EDEF" : colors.primary) : colors.mutedForeground },
              ]}
            >
              {chip.label}
              {chip.count != null && chip.count > 0 ? ` ${chip.count}` : ""}
            </Text>
          </TouchableOpacity>
        );
      })}
      <View style={{ width: 8 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 10, paddingBottom: 8, gap: 8, flexDirection: "row", alignItems: "center" },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipTxt: { fontSize: 13, fontFamily: "Inter_500Medium" },
});
