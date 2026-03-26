/* eslint-env jest */
import { fireEvent, render, screen } from "@testing-library/react-native";
import PublicHome from "@/app/(auth)/index";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe("PublicHome screen", () => {
  beforeEach(() => {
    mockPush.mockReset();
  });

  it("navigates to login and register actions", () => {
    render(<PublicHome />);

    fireEvent.press(screen.getByText("Se connecter"));
    expect(mockPush).toHaveBeenCalledWith("/login");

    fireEvent.press(screen.getByText(/compte/i));
    expect(mockPush).toHaveBeenCalledWith("/register");
  });
});
