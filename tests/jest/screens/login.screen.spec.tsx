/* eslint-env jest */
import type { ReactNode } from "react";
import { Alert } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import LoginScreen from "@/app/(auth)/login";

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

jest.mock("@expo/vector-icons", () => ({
  MaterialCommunityIcons: "MaterialCommunityIcons",
}));

jest.mock("expo-secure-store", () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock("@/src/api/client", () => ({
  API_BASE_URL: "http://localhost:8000",
  apiFetch: jest.fn(),
}));

jest.mock("@/src/session/user-cache", () => ({
  normalizeStoredUser: jest.fn((input) => input),
  persistStoredUser: jest.fn(),
}));

jest.mock("@/src/store/useAuthStore", () => ({
  setAuthToken: jest.fn(),
}));

describe("Login screen", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockReplace.mockReset();
    jest.clearAllMocks();
  });

  it("shows a validation alert when form is empty", () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(jest.fn());

    const Wrapper = ({ children }: { children: ReactNode }) => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 44, bottom: 34, left: 0, right: 0 },
        }}
      >
        {children}
      </SafeAreaProvider>
    );

    render(<LoginScreen />, { wrapper: Wrapper });
    fireEvent.press(screen.getByText("Se connecter"));

    expect(alertSpy).toHaveBeenCalledWith(
      "Oups",
      expect.stringContaining("remplir")
    );
    expect(mockReplace).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });
});
