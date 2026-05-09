import js from "@eslint/js";
import globals from "globals";
import solid from "eslint-plugin-solid";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist", "coverage", "node_modules"]
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  solid.configs["flat/typescript"],
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      },
      globals: {
        ...globals.browser,
        ...globals.serviceworker
      }
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-unnecessary-condition": "warn",
      "solid/reactivity": "warn"
    }
  }
);
