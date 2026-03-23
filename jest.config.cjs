/** @type {import("jest").Config} */
module.exports = {
  preset: "jest-expo",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.spec.ts", "**/*.spec.tsx", "**/*.test.ts"],
  setupFilesAfterEnv: ["<rootDir>/tests/jest/setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  clearMocks: true,
};
