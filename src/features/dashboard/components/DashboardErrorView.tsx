import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";

import { EmptyState } from "@/src/components/ui/EmptyState";
import { ScreenHeader } from "@/src/components/ui/ScreenHeader";
import type { DashboardTheme } from "@/src/features/dashboard/components/dashboard.types";

type DashboardErrorViewProps = {
  theme: DashboardTheme;
  message: string;
  onBackPress: () => void;
  onRetry: () => void;
};

export function DashboardErrorView({
  theme,
  message,
  onBackPress,
  onRetry,
}: DashboardErrorViewProps) {
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        title="Dashboard"
        subtitle="Clique pour voir le détail"
        withBackButton
        onBackPress={onBackPress}
        safeTop
        showBorder
      />
      <ScrollView contentContainerStyle={styles.content}>
        <EmptyState
          icon="cloud-alert-outline"
          title="Impossible de charger le dashboard"
          message={message}
          actionLabel="Réessayer"
          onActionPress={onRetry}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
});
