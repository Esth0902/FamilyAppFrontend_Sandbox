import React from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";

import { AppButton } from "@/src/components/ui/AppButton";
import { HouseholdModulesSection } from "../sections/HouseholdModulesSection";
import { HouseholdSetupHeader } from "./HouseholdSetupHeader";

export function HouseholdSetupModuleSettingsView(state: any) {
  const { theme, ui, actions } = state;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        stickyHeaderIndices={[0]}
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <HouseholdSetupHeader
          title={ui.headerTitle}
          subtitle="Modifie les réglages de ton foyer."
          backgroundColor={theme.background}
          onBackPress={actions.goBack}
        />

        <View style={styles.formContainer}>
          <HouseholdModulesSection {...state} />

          <AppButton
            style={[
              styles.submitButton,
              { backgroundColor: theme.tint, opacity: ui.loading ? 0.7 : 1 },
            ]}
            onPress={actions.handleSave}
            disabled={ui.loading}
          >
            {ui.loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.submitButtonText}>Enregistrer la configuration</Text>
            )}
          </AppButton>

          <View style={{ height: 30 }} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
  },
  formContainer: {
    paddingHorizontal: 12,
    paddingTop: 15,
  },
  submitButton: {
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  submitButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
});
