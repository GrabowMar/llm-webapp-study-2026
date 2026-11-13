export type Severity = "sev1" | "sev2" | "sev3" | "sev4";

export interface Incident {
  id: number;
  title: string;
  service: string;
  severity: Severity;
  status: string;
  commander: string | null;
  impact_summary: string | null;
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

export interface IncidentList {
  items: Incident[];
  total: number;
  page: number;
  page_size: number;
}

export interface PublicStats {
  open_total: number;
  open_by_severity: Record<Severity, number>;
  sla_breached_open: number;
  resolved_last_30_days: number;
}
