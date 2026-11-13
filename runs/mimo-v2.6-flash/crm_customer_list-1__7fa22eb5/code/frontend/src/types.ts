export type Customer = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  notes: string | null;
  created_at: string;
  interaction_count: number;
  last_contacted_at: string | null;
};

export type Interaction = {
  id: number;
  customer_id: number;
  kind: string;
  summary: string;
  occurred_at: string;
  logged_by: string;
};

export type CustomerPage = {
  items: Customer[];
  total: number;
  page: number;
  page_size: number;
};

export type CustomerPayload = {
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  notes?: string | null;
};

export type InteractionKind = "call" | "email" | "meeting";
