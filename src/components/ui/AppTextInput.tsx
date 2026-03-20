import React from "react";
import {
    StyleProp,
    StyleSheet,
    Text,
    TextInput,
    TextInputProps,
    TextStyle,
    useColorScheme,
    View,
    ViewStyle,
} from "react-native";
import { Colors } from "@/constants/theme";

type AppTextInputProps = TextInputProps & {
    label?: string;
    error?: string;
    containerStyle?: StyleProp<ViewStyle>;
    labelStyle?: StyleProp<TextStyle>;
    errorStyle?: StyleProp<TextStyle>;
    inputStyle?: StyleProp<TextStyle>;
};

export function AppTextInput({
    label,
    error,
    containerStyle,
    labelStyle,
    errorStyle,
    inputStyle,
    style,
    placeholderTextColor,
    ...props
}: AppTextInputProps) {
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? "light"];

    return (
        <View style={containerStyle}>
            {label ? (
                <Text style={[styles.label, { color: theme.text }, labelStyle]}>
                    {label}
                </Text>
            ) : null}

            <TextInput
                {...props}
                style={[
                    styles.input,
                    {
                        backgroundColor: theme.card,
                        color: theme.text,
                        borderColor: error ? theme.accentWarm : theme.icon,
                    },
                    style,
                    inputStyle,
                ]}
                placeholderTextColor={placeholderTextColor ?? theme.textSecondary}
            />

            {error ? (
                <Text style={[styles.error, { color: theme.accentWarm }, errorStyle]}>
                    {error}
                </Text>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    label: {
        fontSize: 14,
        fontWeight: "600",
        marginBottom: 8,
        marginLeft: 4,
    },
    input: {
        width: "100%",
        minHeight: 50,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 16,
        fontSize: 16,
    },
    error: {
        fontSize: 12,
        marginTop: 6,
        marginLeft: 4,
    },
});

export type { AppTextInputProps };
