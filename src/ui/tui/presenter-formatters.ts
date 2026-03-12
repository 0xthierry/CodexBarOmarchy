const truncate = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= 3) {
    return value.slice(0, maxLength);
  }

  return `${value.slice(0, maxLength - 3)}...`;
};

const humanizeValue = (value: string): string => {
  const normalizedValue = value.trim().toLowerCase();

  if (normalizedValue === "oauth") {
    return "OAuth";
  }

  if (normalizedValue === "cli") {
    return "CLI";
  }

  if (normalizedValue === "api") {
    return "API";
  }

  if (normalizedValue === "web") {
    return "Web";
  }

  if (normalizedValue === "on") {
    return "On";
  }

  if (normalizedValue === "off") {
    return "Off";
  }

  if (normalizedValue === "auto") {
    return "Auto";
  }

  if (normalizedValue === "manual") {
    return "Manual";
  }

  if (normalizedValue === "run") {
    return "Run";
  }

  if (normalizedValue === "ready") {
    return "Ready";
  }

  if (normalizedValue === "idle") {
    return "Idle";
  }

  if (normalizedValue === "refreshing") {
    return "Refreshing";
  }

  if (normalizedValue === "error") {
    return "Error";
  }

  if (normalizedValue === "none") {
    return "None";
  }

  return value;
};

export { humanizeValue, truncate };
