import { mountPopupApp } from "@/ui/app.ts";
import type { OmarchyBarBridge } from "@/shell/bridge.ts";

const rootElement = document.querySelector<HTMLElement>("#app");

if (!(rootElement instanceof HTMLElement)) {
  throw new Error("Missing popup root element.");
}

const omarchyBarBridge = (
  globalThis as typeof globalThis & { omarchyBar: OmarchyBarBridge }
)["omarchyBar"];

mountPopupApp(rootElement, omarchyBarBridge).catch((error: unknown) => {
  console.error("Failed to mount the popup UI.", error);
});
