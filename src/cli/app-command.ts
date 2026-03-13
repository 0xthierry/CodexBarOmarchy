const appCommandNames = ["stats", "tray", "tui"] as const;

type AppCommandName = (typeof appCommandNames)[number];
const appCommandNameSet = new Set<string>(appCommandNames);

const isEntryModuleArgument = (value: string | undefined): boolean =>
  typeof value === "string" &&
  (value.endsWith(".ts") || value.endsWith(".js") || value.startsWith("/$bunfs/"));

const resolveAppCommandArgs = (argv: string[]): string[] => {
  if (argv.length <= 1) {
    return [];
  }

  return isEntryModuleArgument(argv[1]) ? argv.slice(2) : argv.slice(1);
};

const isAppCommandName = (value: string | undefined): value is AppCommandName =>
  typeof value === "string" && appCommandNameSet.has(value);

const parseAppCommandName = (argv: string[]): AppCommandName | null => {
  const [commandName] = resolveAppCommandArgs(argv);
  return isAppCommandName(commandName) ? commandName : null;
};

export {
  appCommandNames,
  isAppCommandName,
  parseAppCommandName,
  resolveAppCommandArgs,
  type AppCommandName,
};
