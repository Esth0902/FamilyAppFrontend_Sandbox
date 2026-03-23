import React from "react";
import {
    ActivityIndicator,
    StyleProp,
    StyleSheet,
    Text,
    TextStyle,
    TouchableOpacity,
    TouchableOpacityProps,
    useColorScheme,
    ViewStyle,
} from "react-native";
import { Colors } from "@/constants/theme";

type AppButtonVariant = "plain" | "primary" | "secondary" | "ghost" | "danger";

type AppButtonProps = TouchableOpacityProps & {
    title?: string;
    loading?: boolean;
    variant?: AppButtonVariant;
    textStyle?: StyleProp<TextStyle>;
    containerStyle?: StyleProp<ViewStyle>;
};

const resolveVariantStyles = (variant: AppButtonVariant, tint: string, card: string, accentWarm: string) => {
    if (variant === "primary") {
        return {
            container: { backgroundColor: tint, borderColor: tint, borderWidth: 1 } satisfies ViewStyle,
            text: { color: "#FFFFFF" } satisfies TextStyle,
            spinner: "#FFFFFF",
        };
    }

    if (variant === "secondary") {
        return {
            container: { backgroundColor: "transparent", borderColor: tint, borderWidth: 1 } satisfies ViewStyle,
            text: { color: tint } satisfies TextStyle,
            spinner: tint,
        };
    }

    if (variant === "ghost") {
        return {
            container: { backgroundColor: "transparent", borderWidth: 0 } satisfies ViewStyle,
            text: { color: tint } satisfies TextStyle,
            spinner: tint,
        };
    }

    if (variant === "danger") {
        return {
            container: { backgroundColor: card, borderColor: accentWarm, borderWidth: 1 } satisfies ViewStyle,
            text: { color: accentWarm } satisfies TextStyle,
            spinner: accentWarm,
        };
    }

    return {
        container: {} satisfies ViewStyle,
        text: {} satisfies TextStyle,
        spinner: tint,
    };
};

export function AppButton({
    title,
    loading = false,
    variant = "plain",
    textStyle,
    containerStyle,
    style,
    disabled,
    children,
    activeOpacity = 0.8,
    ...props
}: AppButtonProps) {
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? "light"];
    const variantStyles = resolveVariantStyles(variant, theme.tint, theme.card, theme.accentWarm);
    const isDisabled = disabled || loading;

    return (
        <TouchableOpacity
            {...props}
            disabled={isDisabled}
            activeOpacity={activeOpacity}
            style={[
                styles.base,
                variantStyles.container,
                style,
                containerStyle,
                isDisabled ? styles.disabled : null,
            ]}
        >
            {loading ? (
                <ActivityIndicator size="small" color={variantStyles.spinner} />
            ) : title ? (
                <Text style={[styles.text, variantStyles.text, textStyle]}>{title}</Text>
            ) : (
                children
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    base: {
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
    },
    text: {
        fontSize: 16,
        fontWeight: "700",
    },
    disabled: {
        opacity: 0.6,
    },
});

export type { AppButtonProps, AppButtonVariant };
