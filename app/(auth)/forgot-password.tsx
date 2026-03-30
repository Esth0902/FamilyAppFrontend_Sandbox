import React, { useState } from "react";
import {
    View,
    StyleSheet,
    Alert,
    KeyboardAvoidingView,
    Platform,
    useColorScheme,
} from "react-native";
import { useRouter } from "expo-router";
import { Colors } from "@/constants/theme";
import { forgotPassword, toAuthServiceError } from "@/src/services/authService";

import { AppTextInput } from "@/src/components/ui/AppTextInput";
import { AppButton } from "@/src/components/ui/AppButton";
import { ScreenHeader } from "@/src/components/ui/ScreenHeader";

export default function ForgotPasswordScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? "light"];

    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);

    const onSubmit = async () => {
        if (!email.trim()) {
            Alert.alert("Réinitialisation", "Merci de renseigner un e-mail.");
            return;
        }

        setLoading(true);
        try {
            const result = await forgotPassword({
                email: email.trim(),
            });

            Alert.alert("Réinitialisation", result.message);
            router.replace("/login");
        } catch (error: unknown) {
            const authError = toAuthServiceError(error, "Impossible d'envoyer la demande.");
            Alert.alert("Erreur", authError.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={[styles.container, { backgroundColor: theme.background }]}
        >
            <View style={styles.content}>
                <ScreenHeader
                    title="Mot de passe oublié"
                    subtitle="Saisis ton e-mail pour recevoir un lien de réinitialisation."
                    showBorder
                    withBackButton
                    containerStyle={styles.headerContainer}
                    contentStyle={styles.headerContent}
                />

                <View style={styles.form}>
                    <AppTextInput
                        label="E-mail"
                        containerStyle={styles.inputContainer}
                        placeholder="Ex: parent@famille.com"
                        autoCapitalize="none"
                        keyboardType="email-address"
                        value={email}
                        onChangeText={setEmail}
                    />

                    <AppButton
                        title="Envoyer le lien"
                        variant="primary"
                        loading={loading}
                        style={styles.submitButton}
                        onPress={onSubmit}
                    />
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        flex: 1,
        padding: 12,
        paddingTop: 56,
        justifyContent: "flex-start",
    },
    headerContainer: {
        paddingHorizontal: 0,
        paddingBottom: 0,
    },
    headerContent: {
        minHeight: 0,
    },
    form: {
        width: "100%",
        marginTop: 32,
    },
    inputContainer: {
        marginBottom: 24,
    },
    submitButton: {
        width: "100%",
        minHeight: 54,
        borderRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 5,
        elevation: 4,
    },
});
