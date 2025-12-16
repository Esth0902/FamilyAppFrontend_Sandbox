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
import { Colors } from "@/constants/theme"; // Ton thème
import { MaterialCommunityIcons } from "@expo/vector-icons";

export default function Register() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? 'light'];

    const [name, setName] = useState("Parent Test");
    const [email, setEmail] = useState("parent@example.com");
    const [password, setPassword] = useState("password123");
    const [passwordConfirm, setPasswordConfirm] = useState("password123");
    const [loading, setLoading] = useState(false);

    const onRegister = async () => {
        if (password !== passwordConfirm) {
            Alert.alert("Oups", "Les mots de passe ne correspondent pas.");
            return;
        }

        try {
            setLoading(true);

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

            const data: any = await response.json();

            if (!response.ok) {
                console.log("Register error:", data);
                let msg = "Impossible de créer le compte.";

                if (typeof data === "object" && data !== null) {
                    if ("message" in data && typeof data.message === "string") {
                        msg = data.message;
                    }
                    if ("errors" in data && typeof data.errors === "object") {
                        const errors = data.errors as Record<string, string[]>;
                        const first = Object.values(errors)[0];
                        if (Array.isArray(first) && first.length > 0) {
                            msg = first[0];
                        }
                    }
                }
                Alert.alert("Erreur", msg);
                return;
            }

            // Stockage sécurisé (comme sur le Login)
            if (data.token) {
                await SecureStore.setItemAsync("authToken", data.token);
            }
            if (data.user) {
                await SecureStore.setItemAsync("user", JSON.stringify(data.user));
            }

            Alert.alert("Bienvenue !", "Votre compte a été créé avec succès.");
            router.replace("/(tabs)");

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
            <ScrollView contentContainerStyle={styles.scrollContainer}>

                {/* BOUTON RETOUR */}
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color={theme.textSecondary} />
                </TouchableOpacity>

                <View style={styles.header}>
                    <Text style={[styles.title, { color: theme.text }]}>Créer un compte</Text>
                    <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                        Rejoins FamilyFlow pour organiser ta vie de famille.
                    </Text>
                </View>

                {/* FORMULAIRE */}
                <View style={styles.form}>

                    <Text style={[styles.label, { color: theme.text }]}>Nom complet</Text>
                    <TextInput
                        style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.icon }]}
                        placeholder="Ex: Sophie Martin"
                        placeholderTextColor={theme.textSecondary}
                        value={name}
                        onChangeText={setName}
                    />

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

                    <Text style={[styles.label, { color: theme.text }]}>Mot de passe</Text>
                    <TextInput
                        style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.icon }]}
                        placeholder="Min 8 caractères"
                        placeholderTextColor={theme.textSecondary}
                        secureTextEntry
                        value={password}
                        onChangeText={setPassword}
                    />

                    <Text style={[styles.label, { color: theme.text }]}>Confirmation</Text>
                    <TextInput
                        style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.icon }]}
                        placeholder="Répétez le mot de passe"
                        placeholderTextColor={theme.textSecondary}
                        secureTextEntry
                        value={passwordConfirm}
                        onChangeText={setPasswordConfirm}
                    />

                    <View style={{ height: 20 }} />

                    {/* ACTION PRINCIPALE */}
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

                    {/* LIEN LOGIN */}
                    <View style={styles.footerLink}>
                        <Text style={{ color: theme.textSecondary }}>Déjà un compte ? </Text>
                        <TouchableOpacity onPress={() => router.push("/login")}>
                            <Text style={{ color: theme.accentCool, fontWeight: 'bold' }}>Se connecter</Text>
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
        position: 'absolute',
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
        width: '100%',
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 8,
        marginLeft: 4,
    },
    input: {
        width: '100%',
        height: 50,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 16,
        marginBottom: 16,
        fontSize: 16,
    },
    primaryButton: {
        width: '100%',
        height: 54,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 5,
        elevation: 4,
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
    footerLink: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 24,
        marginBottom: 40,
    }
});