import { appCommandNames, parseAppCommandName, resolveAppCommandArgs } from "@/cli/app-command.ts";
import { runStatsCommand } from "@/cli/stats.ts";
import { runTrayCommand } from "@/tray/main.ts";
import { runProductionTui } from "@/ui/tui/main.ts";

const createUsageText = (): string => `Usage: omarchy-agent-bar <${appCommandNames.join("|")}>\n`;

const runAppCommand = async (argv = process.argv): Promise<number> => {
  const commandName = parseAppCommandName(argv);

  if (commandName === null) {
    const [unknownCommandName] = resolveAppCommandArgs(argv);
    const usageText = createUsageText();

    process.stderr.write(
      unknownCommandName === undefined
        ? usageText
        : `Unknown command '${unknownCommandName}'.\n${usageText}`,
    );
    return 1;
  }

  if (commandName === "stats") {
    await runStatsCommand();
    return 0;
  }

  if (commandName === "tray") {
    await runTrayCommand();
    return 0;
  }

  await runProductionTui();
  return 0;
};

if (import.meta.main) {
  process.exit(await runAppCommand());
}

export { createUsageText, runAppCommand };
