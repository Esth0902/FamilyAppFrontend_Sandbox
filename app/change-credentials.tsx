import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useColorScheme,
} from "react-native";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { Colors } from "@/constants/theme";
import { apiFetch } from "@/src/api/client";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
    normalizeStoredUser,
    persistStoredUser,
    type StoredUser as CachedUser,
} from "@/src/session/user-cache";

export default function ChangeCredentialsScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? "light"];

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [passwordConfirm, setPasswordConfirm] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const hydrateEmail = async () => {
            try {
                const userStr = await SecureStore.getItemAsync("user");
                if (!userStr) {
                    return;
                }

                const user = JSON.parse(userStr) as CachedUser;
                if (typeof user?.email === "string" && user.email.trim().length > 0) {
                    setEmail(user.email.trim());
                }
            } catch {
                // Ignore cache parse issues.
            }
        };

        void hydrateEmail();
    }, []);

    const onSubmit = async () => {
        if (!email.trim() || !password || !passwordConfirm) {
            Alert.alert("Mise à jour", "Merci de compléter tous les champs.");
            return;
        }

        if (password !== passwordConfirm) {
            Alert.alert("Mise à jour", "Les mots de passe ne correspondent pas.");
            return;
        }

        setLoading(true);
        try {
            const response = await apiFetch("/auth/change-initial-credentials", {
                method: "POST",
                body: JSON.stringify({
                    email: email.trim(),
                    password,
                    password_confirmation: passwordConfirm,
                }),
            });

            const updatedUser = response?.user as CachedUser | undefined;
            if (updatedUser) {
                const normalizedUser = normalizeStoredUser({
                    ...updatedUser,
                    must_change_password: false,
                } as CachedUser);

                if (normalizedUser) {
                    await persistStoredUser(normalizedUser);
                }

                const hasHousehold = Array.isArray(updatedUser.households) && updatedUser.households.length > 0;
                router.replace(hasHousehold ? "/(tabs)/home" : "/householdSetup");
                return;
            }

            Alert.alert("Mise à jour", "Identifiants mis à jour.");
            router.replace("/(tabs)/home");
        } catch (error: any) {
            Alert.alert("Erreur", error?.message || "Impossible de mettre à jour les identifiants.");
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
                <Text style={[styles.title, { color: theme.text }]}>Mise à jour obligatoire</Text>
                <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                    Pour des raisons de sécurité, change ton e-mail et ton mot de passe avant de continuer.
                </Text>

                <Text style={[styles.label, { color: theme.text }]}>Nouvel e-mail</Text>
                <TextInput
                    style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.icon }]}
                    placeholder="email@exemple.com"
                    placeholderTextColor={theme.textSecondary}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={email}
                    onChangeText={setEmail}
                />

                <Text style={[styles.label, { color: theme.text }]}>Nouveau mot de passe</Text>
                <View style={styles.passwordFieldContainer}>
                    <TextInput
                        style={[styles.input, styles.passwordInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.icon }]}
                        placeholder="Minimum 8 caractères"
                        placeholderTextColor={theme.textSecondary}
                        secureTextEntry={!showPassword}
                        value={password}
                        onChangeText={setPassword}
                    />
                    <TouchableOpacity
                        onPress={() => setShowPassword((prev) => !prev)}
                        style={styles.eyeButton}
                        accessibilityLabel={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    >
                        <MaterialCommunityIcons
                            name={showPassword ? "eye-off-outline" : "eye-outline"}
                            size={20}
                            color={theme.textSecondary}
                        />
                    </TouchableOpacity>
                </View>

                <Text style={[styles.label, { color: theme.text }]}>Confirmation mot de passe</Text>
                <View style={styles.passwordFieldContainer}>
                    <TextInput
                        style={[styles.input, styles.passwordInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.icon }]}
                        placeholder="Retape le mot de passe"
                        placeholderTextColor={theme.textSecondary}
                        secureTextEntry={!showPasswordConfirm}
                        value={passwordConfirm}
                        onChangeText={setPasswordConfirm}
                    />
                    <TouchableOpacity
                        onPress={() => setShowPasswordConfirm((prev) => !prev)}
                        style={styles.eyeButton}
                        accessibilityLabel={showPasswordConfirm ? "Masquer la confirmation" : "Afficher la confirmation"}
                    >
                        <MaterialCommunityIcons
                            name={showPasswordConfirm ? "eye-off-outline" : "eye-outline"}
                            size={20}
                            color={theme.textSecondary}
                        />
                    </TouchableOpacity>
                </View>

                {loading ? (
                    <ActivityIndicator size="large" color={theme.tint} />
                ) : (
                    <TouchableOpacity
                        style={[styles.button, { backgroundColor: theme.tint }]}
                        onPress={onSubmit}
                        activeOpacity={0.85}
                    >
                        <Text style={styles.buttonText}>Valider</Text>
                    </TouchableOpacity>
                )}
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
        justifyContent: "center",
        paddingHorizontal: 24,
    },
    title: {
        fontSize: 28,
        fontWeight: "700",
        marginBottom: 10,
    },
    subtitle: {
        fontSize: 15,
        lineHeight: 22,
        marginBottom: 28,
    },
    label: {
        fontSize: 14,
        fontWeight: "600",
        marginBottom: 8,
        marginLeft: 4,
    },
    input: {
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
    button: {
        height: 52,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 10,
    },
    buttonText: {
        color: "white",
        fontSize: 17,
        fontWeight: "700",
    },
});
