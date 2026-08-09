// SPRINT-1: shared flat ESLint config for all workspaces
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/generated/**"],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Prefer reading env via @harolds/config — avoid scattered process.env access
      "no-restricted-properties": [
        "warn",
        {
          object: "process",
          property: "env",
          message:
            "Read environment via @harolds/config (env.ts). Direct process.env access is reserved for bootstrap.",
        },
      ],
    },
  },
);
