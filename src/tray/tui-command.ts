import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface TrayLaunchTarget {
  args: string[];
  command: string;
}

const resolveRepoRootFromModuleUrl = (moduleUrl: string): string =>
  resolve(dirname(fileURLToPath(moduleUrl)), "..", "..");

const isSourceEntryArgument = (value: string | undefined): boolean =>
  typeof value === "string" && (value.endsWith(".ts") || value.endsWith(".js"));

const createRepoLocalTuiLaunchTarget = (moduleUrl = import.meta.url): TrayLaunchTarget => ({
  args: ["run", "--cwd", resolveRepoRootFromModuleUrl(moduleUrl), "app", "tui"],
  command: "bun",
});

const createInstalledTuiLaunchTarget = (executablePath = process.execPath): TrayLaunchTarget => ({
  args: ["tui"],
  command: executablePath,
});

const createDefaultTuiLaunchTarget = (
  options: {
    argv?: string[];
    executablePath?: string;
    moduleUrl?: string;
  } = {},
): TrayLaunchTarget => {
  const argv = options.argv ?? process.argv;

  if (isSourceEntryArgument(argv[1])) {
    return createRepoLocalTuiLaunchTarget(options.moduleUrl);
  }

  return createInstalledTuiLaunchTarget(options.executablePath);
};

export {
  createDefaultTuiLaunchTarget,
  createInstalledTuiLaunchTarget,
  createRepoLocalTuiLaunchTarget,
  resolveRepoRootFromModuleUrl,
  type TrayLaunchTarget,
};
