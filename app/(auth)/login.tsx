import React, { useState } from "react";
import { Alert, StyleSheet, TouchableOpacity, useColorScheme, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import { AppButton } from "@/src/components/ui/AppButton";
import { AppTextInput } from "@/src/components/ui/AppTextInput";
import { ScreenHeader } from "@/src/components/ui/ScreenHeader";
import { login, toAuthServiceError, type LoginPayload } from "@/src/services/authService";

export default function Login() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const navigateAfterAuthSuccess = (mustChangePassword: boolean) => {
    if (mustChangePassword) {
      router.replace("/change-credentials");
      return;
    }

    router.replace("/(app)/(tabs)/home");
  };

  const loginMutation = useMutation({
    mutationFn: async (payload: LoginPayload) => {
      return await login(payload);
    },
    onSuccess: (result) => {
      navigateAfterAuthSuccess(result.mustChangePassword);
    },
    onError: (error: unknown) => {
      const authError = toAuthServiceError(error, "Connexion impossible.");
      Alert.alert("Erreur", authError.message);
    },
  });

  const onLogin = () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      Alert.alert("Oups", "Merci de remplir tous les champs.");
      return;
    }

    if (loginMutation.isPending) {
      return;
    }

    loginMutation.mutate({
      email: trimmedEmail,
      password,
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <ScreenHeader
          title="Bon retour !"
          subtitle="Connecte-toi pour accéder à ton foyer."
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

          <AppTextInput
            label="Mot de passe"
            containerStyle={styles.inputContainer}
            placeholder="••••••••"
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
            rightSlot={
              <TouchableOpacity
                onPress={() => setShowPassword((prev) => !prev)}
                accessibilityLabel={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialCommunityIcons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={theme.textSecondary}
                />
              </TouchableOpacity>
            }
          />

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
            loading={loginMutation.isPending}
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
    padding: 12,
    paddingTop: 56,
    justifyContent: "flex-start",
  },
  headerContainer: { paddingHorizontal: 0, paddingBottom: 0 },
  headerContent: { minHeight: 0 },
  form: {
    width: "100%",
    marginTop: 32,
  },
  inputContainer: {
    marginBottom: 16,
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
