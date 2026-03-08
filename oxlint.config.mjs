import { defineConfig } from "oxlint";

export default defineConfig({
  ignorePatterns: [".repositories/**", "ai_docs/**", "node_modules/**", "dist/**", "coverage/**"],
});
