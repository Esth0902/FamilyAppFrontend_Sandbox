import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, useColorScheme, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import { AppButton } from "@/src/components/ui/AppButton";
import { AppTextInput } from "@/src/components/ui/AppTextInput";
import { ScreenHeader } from "@/src/components/ui/ScreenHeader";
import { register, toAuthServiceError, type RegisterPayload } from "@/src/services/authService";

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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const navigateAfterAuthSuccess = (mustChangePassword: boolean) => {
    if (mustChangePassword) {
      router.replace("/change-credentials");
      return;
    }

    router.replace("/(app)/(tabs)/home");
  };

  const registerMutation = useMutation({
    mutationFn: async (payload: RegisterPayload) => {
      return await register(payload);
    },
    onSuccess: (result) => {
      navigateAfterAuthSuccess(result.mustChangePassword);
    },
    onError: (error: unknown) => {
      const authError = toAuthServiceError(error, "Inscription impossible.");
      if (authError.kind === "validation" && authError.fieldErrors) {
        setFieldErrors(authError.fieldErrors);
        return;
      }

      Alert.alert("Erreur", authError.message);
    },
  });

  const onRegister = () => {
    setFieldErrors({});

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName || !trimmedEmail || !password || !passwordConfirm) {
      Alert.alert("Oups", "Merci de remplir tous les champs.");
      return;
    }

    if (password !== passwordConfirm) {
      Alert.alert("Oups", "Les mots de passe ne correspondent pas.");
      return;
    }

    if (registerMutation.isPending) {
      return;
    }

    registerMutation.mutate({
      name: trimmedName,
      email: trimmedEmail,
      password,
      passwordConfirmation: passwordConfirm,
    });
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
          showBorder
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
            error={fieldErrors.name}
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

          <AppTextInput
            label="Mot de passe"
            containerStyle={styles.inputContainer}
            placeholder="Min 8 caractères"
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
            error={fieldErrors.password}
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

          <AppTextInput
            label="Confirmation"
            containerStyle={styles.inputContainer}
            placeholder="Répétez le mot de passe"
            secureTextEntry={!showPasswordConfirm}
            value={passwordConfirm}
            onChangeText={setPasswordConfirm}
            error={fieldErrors.password_confirmation}
            rightSlot={
              <TouchableOpacity
                onPress={() => setShowPasswordConfirm((prev) => !prev)}
                accessibilityLabel={showPasswordConfirm ? "Masquer la confirmation" : "Afficher la confirmation"}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialCommunityIcons
                  name={showPasswordConfirm ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={theme.textSecondary}
                />
              </TouchableOpacity>
            }
          />

          <View style={styles.spacer} />

          <AppButton
            title="Créer mon compte"
            variant="primary"
            loading={registerMutation.isPending}
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
    padding: 12,
    paddingTop: 56,
  },
  headerContainer: { paddingHorizontal: 0, paddingBottom: 0 },
  headerContent: { minHeight: 0 },
  form: {
    width: "100%",
    marginTop: 24,
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 16,
  },
  input: {
    height: 45,
    marginBottom: 0,
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
