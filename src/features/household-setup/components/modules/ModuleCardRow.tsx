import React from "react";
import { View, Text, StyleSheet, Switch } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { AppButton } from "@/src/components/ui/AppButton";
import type { ModuleKey } from "@/src/features/household-setup/utils/householdSetup.types";

type ModuleCardRowProps = {
  module: { id: ModuleKey; label: string; desc: string; icon: string };
  theme: any;
  isActive: boolean;
  isExpanded: boolean;
  canExpandPanel: boolean;
  onToggleModule: () => void;
  onTogglePanel: () => void;
};

export function ModuleCardRow({
  module,
  theme,
  isActive,
  isExpanded,
  canExpandPanel,
  onToggleModule,
  onTogglePanel,
}: ModuleCardRowProps) {
  return (
    <View style={styles.moduleCard}>
      <View style={[styles.moduleIcon, { backgroundColor: theme.background }]}>
        <MaterialCommunityIcons name={module.icon as any} size={24} color={theme.tint} />
      </View>

      <AppButton
        style={{ flex: 1 }}
        onPress={() => {
          if (!canExpandPanel) return;
          onTogglePanel();
        }}
      >
        <Text style={[styles.moduleLabel, { color: theme.text }]}>{module.label}</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{module.desc}</Text>
      </AppButton>

      <Switch
        value={isActive}
        onValueChange={onToggleModule}
        trackColor={{ false: theme.icon, true: theme.tint }}
      />

      {canExpandPanel ? (
        <AppButton
          onPress={onTogglePanel}
          style={{ marginLeft: 8, padding: 4 }}
          disabled={!isActive}
        >
          <MaterialCommunityIcons
            name={isExpanded ? "chevron-up" : "chevron-down"}
            size={22}
            color={isActive ? theme.text : theme.icon}
          />
        </AppButton>
      ) : (
        <View style={styles.chevronSpacer} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  moduleCard: { flexDirection: "row", alignItems: "center", padding: 12 },
  moduleIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  moduleLabel: { fontSize: 15, fontWeight: "600" },
  chevronSpacer: { width: 28, marginLeft: 8 },
});
