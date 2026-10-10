export interface AllowlistEntry {
  id: string;
  reason: string;
  issue: number;
}

export interface AuditReport {
  vulnerabilities: Record<string, { via: (string | { severity: string; url: string })[] }>;
}

export function findBlocking(
  report: AuditReport,
  allowlist: AllowlistEntry[],
): { blocking: string[]; stale: string[] };
