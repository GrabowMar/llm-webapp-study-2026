export type Status = "trial" | "active" | "past_due" | "cancelled";

export interface Subscription {
  id: number;
  customer_name: string;
  plan: string;
  monthly_amount: number;
  renewal_date: string;
  status: Status;
  failed_payment_count: number;
  created_at: string;
}

export interface Invoice {
  id: number;
  subscription_id: number;
  amount_due: number;
  due_date: string;
  status: string;
  paid_at: string | null;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface Stats {
  mrr: number;
  counts: Record<Status, number>;
}
