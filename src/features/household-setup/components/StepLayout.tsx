import React from "react";
import { StyleSheet, Text, useColorScheme, View, ViewStyle } from "react-native";

import { Colors } from "@/constants/theme";

type StepLayoutProps = {
  title: string;
  subtitle: string;
  stepIndex: number;
  totalSteps: number;
  children: React.ReactNode;
  footer?: React.ReactNode;
  style?: ViewStyle;
};

export function StepLayout({
  title,
  subtitle,
  stepIndex,
  totalSteps,
  children,
  footer,
  style,
}: StepLayoutProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.headerCard, { backgroundColor: theme.card, borderColor: theme.icon }]}>
        <Text style={[styles.stepCounter, { color: theme.tint }]}>Étape {stepIndex}/{totalSteps}</Text>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{subtitle}</Text>
      </View>

      {children}

      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  headerCard: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  stepCounter: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  footer: {
    marginTop: 4,
  },
});

