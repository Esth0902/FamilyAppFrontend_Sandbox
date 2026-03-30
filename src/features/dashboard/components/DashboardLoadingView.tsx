import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import type { DashboardTheme } from "@/src/features/dashboard/components/dashboard.types";

type DashboardLoadingViewProps = {
  theme: DashboardTheme;
};

export function DashboardLoadingView({ theme }: DashboardLoadingViewProps) {
  return (
    <View style={[styles.center, { backgroundColor: theme.background }]}>
      <ActivityIndicator size="large" color={theme.tint} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
