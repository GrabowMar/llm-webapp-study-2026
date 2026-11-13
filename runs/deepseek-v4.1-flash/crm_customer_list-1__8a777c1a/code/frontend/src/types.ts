export interface Customer {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
  created_at: string;
  interaction_count: number;
  last_contacted_at: string | null;
}

export interface Interaction {
  id: number;
  customer_id: number;
  kind: string;
  summary: string;
  occurred_at: string;
  logged_by: string;
}

export interface CustomerPage {
  items: Customer[];
  total: number;
  page: number;
  page_size: number;
}

export interface InteractionList {
  items: Interaction[];
}

export interface ApiErrorBody {
  error?: string;
  message?: string;
  errors?: Record<string, string>;
}

export interface CustomerInput {
  name: string;
  email: string;
  phone: string;
  company: string;
  notes: string;
}

export interface InteractionInput {
  kind: string;
  summary: string;
  occurred_at: string;
}
