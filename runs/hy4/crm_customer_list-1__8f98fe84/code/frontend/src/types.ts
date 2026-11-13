export interface Customer {
  id: number;
  name: string;
  email: string;
  phone: string;
  company: string;
  notes: string;
  created_at: string;
  interaction_count: number;
  last_contacted_at: string | null;
}

export interface Interaction {
  id: number;
  customer_id: number;
  kind: "call" | "email" | "meeting" | string;
  summary: string;
  occurred_at: string;
  logged_by: string;
}

export interface CustomerListResponse {
  items: Customer[];
  total: number;
  page: number;
  page_size: number;
}

export interface InteractionListResponse {
  items: Interaction[];
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
  occurred_at?: string;
}

export interface FieldErrors {
  [field: string]: string;
}
