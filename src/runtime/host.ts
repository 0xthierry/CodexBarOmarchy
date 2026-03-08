interface RuntimeCommandResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

interface RuntimeCommandLineSession {
  close: () => Promise<void>;
  readLine: (options?: { timeoutMs?: number }) => Promise<string | null>;
  writeLine: (line: string) => Promise<void>;
}

interface RuntimeHttpRequestOptions {
  body?: string;
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  timeoutMs?: number;
}

interface RuntimeHttpResponse {
  bodyText: string;
  headers: Record<string, string>;
  statusCode: number;
}

interface RuntimeHttpClient {
  request: (url: string, options?: RuntimeHttpRequestOptions) => Promise<RuntimeHttpResponse>;
}

interface RuntimeCommandRunOptions {
  input?: string;
  timeoutMs?: number;
}

interface RuntimeCommandRunner {
  createLineSession: (
    command: string,
    args: string[],
  ) => Promise<RuntimeCommandLineSession>;
  run: (
    command: string,
    args: string[],
    options?: RuntimeCommandRunOptions,
  ) => Promise<RuntimeCommandResult>;
  which: (command: string) => Promise<string | null>;
}

interface RuntimeFileSystem {
  fileExists: (path: string) => Promise<boolean>;
  realPath: (path: string) => Promise<string>;
  readTextFile: (path: string) => Promise<string>;
  writeTextFile: (path: string, contents: string) => Promise<void>;
}

interface RuntimeHost {
  commands: RuntimeCommandRunner;
  env: Record<string, string | undefined>;
  fileSystem: RuntimeFileSystem;
  homeDirectory: string;
  http: RuntimeHttpClient;
  now: () => Date;
  openPath: (path: string) => Promise<void>;
  spawnTerminal: (command: string, args: string[]) => Promise<void>;
}

export {
  type RuntimeCommandLineSession,
  type RuntimeCommandResult,
  type RuntimeCommandRunOptions,
  type RuntimeCommandRunner,
  type RuntimeFileSystem,
  type RuntimeHost,
  type RuntimeHttpClient,
  type RuntimeHttpRequestOptions,
  type RuntimeHttpResponse,
};
