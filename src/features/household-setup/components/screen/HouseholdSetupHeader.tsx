import React from "react";
import { View } from "react-native";

import { ScreenHeader } from "@/src/components/ui/ScreenHeader";

type HouseholdSetupHeaderProps = {
  title: string;
  subtitle: string;
  backgroundColor: string;
  onBackPress?: () => void;
};

export function HouseholdSetupHeader({
  title,
  subtitle,
  backgroundColor,
  onBackPress,
}: HouseholdSetupHeaderProps) {
  return (
    <View style={{ backgroundColor, paddingHorizontal: 12 }}>
      <ScreenHeader
        title={title}
        subtitle={subtitle}
        withBackButton
        onBackPress={onBackPress}
        showBorder
        safeTop
        containerStyle={{ paddingHorizontal: 0, marginBottom: 0 }}
        contentStyle={{ minHeight: 0 }}
      />
    </View>
  );
}
