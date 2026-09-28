import { apiFetch } from "./api";

// Values must match the Report model's reason enum on the server.
export const REPORT_REASONS = [
  { value: "harassment", label: "Harassment or bullying" },
  { value: "hate_speech", label: "Hate speech" },
  { value: "inappropriate_content", label: "Sexual or inappropriate content" },
  { value: "spam", label: "Spam or scam" },
  { value: "other", label: "Something else" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["value"];
export type ReportTarget = { type: "user" | "message"; id: string; name: string };

export async function setUserBlocked(userId: string, blocked: boolean): Promise<void> {
  const res = await apiFetch(`/api/users/${userId}/block`, { method: blocked ? "POST" : "DELETE" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// Resolves to "submitted", or "duplicate" if the user already has an open
// report for this target (the server returns 409).
export async function submitReport(
  target: ReportTarget,
  reason: ReportReason,
  details: string
): Promise<"submitted" | "duplicate"> {
  const res = await apiFetch("/api/reports", {
    method: "POST",
    body: JSON.stringify({ targetType: target.type, targetId: target.id, reason, details }),
  });
  if (res.status === 409) return "duplicate";
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return "submitted";
}

export const REASON_LABEL: Record<string, string> = Object.fromEntries(
  REPORT_REASONS.map((r) => [r.value, r.label])
);

// Labels for entries in a user's moderation history (admin views).
export const ACTION_LABEL: Record<string, string> = {
  removed_message: "Message removed",
  warned: "Warned",
  muted: "Muted",
  banned: "Banned",
  unmuted: "Unmuted",
  unbanned: "Unbanned",
};

export function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
