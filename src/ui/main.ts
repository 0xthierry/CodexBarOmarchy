import { mountPopupApp } from "@/ui/app.ts";

const rootElement = document.querySelector<HTMLElement>("#app");

if (!(rootElement instanceof HTMLElement)) {
  throw new Error("Missing popup root element.");
}

await mountPopupApp(rootElement, globalThis.window.omarchyBar);
