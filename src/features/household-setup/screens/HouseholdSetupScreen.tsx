// src/features/household-setup/screens/HouseholdSetupScreen.tsx
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSetupHouseholdScreen } from "@/src/features/household-setup/hooks/useSetupHouseholdScreen";

import { HouseholdSetupLoadingView } from "../components/screen/HouseholdSetupLoadingView";
import { HouseholdSetupShareAccountsView } from "../components/screen/HouseholdSetupShareAccountsView";
import { HouseholdSetupMainView } from "../components/screen/HouseholdSetupMainView";

export default function HouseholdSetupScreen() {
  const insets = useSafeAreaInsets();
  const state = useSetupHouseholdScreen();

  if (state.ui.initialLoading) {
    return <HouseholdSetupLoadingView theme={state.theme} />;
  }

  if (!state.ui.isEditMode && state.data.createdMembersForShare.length > 0) {
    return <HouseholdSetupShareAccountsView {...state} />;
  }

  return <HouseholdSetupMainView {...state} insets={insets} />;
}