import nextJest from "next/jest.js";
import type { Config } from "jest";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  testEnvironment: "jsdom",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^fabric$": "<rootDir>/src/__mocks__/fabric.ts",
    "^pptxgenjs$": "<rootDir>/src/__mocks__/pptxgenjs.ts",
  },
  testMatch: ["<rootDir>/src/__tests__/**/*.test.{ts,tsx}"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
};

export default createJestConfig(config);
