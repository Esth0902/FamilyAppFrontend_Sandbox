import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleProp, StyleSheet, Text, useColorScheme, ViewStyle } from "react-native";

import { Colors } from "@/constants/theme";
import { AppButton, AppButtonVariant } from "@/src/components/ui/AppButton";
import { AppCard } from "@/src/components/ui/AppCard";

type EmptyStateProps = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  message: string;
  actionLabel?: string;
  onActionPress?: () => void;
  actionVariant?: AppButtonVariant;
  style?: StyleProp<ViewStyle>;
};

export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onActionPress,
  actionVariant = "primary",
  style,
}: EmptyStateProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];

  return (
    <AppCard pressable={false} style={style} contentStyle={styles.content}>
      <MaterialCommunityIcons
        name={icon}
        size={34}
        color={theme.tint}
        style={[styles.icon, { backgroundColor: `${theme.tint}18` }]}
      />
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.message, { color: theme.textSecondary }]}>{message}</Text>

      {actionLabel && onActionPress ? (
        <AppButton
          title={actionLabel}
          variant={actionVariant}
          onPress={onActionPress}
          style={styles.actionBtn}
        />
      ) : null}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  content: {
    flexDirection: "column",
    alignItems: "flex-start",
    paddingVertical: 16,
  },
  icon: {
    padding: 10,
    borderRadius: 14,
    marginBottom: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  message: {
    fontSize: 13,
    lineHeight: 19,
  },
  actionBtn: {
    marginTop: 14,
    minHeight: 42,
    paddingHorizontal: 12,
  },
});

