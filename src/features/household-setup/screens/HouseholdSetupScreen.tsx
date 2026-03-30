// src/features/household-setup/screens/HouseholdSetupScreen.tsx
import React from "react";
import { useSetupHouseholdScreen } from "@/src/features/household-setup/hooks/useSetupHouseholdScreen";

import { HouseholdSetupLoadingView } from "../components/screen/HouseholdSetupLoadingView";
import { HouseholdSetupShareAccountsView } from "../components/screen/HouseholdSetupShareAccountsView";
import { HouseholdSetupMainView } from "../components/screen/HouseholdSetupMainView";
import { HouseholdSetupModuleSettingsView } from "../components/screen/HouseholdSetupModuleSettingsView";

export default function HouseholdSetupScreen() {
  const state = useSetupHouseholdScreen();

  if (state.ui.initialLoading) {
    return <HouseholdSetupLoadingView theme={state.theme} />;
  }

  if (!state.ui.isEditMode && state.data.createdMembersForShare.length > 0) {
    return <HouseholdSetupShareAccountsView {...state} />;
  }

  if (state.ui.isEditMode && state.ui.isModuleScope) {
    return <HouseholdSetupModuleSettingsView {...state} />;
  }

  return <HouseholdSetupMainView {...state} />;
}
