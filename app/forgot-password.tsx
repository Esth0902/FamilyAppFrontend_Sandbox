import React, { useState } from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Alert,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    useColorScheme,
} from "react-native";
import { useRouter } from "expo-router";
import { API_BASE_URL } from "@/src/api/client";
import { Colors } from "@/constants/theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";

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
            Alert.alert("Réinitialisation", "Merci de renseigner un email.");
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
                data?.message || "Si un compte existe, un email de réinitialisation a été envoyé."
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
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color={theme.textSecondary} />
                </TouchableOpacity>

                <View style={styles.header}>
                    <Text style={[styles.title, { color: theme.text }]}>Mot de passe oublié</Text>
                    <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                        Saisis ton email pour recevoir un lien de réinitialisation.
                    </Text>
                </View>

                <View style={styles.form}>
                    <Text style={[styles.label, { color: theme.text }]}>Email</Text>
                    <TextInput
                        style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.icon }]}
                        placeholder="Ex: parent@famille.com"
                        placeholderTextColor={theme.textSecondary}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        value={email}
                        onChangeText={setEmail}
                    />

                    {loading ? (
                        <ActivityIndicator size="large" color={theme.tint} />
                    ) : (
                        <TouchableOpacity
                            style={[styles.primaryButton, { backgroundColor: theme.tint }]}
                            onPress={onSubmit}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.primaryButtonText}>Envoyer le lien</Text>
                        </TouchableOpacity>
                    )}
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
        padding: 24,
        justifyContent: "center",
    },
    backButton: {
        position: "absolute",
        top: 60,
        left: 24,
        zIndex: 10,
        padding: 8,
    },
    header: {
        marginBottom: 32,
        alignItems: "flex-start",
    },
    title: {
        fontSize: 32,
        fontWeight: "bold",
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
    },
    form: {
        width: "100%",
    },
    label: {
        fontSize: 14,
        fontWeight: "600",
        marginBottom: 8,
        marginLeft: 4,
    },
    input: {
        width: "100%",
        height: 50,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 16,
        marginBottom: 20,
        fontSize: 16,
    },
    primaryButton: {
        width: "100%",
        height: 54,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
    },
    primaryButtonText: {
        color: "white",
        fontSize: 18,
        fontWeight: "bold",
    },
});
