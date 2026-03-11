interface CodexWebAuthSession {
  accessToken: string;
  accountEmail: string | null;
  accountId: string | null;
  cookieHeader: string;
}

export { type CodexWebAuthSession };
