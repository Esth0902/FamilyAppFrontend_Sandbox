import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";

export function HouseholdSetupLoadingView({ theme }: { theme: any }) {
  return (
    <View style={styles.centerContainer}>
      <ActivityIndicator size="large" color={theme.tint} />
    </View>
  );
}

const styles = StyleSheet.create({
  centerContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
});