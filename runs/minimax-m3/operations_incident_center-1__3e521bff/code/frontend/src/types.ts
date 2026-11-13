export type Severity = "sev1" | "sev2" | "sev3" | "sev4";

export type IncidentStatus =
  | "investigating"
  | "identified"
  | "monitoring"
  | "resolved"
  | "open"
  | "closed";

export interface Incident {
  id: number;
  title: string;
  service: string;
  severity: Severity;
  status: IncidentStatus;
  commander: string;
  impact_summary: string;
  opened_at: string;
  resolved_at: string | null;
  reopen_count: number;
  opened_by: string;
  sla_due_at: string;
  sla_breached: boolean;
}

export interface TimelineEvent {
  id: number;
  type: string;
  message: string;
  created_at: string;
  author: string;
}

export interface IncidentListResponse {
  items: Incident[];
  total: number;
  page: number;
  page_size: number;
}

export interface TimelineResponse {
  items: TimelineEvent[];
}

export interface PublicStats {
  open_total: number;
  open_by_severity: Record<Severity, number>;
  sla_breached_open: number;
  resolved_last_30_days: number;
}

export const SEVERITIES: Severity[] = ["sev1", "sev2", "sev3", "sev4"];

export const STATUSES: IncidentStatus[] = [
  "investigating",
  "identified",
  "monitoring",
  "resolved",
];

export const SLA_TARGET_MINUTES: Record<Severity, number> = {
  sev1: 60,
  sev2: 240,
  sev3: 1440,
  sev4: 4320,
};
