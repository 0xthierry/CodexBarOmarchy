import { expect, test } from "bun:test";
import { createDefaultConfig } from "@/core/config/schema.ts";
import { createAppStoreState, getProviderView } from "@/core/store/state.ts";

test("provider views expose the settings and action surface required by the spec", () => {
  const config = createDefaultConfig();
  const state = createAppStoreState(config);
  const claudeView = getProviderView(config, "claude");
  const codexView = getProviderView(config, "codex");
  const geminiView = getProviderView(config, "gemini");

  if (claudeView.id !== "claude") {
    throw new TypeError("Expected the Claude provider view.");
  }

  if (codexView.id !== "codex") {
    throw new TypeError("Expected the Codex provider view.");
  }

  if (geminiView.id !== "gemini") {
    throw new TypeError("Expected the Gemini provider view.");
  }

  expect(state.providerViews.map(({ id }) => id)).toEqual(["codex", "claude", "gemini"]);

  expect(codexView.actions).toEqual({
    login: {
      actionName: "login",
      supported: true,
    },
    refresh: {
      actionName: "refresh",
      supported: true,
    },
    repair: {
      actionName: "repair",
      supported: false,
    },
  });
  expect(codexView.settings.availableCookieSources).toEqual(["auto", "manual", "off"]);
  expect(codexView.settings.availableUsageSources).toEqual(["auto", "oauth", "cli"]);

  expect(claudeView.actions).toEqual({
    login: {
      actionName: "login",
      supported: true,
    },
    refresh: {
      actionName: "refresh",
      supported: true,
    },
    repair: {
      actionName: "repair",
      supported: true,
    },
  });
  expect(claudeView.settings.availableCookieSources).toEqual(["auto", "manual"]);
  expect(claudeView.settings.availablePromptPolicies).toEqual([
    "never_prompt",
    "only_on_user_action",
    "always_allow_prompts",
  ]);
  expect(claudeView.settings.availableUsageSources).toEqual(["auto", "oauth", "web", "cli"]);

  expect(geminiView.actions).toEqual({
    login: {
      actionName: "login",
      supported: true,
    },
    refresh: {
      actionName: "refresh",
      supported: true,
    },
    repair: {
      actionName: "repair",
      supported: false,
    },
  });
  expect(geminiView.settings).toEqual({});
});
