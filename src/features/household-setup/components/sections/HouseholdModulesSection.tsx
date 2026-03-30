import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { AppButton } from "@/src/components/ui/AppButton";
import { StepModules } from "@/src/features/household-setup/components/StepModules";
import { BudgetModuleConfig } from "@/src/features/household-setup/components/modules/BudgetModuleConfig";
import { CalendarModuleConfig } from "@/src/features/household-setup/components/modules/CalendarModuleConfig";
import { MealsModuleConfig } from "@/src/features/household-setup/components/modules/MealsModuleConfig";
import { ModuleCardRow } from "@/src/features/household-setup/components/modules/ModuleCardRow";
import { TasksModuleConfig } from "@/src/features/household-setup/components/modules/TasksModuleConfig";

export function HouseholdModulesSection(state: any) {
  const { theme, ui, wizard, form, data, actions } = state;

  if (wizard.shouldUseSetupWizard && !wizard.isModulesStepActive) return null;

  const renderContent = () => (
    <View style={styles.section}>
      <View
        style={[
          styles.collapsibleSectionCard,
          { backgroundColor: theme.card, borderColor: theme.icon },
        ]}
      >
        <AppButton
          style={styles.collapsibleSectionHeader}
          onPress={() => form.setModulesExpanded((prev: boolean) => !prev)}
        >
          <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
            {ui.isMealsScope
              ? "Repas & courses"
              : ui.isTasksScope
                ? "Tâches ménagères"
                : ui.isBudgetScope
                  ? "Budget"
                  : ui.isCalendarScope
                    ? "Calendrier"
                    : "Configuration des modules"}
          </Text>
          <MaterialCommunityIcons
            name={form.modulesExpanded ? "chevron-down" : "chevron-right"}
            size={24}
            color={theme.textSecondary}
          />
        </AppButton>

        {form.modulesExpanded && (
          <View style={styles.collapsibleSectionBody}>
            {data.visibleModules.map((module: any) => {
              const canExpandModulePanel = ui.showScopedModuleDetails || module.id === "meals";

              return (
                <View
                  key={module.id}
                  style={[styles.moduleContainer, { backgroundColor: theme.background }]}
                >
                  <ModuleCardRow
                    module={module}
                    theme={theme}
                    isActive={!!form.activeModules[module.id]}
                    isExpanded={!!form.expandedModules[module.id]}
                    canExpandPanel={canExpandModulePanel}
                    onToggleModule={() => actions.toggleModule(module.id)}
                    onTogglePanel={() => actions.toggleModulePanel(module.id)}
                  />

                  {form.activeModules[module.id] &&
                    form.expandedModules[module.id] &&
                    module.id === "meals" && <MealsModuleConfig state={state} />}
                  {ui.showScopedModuleDetails &&
                    form.activeModules[module.id] &&
                    form.expandedModules[module.id] &&
                    module.id === "tasks" && <TasksModuleConfig state={state} />}
                  {ui.showScopedModuleDetails &&
                    form.activeModules[module.id] &&
                    form.expandedModules[module.id] &&
                    module.id === "calendar" && <CalendarModuleConfig state={state} />}
                  {ui.showScopedModuleDetails &&
                    form.activeModules[module.id] &&
                    form.expandedModules[module.id] &&
                    module.id === "budget" && <BudgetModuleConfig state={state} />}
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );

  return (
    <>
      {wizard.shouldUseSetupWizard && (
        <StepModules
          stepIndex={wizard.modulesStepIndex}
          totalSteps={wizard.setupFlow.totalSteps}
          footer={
            <View style={styles.wizardActionsRow}>
              <AppButton
                style={[
                  styles.wizardSecondaryBtn,
                  { borderColor: theme.icon, backgroundColor: theme.card },
                ]}
                onPress={wizard.goToPreviousSetupStep}
              >
                <Text style={[styles.wizardSecondaryBtnText, { color: theme.text }]}>Retour</Text>
              </AppButton>
              <AppButton
                style={[styles.wizardPrimaryBtn, { backgroundColor: theme.tint }]}
                onPress={wizard.goToNextSetupStep}
              >
                <Text style={styles.wizardPrimaryBtnText}>Continuer</Text>
              </AppButton>
            </View>
          }
        >
          <></>
        </StepModules>
      )}
      {renderContent()}
    </>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  collapsibleSectionCard: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  collapsibleSectionHeader: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  collapsibleSectionBody: { paddingHorizontal: 12, paddingBottom: 12, paddingTop: 10 },
  moduleContainer: { borderRadius: 12, marginBottom: 10, overflow: "hidden" },
  wizardActionsRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  wizardPrimaryBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  wizardPrimaryBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  wizardSecondaryBtn: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  wizardSecondaryBtnText: { fontSize: 15, fontWeight: "600" },
});
