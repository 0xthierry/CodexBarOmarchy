const formatPaceStatusText = (input: {
  daysRemaining: number | null;
  windowLabel: string;
}): string => {
  if (input.daysRemaining === null) {
    return `${input.windowLabel}: pace unavailable`;
  }

  return `${input.windowLabel}: ~${input.daysRemaining.toFixed(1)}d remaining at current pace`;
};

export { formatPaceStatusText };
