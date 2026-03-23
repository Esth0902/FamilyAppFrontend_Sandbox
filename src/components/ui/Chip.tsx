import React from "react";
import {
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  useColorScheme,
  View,
  ViewStyle,
} from "react-native";
import { Colors } from "@/constants/theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";

type ChipTone = "neutral" | "info" | "success" | "warning";

type ChipProps = {
  label: string;
  tone?: ChipTone;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  selected?: boolean;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress?: () => void;
};

const resolveTone = (tone: ChipTone, theme: typeof Colors.light) => {
  if (tone === "info") {
    return { backgroundColor: `${theme.tint}18`, color: theme.tint };
  }
  if (tone === "success") {
    return { backgroundColor: `${theme.accentCool}24`, color: theme.accentCool };
  }
  if (tone === "warning") {
    return { backgroundColor: `${theme.accentWarm}24`, color: theme.accentWarm };
  }
  return { backgroundColor: `${theme.icon}20`, color: theme.textSecondary };
};

export function Chip({
  label,
  tone = "neutral",
  style,
  textStyle,
  selected = false,
  icon,
  onPress,
}: ChipProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const toneStyles = resolveTone(tone, theme);
  const containerStyle = [
    styles.chip,
    { backgroundColor: toneStyles.backgroundColor },
    selected ? { borderColor: toneStyles.color, borderWidth: 1 } : null,
    style,
  ];
  const labelStyle = [styles.label, { color: toneStyles.color }, textStyle];

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={containerStyle}>
        {icon ? <MaterialCommunityIcons name={icon} size={14} color={toneStyles.color} /> : null}
        <Text style={labelStyle}>{label}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={containerStyle}>
      {icon ? <MaterialCommunityIcons name={icon} size={14} color={toneStyles.color} /> : null}
      <Text style={labelStyle}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
  },
});
