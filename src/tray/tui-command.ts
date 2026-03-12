import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface TrayLaunchTarget {
  args: string[];
  command: string;
}

const resolveRepoRootFromModuleUrl = (moduleUrl: string): string =>
  resolve(dirname(fileURLToPath(moduleUrl)), "..", "..");

const createRepoLocalTuiLaunchTarget = (moduleUrl = import.meta.url): TrayLaunchTarget => ({
  args: ["run", "--cwd", resolveRepoRootFromModuleUrl(moduleUrl), "tui"],
  command: "bun",
});

export { createRepoLocalTuiLaunchTarget, resolveRepoRootFromModuleUrl, type TrayLaunchTarget };
