import React from "react";
import { Href, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors } from "@/constants/theme";

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  withBackButton?: boolean;
  onBackPress?: () => void;
  backHref?: Href;
  rightSlot?: React.ReactNode;
  safeTop?: boolean;
  showBorder?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

export function ScreenHeader({
  title,
  subtitle,
  withBackButton = false,
  onBackPress,
  backHref,
  rightSlot,
  safeTop = false,
  showBorder = false,
  containerStyle,
  contentStyle,
}: ScreenHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];

  const handleBack = () => {
    if (onBackPress) {
      onBackPress();
      return;
    }
    if (backHref) {
      router.push(backHref);
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)/home");
  };

  return (
    <View
      style={[
        styles.container,
        {
          borderBottomColor: theme.icon,
          borderBottomWidth: showBorder ? 1 : 0,
          paddingTop: safeTop ? Math.max(insets.top, 12) : 0,
        },
        containerStyle,
      ]}
    >
      <View style={[styles.row, contentStyle]}>
        {withBackButton ? (
          <TouchableOpacity
            onPress={handleBack}
            style={[styles.backBtn, { borderColor: theme.icon }]}
            accessibilityRole="button"
            accessibilityLabel="Revenir en arrière"
          >
            <MaterialCommunityIcons name="arrow-left" size={20} color={theme.tint} />
          </TouchableOpacity>
        ) : null}

        <View style={styles.textContainer}>
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{subtitle}</Text> : null}
        </View>

        {rightSlot ? <View style={styles.rightSlot}>{rightSlot}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  row: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
  },
  rightSlot: {
    marginLeft: 4,
  },
});

