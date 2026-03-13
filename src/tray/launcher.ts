import type { RuntimeCommandResult } from "@/runtime/host.ts";
import { trayTuiAppId } from "@/tray/constants.ts";
import { createDefaultTuiLaunchTarget } from "@/tray/tui-command.ts";
import type { TrayLaunchTarget } from "@/tray/tui-command.ts";

interface TrayLauncherHost {
  runCommand: (command: string, args: string[]) => Promise<RuntimeCommandResult>;
  spawnDetached: (command: string, args: string[]) => Promise<void>;
  whichCommand: (command: string) => Promise<string | null>;
}

interface HyprlandClientRecord {
  address: string | null;
  className: string | null;
  initialClassName: string | null;
  title: string | null;
}

interface TrayCommandSpec {
  args: string[];
  command: string;
}

interface FocusTrayActivationPlan {
  address: string;
  kind: "focus";
}

interface LaunchTrayActivationPlan {
  kind: "launch";
  launchCommand: TrayCommandSpec;
}

type TrayActivationPlan = FocusTrayActivationPlan | LaunchTrayActivationPlan;

const normalizeMatchValue = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim().toLowerCase();
  return normalizedValue === "" ? null : normalizedValue;
};

const matchesWindowPattern = (value: string | null, pattern: string): boolean => {
  const normalizedValue = normalizeMatchValue(value);
  return normalizedValue !== null && normalizedValue.includes(pattern.toLowerCase());
};

const readOptionalString = (value: unknown, key: string): string | null => {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const fieldValue = Reflect.get(value, key);

  return typeof fieldValue === "string" ? fieldValue : null;
};

const parseHyprlandClientsJson = (stdout: string): HyprlandClientRecord[] => {
  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(stdout);
  } catch {
    throw new Error("Failed to parse `hyprctl clients -j` output as JSON.");
  }

  if (!Array.isArray(parsedValue)) {
    throw new TypeError("Expected `hyprctl clients -j` to return a JSON array.");
  }

  return parsedValue.map(
    (entry): HyprlandClientRecord => ({
      address: readOptionalString(entry, "address"),
      className: readOptionalString(entry, "class"),
      initialClassName: readOptionalString(entry, "initialClass"),
      title: readOptionalString(entry, "title"),
    }),
  );
};

const findMatchingHyprlandClientAddress = (
  clients: HyprlandClientRecord[],
  pattern = trayTuiAppId,
): string | null => {
  for (const client of clients) {
    if (
      matchesWindowPattern(client.className, pattern) ||
      matchesWindowPattern(client.initialClassName, pattern)
    ) {
      return client.address;
    }
  }

  for (const client of clients) {
    if (matchesWindowPattern(client.title, pattern)) {
      return client.address;
    }
  }

  return null;
};

const ensureCommandAvailable = async (host: TrayLauncherHost, command: string): Promise<void> => {
  const resolvedPath = await host.whichCommand(command);

  if (resolvedPath === null) {
    throw new Error(`Required command '${command}' is not available on PATH.`);
  }
};

const runRequiredCommand = async (
  host: TrayLauncherHost,
  command: string,
  args: string[],
): Promise<RuntimeCommandResult> => {
  const result = await host.runCommand(command, args);

  if (result.exitCode !== 0) {
    const trimmedStderr = result.stderr.trim();
    const detail = trimmedStderr === "" ? "Command failed without stderr output." : trimmedStderr;
    throw new Error(`Command '${command} ${args.join(" ")}' failed. ${detail}`);
  }

  return result;
};

const createOmarchyTerminalLaunchCommand = (
  target: TrayLaunchTarget,
  appId = trayTuiAppId,
): TrayCommandSpec => ({
  args: ["--", "xdg-terminal-exec", `--app-id=${appId}`, "-e", target.command, ...target.args],
  command: "uwsm-app",
});

const planTrayActivation = (
  clients: HyprlandClientRecord[],
  options: {
    appId?: string;
    launchTarget?: TrayLaunchTarget;
  } = {},
): TrayActivationPlan => {
  const appId = options.appId ?? trayTuiAppId;
  const launchTarget = options.launchTarget ?? createDefaultTuiLaunchTarget();
  const matchingAddress = findMatchingHyprlandClientAddress(clients, appId);

  if (matchingAddress !== null) {
    return {
      address: matchingAddress,
      kind: "focus",
    };
  }

  return {
    kind: "launch",
    launchCommand: createOmarchyTerminalLaunchCommand(launchTarget, appId),
  };
};

const executeTrayActivationPlan = async (
  host: TrayLauncherHost,
  plan: TrayActivationPlan,
): Promise<void> => {
  if (plan.kind === "focus") {
    await runRequiredCommand(host, "hyprctl", [
      "dispatch",
      "focuswindow",
      `address:${plan.address}`,
    ]);
    return;
  }

  await ensureCommandAvailable(host, "uwsm-app");
  await ensureCommandAvailable(host, "xdg-terminal-exec");
  await ensureCommandAvailable(host, plan.launchCommand.command);

  await host.spawnDetached(plan.launchCommand.command, plan.launchCommand.args);
};

const activateTrayTui = async (
  host: TrayLauncherHost,
  options: {
    appId?: string;
    launchTarget?: TrayLaunchTarget;
  } = {},
): Promise<void> => {
  const appId = options.appId ?? trayTuiAppId;
  const launchTarget = options.launchTarget ?? createDefaultTuiLaunchTarget();

  await ensureCommandAvailable(host, "hyprctl");

  const clientsResult = await runRequiredCommand(host, "hyprctl", ["clients", "-j"]);
  const plan = planTrayActivation(parseHyprlandClientsJson(clientsResult.stdout), {
    appId,
    launchTarget,
  });

  await executeTrayActivationPlan(host, plan);
};

export {
  activateTrayTui,
  createOmarchyTerminalLaunchCommand,
  parseHyprlandClientsJson,
  planTrayActivation,
  type HyprlandClientRecord,
  type TrayActivationPlan,
  type TrayLauncherHost,
};
