import React, { useState } from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Alert,
    ActivityIndicator,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
    useColorScheme,
} from "react-native";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
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

export default function Register() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? "light"];

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [passwordConfirm, setPasswordConfirm] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    const onRegister = async () => {
        setFieldErrors({});

        if (password !== passwordConfirm) {
            Alert.alert("Oups", "Les mots de passe ne correspondent pas.");
            return;
        }

        try {
            setLoading(true);

            if (!API_BASE_URL) {
                Alert.alert("Erreur", "Configuration API manquante. Vérifie EXPO_PUBLIC_API_MODE et EXPO_PUBLIC_API_URL_*.");
                return;
            }

            const response = await fetch(`${API_BASE_URL}/register`, {
                method: "POST",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name,
                    email,
                    password,
                    password_confirmation: passwordConfirm,
                }),
            });

            const data = await parseJsonSafe(response);

            if (!response.ok) {
                if (data?.errors) {
                    const errors: Record<string, string> = {};
                    Object.keys(data.errors).forEach((key) => {
                        errors[key] = data.errors[key][0];
                    });
                    setFieldErrors(errors);
                } else {
                    Alert.alert("Erreur", data?.message || "Erreur inconnue");
                }
                return;
            }

            if (data?.token) {
                await SecureStore.setItemAsync("authToken", data.token);
            }
            if (data?.user) {
                await SecureStore.setItemAsync("user", JSON.stringify(data.user));
            }

            Alert.alert("Bienvenue !", "Compte a été créé avec succès.");
            router.replace("/(tabs)/home");
        } catch (error: unknown) {
            console.error(error);
            Alert.alert("Erreur", "Impossible de contacter le serveur.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1, backgroundColor: theme.background }}
        >
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContainer}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color={theme.textSecondary} />
                </TouchableOpacity>

                <View style={styles.header}>
                    <Text style={[styles.title, { color: theme.text }]}>Créer un compte</Text>
                    <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                        Rejoins FamilyFlow pour organiser ta vie de famille.
                    </Text>
                </View>

                <View style={styles.form}>
                    <Text style={[styles.label, { color: theme.text }]}>Nom complet</Text>
                    <TextInput
                        style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.icon }]}
                        placeholder="Ex: Sophie"
                        placeholderTextColor={theme.textSecondary}
                        value={name}
                        onChangeText={setName}
                    />

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
                    {fieldErrors.email && <Text style={styles.errorText}>{fieldErrors.email}</Text>}

                    <Text style={[styles.label, { color: theme.text }]}>Mot de passe</Text>
                    <View style={styles.passwordFieldContainer}>
                        <TextInput
                            style={[styles.input, styles.passwordInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.icon }]}
                            placeholder="Min 8 caractères"
                            placeholderTextColor={theme.textSecondary}
                            secureTextEntry={!showPassword}
                            value={password}
                            onChangeText={setPassword}
                        />
                        <TouchableOpacity
                            style={styles.eyeButton}
                            onPress={() => setShowPassword((prev) => !prev)}
                            accessibilityLabel={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                        >
                            <MaterialCommunityIcons
                                name={showPassword ? "eye-off-outline" : "eye-outline"}
                                size={20}
                                color={theme.textSecondary}
                            />
                        </TouchableOpacity>
                    </View>

                    <Text style={[styles.label, { color: theme.text }]}>Confirmation</Text>
                    <View style={styles.passwordFieldContainer}>
                        <TextInput
                            style={[styles.input, styles.passwordInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.icon }]}
                            placeholder="Répétez le mot de passe"
                            placeholderTextColor={theme.textSecondary}
                            secureTextEntry={!showPasswordConfirm}
                            value={passwordConfirm}
                            onChangeText={setPasswordConfirm}
                        />
                        <TouchableOpacity
                            style={styles.eyeButton}
                            onPress={() => setShowPasswordConfirm((prev) => !prev)}
                            accessibilityLabel={showPasswordConfirm ? "Masquer le mot de passe de confirmation" : "Afficher le mot de passe de confirmation"}
                        >
                            <MaterialCommunityIcons
                                name={showPasswordConfirm ? "eye-off-outline" : "eye-outline"}
                                size={20}
                                color={theme.textSecondary}
                            />
                        </TouchableOpacity>
                    </View>

                    <View style={{ height: 20 }} />

                    {loading ? (
                        <ActivityIndicator size="large" color={theme.tint} />
                    ) : (
                        <TouchableOpacity
                            style={[styles.primaryButton, { backgroundColor: theme.tint }]}
                            onPress={onRegister}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.primaryButtonText}>Créer mon compte</Text>
                        </TouchableOpacity>
                    )}

                    <View style={styles.footerLink}>
                        <Text style={{ color: theme.textSecondary }}>Déjà un compte ? </Text>
                        <TouchableOpacity onPress={() => router.push("/login")}>
                            <Text style={{ color: theme.accentCool, fontWeight: "bold" }}>Se connecter</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    scrollContainer: {
        flexGrow: 1,
        padding: 24,
        paddingTop: 60,
    },
    backButton: {
        position: "absolute",
        top: 60,
        left: 24,
        zIndex: 10,
        padding: 8,
        marginLeft: -8,
    },
    header: {
        marginTop: 40,
        marginBottom: 32,
    },
    title: {
        fontSize: 30,
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
    passwordFieldContainer: {
        position: "relative",
        marginBottom: 16,
    },
    passwordInput: {
        marginBottom: 0,
        paddingRight: 48,
    },
    eyeButton: {
        position: "absolute",
        right: 12,
        top: 0,
        bottom: 0,
        justifyContent: "center",
        alignItems: "center",
    },
    primaryButton: {
        width: "100%",
        height: 54,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 5,
        elevation: 4,
    },
    primaryButtonText: {
        color: "#FFFFFF",
        fontSize: 18,
        fontWeight: "bold",
    },
    footerLink: {
        flexDirection: "row",
        justifyContent: "center",
        marginTop: 24,
        marginBottom: 40,
    },
    errorText: {
        color: "red",
        fontSize: 12,
        marginTop: -12,
        marginBottom: 10,
        marginLeft: 4,
    },
});
