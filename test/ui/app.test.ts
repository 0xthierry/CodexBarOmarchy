import { expect, test } from "bun:test";
import { createDefaultConfig } from "@/core/config/schema.ts";
import { createAppStoreState } from "@/core/store/state.ts";
import { renderAppMarkup } from "@/ui/app.ts";

test("renders only enabled providers in the top switcher", () => {
  const config = createDefaultConfig();

  config.providers.claude.enabled = false;

  const html = renderAppMarkup(createAppStoreState(config));

  expect(html).toContain('data-select-provider="codex"');
  expect(html).toContain('data-select-provider="gemini"');
  expect(html).not.toContain('data-select-provider="claude"');
});

test("renders codex cookie controls only when extras and manual mode are enabled", () => {
  const config = createDefaultConfig();

  config.providers.claude.enabled = false;
  config.providers.codex.cookieHeader = "Cookie: session=test";
  config.providers.codex.cookieSource = "manual";
  config.providers.codex.extrasEnabled = true;

  const html = renderAppMarkup(createAppStoreState(config));

  expect(html).toContain("OpenAI cookies");
  expect(html).toContain("Manual cookie header");
});

test("renders an empty state when every provider is disabled", () => {
  const config = createDefaultConfig();

  config.providers.claude.enabled = false;
  config.providers.codex.enabled = false;
  config.providers.gemini.enabled = false;

  const html = renderAppMarkup(createAppStoreState(config));

  expect(html).toContain("No enabled providers.");
  expect(html).not.toContain('data-select-provider="codex"');
  expect(html).not.toContain('data-select-provider="claude"');
  expect(html).not.toContain('data-select-provider="gemini"');
});
