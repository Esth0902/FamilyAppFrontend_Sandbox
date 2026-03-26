import React from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { AppButton } from "@/src/components/ui/AppButton";

import { HouseholdNameSection } from "../sections/HouseholdNameSection";
import { ConnectedHouseholdSection } from "../sections/ConnectedHouseholdSection";
import { HouseholdMembersSection } from "../sections/HouseholdMemberSection";
import { HouseholdModulesSection } from "../sections/HouseholdModulesSection";
import { ScreenHeader } from "@/src/components/ui/ScreenHeader";

export function HouseholdSetupMainView(state: any) {
  const { theme, ui, wizard, actions } = state;

return (
  <KeyboardAvoidingView
    behavior={Platform.OS === "ios" ? "padding" : "height"}
    style={{ flex: 1, backgroundColor: theme.background }}
  >
    <ScrollView
      keyboardShouldPersistTaps="handled"
      stickyHeaderIndices={[0]} // Le premier enfant (la View du Header) reste fixé
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* SECTION 0 : HEADER FIXÉ */}
      <View style={{ backgroundColor: theme.background, paddingHorizontal: 12 }}>
        <ScreenHeader
          title={ui.headerTitle}
          subtitle={ui.isEditMode ? "Modifie les réglages de ton foyer." : "Configure ton foyer pour commencer."}
          withBackButton
          showBorder
          safeTop
          containerStyle={{ paddingHorizontal: 0, marginBottom: 0 }}
          contentStyle={{ minHeight: 0 }}
        />
      </View>

      {/* SECTION 1 : CONTENU SCROLLABLE */}
      <View style={styles.formContainer}>
        {/* === LES 4 SECTIONS DU WIZARD === */}
        <HouseholdNameSection {...state} />
        <HouseholdMembersSection {...state} />
        <ConnectedHouseholdSection {...state} />
        <HouseholdModulesSection {...state} />

        {/* Bouton de soumission final */}
        {(!wizard.shouldUseSetupWizard || wizard.isChildrenStepActive) && (
          <AppButton
            style={[
              styles.submitButton, 
              { backgroundColor: theme.tint, opacity: ui.loading ? 0.7 : 1 }
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

        {/* Espacement de fin pour que le dernier bouton ne colle pas au bord */}
        <View style={{ height: 30 }} />
      </View>
    </ScrollView>
  </KeyboardAvoidingView>
);
}

const styles = StyleSheet.create({
  // Style du ScrollView
  scrollContent: {
    flexGrow: 1,
  },
  // Conteneur du formulaire sous le header
  formContainer: {
    paddingHorizontal: 12,
    paddingTop: 15, // Espace entre le header fixé et le premier champ
  },
  submitButton: { 
    height: 56, 
    borderRadius: 16, 
    alignItems: "center", 
    justifyContent: "center", 
    marginTop: 20 
  },
  submitButtonText: { 
    color: "white", 
    fontSize: 18, 
    fontWeight: "bold" 
  },
});
