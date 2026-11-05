// Strenges Linting (npm run lint). Regeln gelten als Fehler, nicht als Warnung: CI bricht ab.
import js from "@eslint/js";
import globals from "globals";

const strict = {
  "no-unused-vars": ["error", { args: "after-used", argsIgnorePattern: "^_", caughtErrors: "none", ignoreRestSiblings: true }],
  "no-undef": "error",
  "no-empty": ["error", { allowEmptyCatch: true }],
  "no-var": "error",
  "prefer-const": ["error", { destructuring: "all" }],
  eqeqeq: ["error", "always", { null: "ignore" }],
  "no-implicit-globals": "error",
  "no-shadow": ["error", { builtinGlobals: false, hoist: "functions" }],
  "no-use-before-define": ["error", { functions: false, classes: true, variables: false }],
  "no-eval": "error", "no-implied-eval": "error", "no-new-func": "error",
  "no-throw-literal": "error",
  "no-self-compare": "error",
  "no-unmodified-loop-condition": "error",
  "no-unreachable-loop": "error",
  "no-constant-binary-expression": "error",
  "no-promise-executor-return": "error",
  "no-template-curly-in-string": "error",
  "no-duplicate-imports": "error",
  "no-useless-rename": "error",
  "no-useless-return": "error",
  "no-lone-blocks": "error",
  "no-new-wrappers": "error",
  "no-proto": "error",
  "no-extend-native": "error",
  "no-caller": "error",
  "no-octal-escape": "error",
  "no-sequences": ["error", { allowInParentheses: true }],
  radix: "error",
  "array-callback-return": ["error", { allowImplicit: true }],
  "default-param-last": "error",
  "require-atomic-updates": "off",
};

export default [
  { ignores: ["node_modules/**", "vendor/**", "test-results/**", "supabase/functions/**", "**/*.min.js"] },
  js.configs.recommended,
  {
    files: ["js/**/*.js", "sw.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: { ...globals.browser } },
    rules: strict,
  },
  { files: ["sw.js"], languageOptions: { sourceType: "script", globals: { ...globals.serviceworker } } },
  {
    files: ["tools/**/*.mjs", "tests/**/*.mjs", "eslint.config.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: { ...globals.node, ...globals.browser } },
    rules: strict,
  },
  { files: ["tests/e2e/mockpeer.js"], languageOptions: { sourceType: "script", globals: { ...globals.browser } }, rules: strict },
];
