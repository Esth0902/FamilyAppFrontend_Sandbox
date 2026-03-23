import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, useColorScheme, View } from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";

import { Colors } from "@/constants/theme";
import { API_BASE_URL, apiFetch } from "@/src/api/client";
import { AppButton } from "@/src/components/ui/AppButton";
import { AppTextInput } from "@/src/components/ui/AppTextInput";
import { ScreenHeader } from "@/src/components/ui/ScreenHeader";
import { normalizeStoredUser, persistStoredUser, type StoredUser } from "@/src/session/user-cache";
import { setAuthToken } from "@/src/store/useAuthStore";

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

      const accessToken =
        typeof data?.access_token === "string" && data.access_token.trim().length > 0
          ? data.access_token
          : typeof data?.token === "string" && data.token.trim().length > 0
            ? data.token
            : null;

      if (!accessToken) {
        Alert.alert("Erreur", "Réponse d'authentification invalide (token manquant).");
        return;
      }

      await SecureStore.setItemAsync("authToken", accessToken);
      setAuthToken(accessToken);

      let resolvedUser: StoredUser | null = data?.user ? (data.user as StoredUser) : null;

      try {
        const meResponse = await apiFetch("/me", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          bypassCache: true,
        });

        if (meResponse?.user) {
          resolvedUser = meResponse.user as StoredUser;
        }
      } catch (syncError) {
        console.warn("Impossible de synchroniser /me après inscription:", syncError);
      }

      if (resolvedUser) {
        const normalizedUser = normalizeStoredUser(resolvedUser);
        if (normalizedUser) {
          await persistStoredUser(normalizedUser);
        }
      }

      Alert.alert("Bienvenue !", "Compte créé avec succès.");
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
      style={[styles.keyboardContainer, { backgroundColor: theme.background }]}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContainer}>
        <ScreenHeader
          title="Créer un compte"
          subtitle="Rejoins FamilyFlow pour organiser ta vie de famille."
          withBackButton
          containerStyle={styles.headerContainer}
          contentStyle={styles.headerContent}
        />

        <View style={styles.form}>
          <AppTextInput
            label="Nom complet"
            style={styles.input}
            containerStyle={styles.inputContainer}
            placeholder="Ex: Sophie"
            value={name}
            onChangeText={setName}
          />

          <AppTextInput
            label="E-mail"
            style={styles.input}
            containerStyle={styles.inputContainer}
            placeholder="Ex: parent@famille.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            error={fieldErrors.email}
          />

          <View style={styles.passwordFieldContainer}>
            <AppTextInput
              label="Mot de passe"
              style={[styles.input, styles.passwordInput]}
              containerStyle={styles.inputContainer}
              placeholder="Min 8 caractères"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              error={fieldErrors.password}
            />
            <AppButton
              style={styles.eyeButton}
              onPress={() => setShowPassword((prev) => !prev)}
              accessibilityLabel={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            >
              <MaterialCommunityIcons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={theme.textSecondary}
              />
            </AppButton>
          </View>

          <View style={styles.passwordFieldContainer}>
            <AppTextInput
              label="Confirmation"
              style={[styles.input, styles.passwordInput]}
              containerStyle={styles.inputContainer}
              placeholder="Répétez le mot de passe"
              secureTextEntry={!showPasswordConfirm}
              value={passwordConfirm}
              onChangeText={setPasswordConfirm}
            />
            <AppButton
              style={styles.eyeButton}
              onPress={() => setShowPasswordConfirm((prev) => !prev)}
              accessibilityLabel={showPasswordConfirm ? "Masquer la confirmation" : "Afficher la confirmation"}
            >
              <MaterialCommunityIcons
                name={showPasswordConfirm ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={theme.textSecondary}
              />
            </AppButton>
          </View>

          <View style={styles.spacer} />

          <AppButton
            title="Créer mon compte"
            variant="primary"
            loading={loading}
            style={styles.primaryButton}
            onPress={onRegister}
          />

          <View style={styles.footerLink}>
            <Text style={[styles.footerText, { color: theme.textSecondary }]}>Déjà un compte ? </Text>
            <AppButton
              title="Se connecter"
              variant="ghost"
              style={styles.footerAction}
              textStyle={styles.footerActionText}
              onPress={() => router.push("/login")}
            />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 56,
  },
  headerContainer: { paddingHorizontal: 0, paddingBottom: 0 },
  headerContent: { minHeight: 0 },
  form: {
    width: "100%",
  },
  inputContainer: {
    marginBottom: 16,
  },
  input: {
    height: 50,
    marginBottom: 0,
  },
  passwordFieldContainer: {
    position: "relative",
    marginBottom: 16,
  },
  passwordInput: {
    paddingRight: 48,
  },
  eyeButton: {
    position: "absolute",
    right: 12,
    top: 36,
    width: 24,
    height: 24,
  },
  spacer: {
    height: 20,
  },
  primaryButton: {
    width: "100%",
    minHeight: 54,
    borderRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 4,
  },
  footerLink: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
    marginBottom: 40,
  },
  footerText: {
    fontSize: 14,
  },
  footerAction: {
    minHeight: 24,
  },
  footerActionText: {
    fontWeight: "bold",
  },
});
