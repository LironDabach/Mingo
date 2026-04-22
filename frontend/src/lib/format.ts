export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatDateOnly(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export function formatRelativeMeeting(value: string) {
  const meetingDate = new Date(value);
  const now = new Date();
  const diffMs = meetingDate.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `Today, ${formatTime(value)}`;
  }
  if (diffDays === 1) {
    return `Tomorrow, ${formatTime(value)}`;
  }
  if (diffDays > 1 && diffDays < 7) {
    return `${meetingDate.toLocaleDateString("en-GB", { weekday: "long" })}, ${formatTime(value)}`;
  }
  return formatDateTime(value);
}

export function formatDuration(minutes?: number) {
  if (!minutes) {
    return "Not recorded";
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!rest) {
    return `${hours}h`;
  }
  return `${hours}h ${rest}m`;
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeStyle: "short",
  }).format(new Date(value));
}
