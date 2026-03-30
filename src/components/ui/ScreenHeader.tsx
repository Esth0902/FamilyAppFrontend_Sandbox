import React from "react";
import { Href, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  useWindowDimensions,
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
  bottomSpacing?: number;
  containerStyle?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

const BORDER_BOTTOM_SPACING = 8;

export function ScreenHeader({
  title,
  subtitle,
  withBackButton = false,
  onBackPress,
  backHref,
  rightSlot,
  safeTop = false,
  showBorder = false,
  bottomSpacing = 8,
  containerStyle,
  contentStyle,
}: ScreenHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
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
    router.replace("/(app)/(tabs)/home");
  };

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: safeTop ? Math.max(insets.top + 10, 24) : 0,
          marginBottom: showBorder ? BORDER_BOTTOM_SPACING : bottomSpacing,
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
      {showBorder ? (
        <View
          pointerEvents="none"
          style={[
            styles.fullBleedBorder,
            {
              backgroundColor: theme.icon,
              left: -screenWidth,
              right: -screenWidth,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
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
    marginBottom: 10,
    fontSize: 13,
    lineHeight: 18,
  },
  rightSlot: {
    marginLeft: 4,
  },
  fullBleedBorder: {
    position: "absolute",
    bottom: 0,
    height: 1,
  },
});

