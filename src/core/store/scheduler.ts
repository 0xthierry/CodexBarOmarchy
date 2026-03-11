const defaultRefreshSchedulerIntervalMs = 300_000;
const minimumRefreshSchedulerIntervalMs = 300_000;

const normalizeRefreshSchedulerIntervalMs = (intervalMs: number): number => {
  if (!Number.isFinite(intervalMs)) {
    return defaultRefreshSchedulerIntervalMs;
  }

  const normalizedIntervalMs = Math.trunc(intervalMs);

  if (normalizedIntervalMs < minimumRefreshSchedulerIntervalMs) {
    return minimumRefreshSchedulerIntervalMs;
  }

  return normalizedIntervalMs;
};

export {
  defaultRefreshSchedulerIntervalMs,
  minimumRefreshSchedulerIntervalMs,
  normalizeRefreshSchedulerIntervalMs,
};
