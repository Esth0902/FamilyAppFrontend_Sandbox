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
import { API_BASE_URL } from "@/src/api/client";
import { Colors } from "@/constants/theme";

// Import de tes composants UI partagés
import { AppTextInput } from "@/src/components/ui/AppTextInput";
import { AppButton } from "@/src/components/ui/AppButton";
import { ScreenHeader } from "@/src/components/ui/ScreenHeader";

const parseJsonSafe = async (response: Response) => {
    const text = await response.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
};

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

        if (!API_BASE_URL) {
            Alert.alert("Erreur", "Configuration API manquante. Vérifie EXPO_PUBLIC_API_MODE et EXPO_PUBLIC_API_URL_*.");
            return;
        }

        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
                method: "POST",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ email: email.trim() }),
            });

            const data = await parseJsonSafe(response);

            if (!response.ok) {
                Alert.alert("Erreur", data?.message || "Impossible d'envoyer la demande.");
                return;
            }

            Alert.alert(
                "Réinitialisation",
                data?.message || "Si un compte existe, un e-mail de réinitialisation a été envoyé."
            );
            router.replace("/login");
        } catch (error) {
            console.error("Erreur forgot password:", error);
            Alert.alert("Erreur réseau", "Impossible de contacter le serveur.");
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
                {/* Utilisation de ton ScreenHeader au lieu de vues brutes */}
                <ScreenHeader
                    title="Mot de passe oublié"
                    subtitle="Saisis ton e-mail pour recevoir un lien de réinitialisation."
                    showBorder
                    withBackButton
                    containerStyle={styles.headerContainer}
                    contentStyle={styles.headerContent}
                />

                <View style={styles.form}>
                    {/* Utilisation de ton AppTextInput */}
                    <AppTextInput
                        label="E-mail"
                        containerStyle={styles.inputContainer}
                        placeholder="Ex: parent@famille.com"
                        autoCapitalize="none"
                        keyboardType="email-address"
                        value={email}
                        onChangeText={setEmail}
                    />

                    {/* Utilisation de ton AppButton qui gère le loading nativement */}
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
        padding: 12, // Alignement avec ton Login
        paddingTop: 56, // Pour matcher la hauteur du Login
        justifyContent: "flex-start", // On remonte le formulaire vers le haut
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