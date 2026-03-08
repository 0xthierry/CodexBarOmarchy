interface RuntimeCommandResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

interface RuntimeCommandRunOptions {
  input?: string;
  timeoutMs?: number;
}

interface RuntimeCommandRunner {
  run: (
    command: string,
    args: string[],
    options?: RuntimeCommandRunOptions,
  ) => Promise<RuntimeCommandResult>;
  which: (command: string) => Promise<string | null>;
}

interface RuntimeFileSystem {
  fileExists: (path: string) => Promise<boolean>;
  readTextFile: (path: string) => Promise<string>;
}

interface RuntimeHost {
  commands: RuntimeCommandRunner;
  env: Record<string, string | undefined>;
  fileSystem: RuntimeFileSystem;
  homeDirectory: string;
  now: () => Date;
  openPath: (path: string) => Promise<void>;
  spawnTerminal: (command: string, args: string[]) => Promise<void>;
}

export {
  type RuntimeCommandResult,
  type RuntimeCommandRunOptions,
  type RuntimeCommandRunner,
  type RuntimeFileSystem,
  type RuntimeHost,
};
