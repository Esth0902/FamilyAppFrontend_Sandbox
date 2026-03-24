import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { AppButton } from "@/src/components/ui/AppButton";
import { AppTextInput } from "@/src/components/ui/AppTextInput";
import { StepChildren } from "@/src/features/household-setup/components/StepChildren";
import { StepModules } from "@/src/features/household-setup/components/StepModules";
import { StepName } from "@/src/features/household-setup/components/StepName";
import {
  WHEEL_CONTAINER_HEIGHT,
  WHEEL_ITEM_HEIGHT,
  WHEEL_VERTICAL_PADDING,
} from "@/src/features/household-setup/utils/householdSetup.constants";
import { normalizeCustodyWeekStartDate } from "@/src/features/household-setup/utils/householdSetup.helpers";

type HouseholdSetupMainViewProps = {
  insets: { top: number };
  theme: any;
  constants: any;
  ui: any;
  wizard: any;
  form: any;
  data: any;
  asyncState: any;
  refs: any;
  helpers: any;
  actions: any;
};

export function HouseholdSetupMainView({
  insets,
  theme,
  constants,
  ui,
  wizard,
  form,
  data,
  asyncState,
  refs,
  helpers,
  actions,
}: HouseholdSetupMainViewProps) {
  const memberItemBackground = `${theme.tint}12`;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <View
        style={[
          styles.headerBar,
          {
            borderBottomColor: theme.icon,
            paddingTop: Math.max(insets.top, 12) + ui.householdEditHeaderOffset,
          },
        ]}
      >
        <AppButton
          onPress={actions.goBack}
          style={[styles.headerActionBtn, { borderColor: theme.icon }]}
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={theme.tint} />
        </AppButton>

        <Text style={[styles.headerTitle, { color: theme.text }]}>
          {ui.headerTitle}
        </Text>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* colle ici exactement le gros bloc du return principal,
            depuis:
            {!ui.isModuleScope && wizard.isNameStepActive && ( ... )}
            jusqu’au bouton submit final inclus
        */}

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  headerActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  headerTitle: { fontSize: 18, fontWeight: "700", flex: 1 },
  container: { padding: 20 },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
  input: {
    height: 50,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 16,
  },
  inputNoMargin: { marginBottom: 0 },
  inputWithBottomSpacing: { marginBottom: 12 },
  inputWithSmallBottomSpacing: { marginBottom: 10 },
  inputCentered: { textAlign: "center" },
  inputDisabled: { opacity: 0.65 },
  pickerFieldBtn: {
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pickerFieldText: {
    fontSize: 14,
    fontWeight: "600",
  },
  inlineWheelPanel: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  wheelRow: {
    flexDirection: "row",
    gap: 8,
  },
  wheelColumn: {
    flex: 1,
    height: WHEEL_CONTAINER_HEIGHT,
    position: "relative",
  },
  wheelContentContainer: {
    paddingVertical: WHEEL_VERTICAL_PADDING,
  },
  wheelItem: {
    height: WHEEL_ITEM_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  wheelItemText: {
    fontSize: 16,
    fontWeight: "500",
  },
  wheelItemTextSelected: {
    fontWeight: "700",
  },
  wheelSelectionOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: WHEEL_VERTICAL_PADDING,
    height: WHEEL_ITEM_HEIGHT,
    borderWidth: 1,
    borderRadius: 10,
  },

  activeUserCard: {
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  activeUserLabel: { fontSize: 11, fontWeight: "600" },
  activeUserName: { fontSize: 14, fontWeight: "700", marginTop: 2 },
  activeUserEmail: { fontSize: 11, marginTop: 1 },
  collapsibleSectionCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  collapsibleSectionHeader: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  collapsibleSectionBody: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 10,
  },
  memberActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  memberActionBtn: {
    minHeight: 30,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  memberActionBtnText: {
    fontSize: 11,
    fontWeight: "700",
  },

  memberEditor: { borderRadius: 12, padding: 10 },
  roleRow: { flexDirection: "row", gap: 6, marginBottom: 4 },
  roleChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  roleChipText: { fontSize: 12, fontWeight: "600" },

  tagsLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  categoryFilterWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  categoryFilterChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  selectedHint: {
    fontSize: 12,
  },
  selectedValues: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 2,
  },
  tagsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tagChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 120,
  },
  tagChipText: {
    fontSize: 13,
    fontWeight: "700",
  },
  tagChipType: {
    fontSize: 11,
    marginTop: 2,
  },
  createTagBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginTop: 12,
  },
  createTagTitle: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 4,
  },
  createTagTypeText: {
    fontSize: 12,
    marginBottom: 10,
  },
  createTagBtn: {
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  createTagBtnText: {
    color: "white",
    fontSize: 14,
    fontWeight: "700",
  },

  addButton: {
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  addButtonText: { fontSize: 14, fontWeight: "700" },
  sendCredentialBtn: {
    minWidth: 104,
    height: 38,
    borderRadius: 10,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  sendCredentialBtnText: {
    color: "white",
    fontSize: 13,
    fontWeight: "700",
  },

  memberCard: {
    borderRadius: 12,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  memberTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  memberRoleBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  memberRoleBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  memberName: { fontSize: 14, fontWeight: "700" },
  memberMeta: { fontSize: 11, marginTop: 2 },
  connectedHouseholdCard: {
    borderRadius: 12,
    padding: 10,
  },
  connectedHouseholdLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  connectedHouseholdName: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  connectedHouseholdPrimaryBtn: {
    minHeight: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  connectedHouseholdPrimaryText: {
    color: "white",
    fontSize: 14,
    fontWeight: "700",
  },
  connectedHouseholdSecondaryBtn: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  connectedHouseholdSecondaryText: {
    fontSize: 14,
    fontWeight: "700",
  },
  connectedHouseholdDangerBtn: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    alignSelf: "flex-start",
  },
  connectedHouseholdDangerText: {
    fontSize: 13,
    fontWeight: "700",
  },
  connectedCodeInfo: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  connectedCodeLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 2,
  },
  connectedCodeValue: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 4,
  },

  moduleContainer: {
    borderRadius: 12,
    marginBottom: 10,
    overflow: "hidden",
  },
  moduleCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
  },
  moduleIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  moduleLabel: { fontSize: 15, fontWeight: "600" },

  subConfigBox: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 2,
  },
  budgetChildCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 8,
  },
  budgetCompactInput: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    marginBottom: 6,
    fontSize: 14,
  },
  budgetRecurrenceRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 6,
  },
  budgetChoiceBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  budgetChoiceText: {
    fontSize: 12,
    fontWeight: "700",
  },
  budgetSaveBtn: {
    minHeight: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  budgetSaveBtnText: {
    color: "white",
    fontSize: 13,
    fontWeight: "700",
  },
  mealFeatureRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  mealFeatureControls: {
    flexDirection: "row",
    alignItems: "center",
  },
  mealChevronSpacer: {
    width: 28,
    marginLeft: 8,
  },
  mealSectionBox: {
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  daysContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  dayChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  durationBtn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  wizardActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  wizardPrimaryBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  wizardPrimaryBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  wizardSecondaryBtn: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  wizardSecondaryBtnText: {
    fontSize: 15,
    fontWeight: "600",
  },

  submitButton: {
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  submitButtonText: { color: "white", fontSize: 18, fontWeight: "bold" },
});