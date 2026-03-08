import { defineConfig } from "oxlint";

export default defineConfig({
  categories: {
    correctness: "error",
    suspicious: "error",
    pedantic: "error",
    perf: "error",
    style: "error",
    restriction: "error",
  },
  ignorePatterns: [".repositories/**", "ai_docs/**", "node_modules/**", "dist/**", "coverage/**"],
  plugins: ["import", "promise", "typescript", "unicorn"],
  rules: {
    "import/no-default-export": "off",
    "import/no-named-export": "off",
    "import/prefer-default-export": "off",
    "typescript/no-explicit-any": "error",
    "typescript/no-non-null-assertion": "error",
    "typescript/no-require-imports": "error",
    "typescript/no-unsafe-declaration-merging": "error",
    "unicorn/prefer-module": "error",
    "unicorn/prefer-node-protocol": "error",
  },
});
