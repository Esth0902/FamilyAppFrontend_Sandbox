import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { AppTextInput } from "@/src/components/ui/AppTextInput";
import { AppButton } from "@/src/components/ui/AppButton";
import { StepName } from "@/src/features/household-setup/components/StepName";

export function HouseholdNameSection(state: any) {
  const { theme, ui, wizard, form } = state;

  if (ui.isModuleScope || !wizard.isNameStepActive) return null;

  const renderContent = () => (
    <View style={styles.section}>
      <View style={[styles.collapsibleSectionCard, { backgroundColor: theme.card, borderColor: theme.icon }]}>
        <View style={styles.collapsibleSectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Nom du foyer</Text>
        </View>
        <View style={styles.collapsibleSectionBody}>
          <AppTextInput
            style={[styles.input, styles.inputNoMargin]}
            value={form.houseName}
            onChangeText={form.setHouseName}
            placeholder="Ex: La Tribu"
            placeholderTextColor={theme.textSecondary}
          />
        </View>
      </View>
    </View>
  );

  if (wizard.shouldUseSetupWizard) {
    return (
      <StepName
        stepIndex={wizard.nameStepIndex}
        totalSteps={wizard.setupFlow.totalSteps}
        footer={(
          <View style={styles.wizardActionsRow}>
            <AppButton style={[styles.wizardPrimaryBtn, { backgroundColor: theme.tint }]} onPress={wizard.goToNextSetupStep}>
              <Text style={styles.wizardPrimaryBtnText}>Continuer</Text>
            </AppButton>
          </View>
        )}
      >
        {renderContent()}
      </StepName>
    );
  }

  return renderContent();
}

const styles = StyleSheet.create({
  section: { marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  collapsibleSectionCard: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  collapsibleSectionHeader: { paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  collapsibleSectionBody: { paddingHorizontal: 12, paddingBottom: 12, paddingTop: 10 },
  input: { height: 50, borderRadius: 12, paddingHorizontal: 16, fontSize: 16, marginBottom: 16 },
  inputNoMargin: { marginBottom: 0 },
  wizardActionsRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  wizardPrimaryBtn: { flex: 1, minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  wizardPrimaryBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
});