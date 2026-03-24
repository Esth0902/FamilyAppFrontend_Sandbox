import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

type HouseholdSetupLoadingViewProps = {
  theme: {
    tint: string;
  };
};

export function HouseholdSetupLoadingView({
  theme,
}: HouseholdSetupLoadingViewProps) {
  return (
    <View style={styles.centerContainer}>
      <ActivityIndicator size="large" color={theme.tint} />
    </View>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});