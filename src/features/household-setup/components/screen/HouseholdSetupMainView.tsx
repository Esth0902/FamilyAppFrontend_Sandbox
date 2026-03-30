import React from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { AppButton } from "@/src/components/ui/AppButton";

import { HouseholdNameSection } from "../sections/HouseholdNameSection";
import { ConnectedHouseholdSection } from "../sections/ConnectedHouseholdSection";
import { HouseholdMembersSection } from "../sections/HouseholdMemberSection";
import { HouseholdModulesSection } from "../sections/HouseholdModulesSection";
import { HouseholdSetupHeader } from "./HouseholdSetupHeader";

export function HouseholdSetupMainView(state: any) {
  const { theme, ui, wizard, actions } = state;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <HouseholdSetupHeader
        title={ui.headerTitle}
        subtitle={ui.isEditMode ? "Modifie les réglages de ton foyer." : "Configure ton foyer pour commencer."}
        backgroundColor={theme.background}
        onBackPress={actions.goBack}
      />

      <ScrollView
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.formContainer}>
          <HouseholdNameSection {...state} />
          <HouseholdMembersSection {...state} />
          <ConnectedHouseholdSection {...state} />
          <HouseholdModulesSection {...state} />

          {(!wizard.shouldUseSetupWizard || wizard.isChildrenStepActive) && (
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
                <Text style={styles.submitButtonText}>
                  {ui.isEditMode ? "Enregistrer la configuration" : "Créer le foyer"}
                </Text>
              )}
            </AppButton>
          )}

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
