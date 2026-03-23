import React, { useState } from "react";
import { Alert, StyleSheet, useColorScheme, View } from "react-native";
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

export default function Login() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const onLogin = async () => {
    if (!email || !password) {
      Alert.alert("Oups", "Merci de remplir tous les champs.");
      return;
    }

    try {
      setLoading(true);

      if (!API_BASE_URL) {
        Alert.alert("Erreur", "Configuration API manquante. Vérifie EXPO_PUBLIC_API_MODE et EXPO_PUBLIC_API_URL_*.");
        return;
      }

      const response = await fetch(`${API_BASE_URL}/login`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await parseJsonSafe(response);

      if (!response.ok) {
        Alert.alert("Erreur", data?.message || "Identifiants incorrects");
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
        console.warn("Impossible de synchroniser /me après login:", syncError);
      }

      if (resolvedUser) {
        const normalizedUser = normalizeStoredUser(resolvedUser);
        if (normalizedUser) {
          await persistStoredUser(normalizedUser);
        }
      }

      if (resolvedUser?.must_change_password) {
        router.replace("/change-credentials");
      } else {
        router.replace("/(tabs)/home");
      }
    } catch (error) {
      console.error(error);
      Alert.alert("Erreur réseau", "Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <ScreenHeader
          title="Bon retour !"
          subtitle="Connecte-toi pour accéder à ton foyer."
          withBackButton
          containerStyle={styles.headerContainer}
          contentStyle={styles.headerContent}
        />

        <View style={styles.form}>
          <AppTextInput
            label="E-mail"
            style={styles.input}
            containerStyle={styles.inputContainer}
            placeholder="Ex: parent@famille.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          <View style={styles.passwordFieldContainer}>
            <AppTextInput
              label="Mot de passe"
              style={[styles.input, styles.passwordInput]}
              containerStyle={styles.inputContainer}
              placeholder="••••••••"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />

            <AppButton
              onPress={() => setShowPassword((prev) => !prev)}
              style={styles.eyeButton}
              accessibilityLabel={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            >
              <MaterialCommunityIcons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={theme.textSecondary}
              />
            </AppButton>
          </View>

          <AppButton
            title="Mot de passe oublié ?"
            variant="ghost"
            style={styles.forgotPasswordButton}
            textStyle={styles.forgotPasswordText}
            onPress={() => router.push("/forgot-password")}
          />

          <AppButton
            title="Se connecter"
            variant="primary"
            loading={loading}
            style={styles.loginButton}
            onPress={onLogin}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 24,
    paddingTop: 56,
    justifyContent: "flex-start",
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
  forgotPasswordButton: {
    alignSelf: "flex-end",
    marginBottom: 24,
    minHeight: 24,
  },
  forgotPasswordText: {
    fontSize: 14,
  },
  loginButton: {
    width: "100%",
    minHeight: 54,
    borderRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 4,
  },
});
