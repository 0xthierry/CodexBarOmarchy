import type { OmarchyBarBridge } from "@/shell/bridge.ts";

declare global {
  interface Window {
    omarchyBar: OmarchyBarBridge;
  }
}
