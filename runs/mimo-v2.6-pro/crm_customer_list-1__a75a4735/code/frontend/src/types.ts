export type InteractionKind = "call" | "email" | "meeting";

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
  kind: InteractionKind;
  summary: string;
  occurred_at: string;
  logged_by: string;
}

export interface CustomerList {
  items: Customer[];
  total: number;
  page: number;
  page_size: number;
}

export interface CustomerPayload {
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  notes?: string | null;
}

export interface InteractionPayload {
  kind: string;
  summary: string;
  occurred_at?: string;
}
