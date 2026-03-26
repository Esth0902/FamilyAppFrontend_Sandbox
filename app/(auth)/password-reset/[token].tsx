import React, { useMemo, useState } from "react";
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
import { useLocalSearchParams, useRouter } from "expo-router";
import { Colors } from "@/constants/theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { resetPassword, toAuthServiceError } from "@/src/services/authService";

const toSingleParam = (value: string | string[] | undefined): string => {
    if (Array.isArray(value)) {
        return value[0] ?? "";
    }
    return value ?? "";
};

export default function PasswordResetScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? "light"];
    const params = useLocalSearchParams<{ token?: string | string[]; email?: string | string[] }>();

    const token = useMemo(() => toSingleParam(params.token), [params.token]);
    const initialEmail = useMemo(() => toSingleParam(params.email), [params.email]);

    const [email, setEmail] = useState(initialEmail);
    const [password, setPassword] = useState("");
    const [passwordConfirmation, setPasswordConfirmation] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showPasswordConfirmation, setShowPasswordConfirmation] = useState(false);
    const [loading, setLoading] = useState(false);

    const onSubmit = async () => {
        if (!token) {
            Alert.alert("Réinitialisation", "Le token de réinitialisation est manquant.");
            return;
        }

        if (!email.trim() || !password || !passwordConfirmation) {
            Alert.alert("Réinitialisation", "Merci de remplir tous les champs.");
            return;
        }

        if (password !== passwordConfirmation) {
            Alert.alert("Réinitialisation", "La confirmation du mot de passe est invalide.");
            return;
        }

        setLoading(true);
        try {
            const result = await resetPassword({
                token,
                email: email.trim(),
                password,
                passwordConfirmation,
            });

            Alert.alert("Réinitialisation", result.message);
            router.replace("/login");
        } catch (error: unknown) {
            const authError = toAuthServiceError(error, "Impossible de réinitialiser le mot de passe.");
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
                <TouchableOpacity onPress={() => router.replace("/login")} style={[styles.backButton, { borderColor: theme.icon }]}>
                    <MaterialCommunityIcons name="arrow-left" size={20} color={theme.tint} />
                </TouchableOpacity>

                <View style={styles.header}>
                    <Text style={[styles.title, { color: theme.text }]}>Nouveau mot de passe</Text>
                    <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                        Définis un nouveau mot de passe pour ton compte.
                    </Text>
                </View>

                <View style={styles.form}>
                    <Text style={[styles.label, { color: theme.text }]}>E-mail</Text>
                    <TextInput
                        style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.icon }]}
                        placeholder="Ex: parent@famille.com"
                        placeholderTextColor={theme.textSecondary}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        value={email}
                        onChangeText={setEmail}
                    />

                    <Text style={[styles.label, { color: theme.text }]}>Nouveau mot de passe</Text>
                    <TextInput
                        style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.icon }]}
                        placeholder="Minimum 8 caractères"
                        placeholderTextColor={theme.textSecondary}
                        secureTextEntry={!showPassword}
                        value={password}
                        onChangeText={setPassword}
                    />

                    <TouchableOpacity
                        onPress={() => setShowPassword((prev) => !prev)}
                        style={styles.eyeToggle}
                    >
                        <MaterialCommunityIcons
                            name={showPassword ? "eye-off-outline" : "eye-outline"}
                            size={18}
                            color={theme.textSecondary}
                        />
                    </TouchableOpacity>

                    <Text style={[styles.label, { color: theme.text }]}>Confirmation</Text>
                    <TextInput
                        style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.icon }]}
                        placeholder="Retape le mot de passe"
                        placeholderTextColor={theme.textSecondary}
                        secureTextEntry={!showPasswordConfirmation}
                        value={passwordConfirmation}
                        onChangeText={setPasswordConfirmation}
                    />

                    <TouchableOpacity
                        onPress={() => setShowPasswordConfirmation((prev) => !prev)}
                        style={styles.eyeToggle}
                    >
                        <MaterialCommunityIcons
                            name={showPasswordConfirmation ? "eye-off-outline" : "eye-outline"}
                            size={18}
                            color={theme.textSecondary}
                        />
                    </TouchableOpacity>

                    {loading ? (
                        <ActivityIndicator size="large" color={theme.tint} />
                    ) : (
                        <TouchableOpacity
                            style={[styles.primaryButton, { backgroundColor: theme.tint }]}
                            onPress={onSubmit}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.primaryButtonText}>Réinitialiser le mot de passe</Text>
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
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    header: {
        marginBottom: 32,
        alignItems: "flex-start",
    },
    title: {
        fontSize: 18,
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
        marginBottom: 16,
        fontSize: 16,
    },
    eyeToggle: {
        alignSelf: "flex-end",
        marginTop: -8,
        marginBottom: 8,
        padding: 4,
    },
    primaryButton: {
        width: "100%",
        height: 54,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 8,
    },
    primaryButtonText: {
        color: "white",
        fontSize: 16,
        fontWeight: "bold",
        textAlign: "center",
    },
});
