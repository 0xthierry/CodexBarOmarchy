interface ClaudeWebSessionSnapshot {
  accountEmail: string | null;
  organizationId: string;
  organizationName: string | null;
  rateLimitTier: string | null;
  sessionToken: string;
}

export { type ClaudeWebSessionSnapshot };
