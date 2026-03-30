import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Text, View } from "react-native";

type CalendarSectionBlockProps = {
  styles: Record<string, any>;
  iconName: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  iconColor: string;
  title: string;
  titleColor: string;
  children: React.ReactNode;
};

export function CalendarSectionBlock({
  styles,
  iconName,
  iconColor,
  title,
  titleColor,
  children,
}: CalendarSectionBlockProps) {
  return (
    <View style={styles.sectionBlock}>
      <View style={styles.sectionTitleRow}>
        <MaterialCommunityIcons name={iconName} size={18} color={iconColor} />
        <Text style={[styles.sectionTitle, { color: titleColor }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}
