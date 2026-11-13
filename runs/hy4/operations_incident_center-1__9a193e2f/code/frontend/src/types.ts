export interface Incident {
  id: number;
  title: string;
  service: string;
  severity: string;
  status: string;
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

export interface IncidentPage {
  items: Incident[];
  total: number;
  page: number;
  page_size: number;
}

export interface TimelinePage {
  items: TimelineEvent[];
}

export interface Stats {
  open_total: number;
  open_by_severity: Record<string, number>;
  sla_breached_open: number;
  resolved_last_30_days: number;
}

export interface AuthResult {
  token: string;
  username?: string;
  id?: number;
}
