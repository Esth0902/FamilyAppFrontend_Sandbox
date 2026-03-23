import React from "react";
import {
  StyleProp,
  StyleSheet,
  TouchableOpacity,
  TouchableOpacityProps,
  useColorScheme,
  View,
  ViewStyle,
} from "react-native";
import { Colors } from "@/constants/theme";

type AppCardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  accentColor?: string;
  pressable?: boolean;
} & Omit<TouchableOpacityProps, "style">;

export function AppCard({
  children,
  style,
  contentStyle,
  accentColor,
  pressable = true,
  activeOpacity = 0.85,
  ...props
}: AppCardProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];

  if (!pressable) {
    return (
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.icon }, style]}>
        {accentColor ? <View style={[styles.accent, { backgroundColor: accentColor }]} /> : null}
        <View style={[styles.content, contentStyle]}>{children}</View>
      </View>
    );
  }

  return (
    <TouchableOpacity
      {...props}
      activeOpacity={activeOpacity}
      style={[styles.card, { backgroundColor: theme.card, borderColor: theme.icon }, style]}
    >
      {accentColor ? <View style={[styles.accent, { backgroundColor: accentColor }]} /> : null}
      <View style={[styles.content, contentStyle]}>{children}</View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 15,
    overflow: "hidden",
    flexDirection: "row",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  accent: {
    width: 6,
    height: "100%",
  },
  content: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 10,
  },
});
