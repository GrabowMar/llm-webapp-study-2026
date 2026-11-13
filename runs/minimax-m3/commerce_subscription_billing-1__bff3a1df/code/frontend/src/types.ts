export type SubscriptionStatus = "active" | "trial" | "past_due" | "cancelled";

export type Subscription = {
  id: number;
  customer_name: string;
  plan: string;
  monthly_amount: number;
  renewal_date: string;
  status: SubscriptionStatus;
  failed_payment_count: number;
  created_at: string;
};

export type Invoice = {
  id: number;
  subscription_id: number;
  amount_due: number;
  due_date: string;
  status: string;
  paid_at: string | null;
};

export type PublicStats = {
  mrr: number;
  counts: Record<string, number>;
};

export type SubscriptionPage = {
  items: Subscription[];
  total: number;
  page: number;
  page_size: number;
};
export type Account = {
  id: number;
  username: string;
  created_at?: string;
};

export type SubscriptionInput = {
  customer_name: string;
  plan: string;
  monthly_amount: number;
  renewal_date: string;
  status?: SubscriptionStatus;
};

export const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  trial: "Trial",
  past_due: "Past due",
  cancelled: "Cancelled",
};

export const STATUS_ORDER: SubscriptionStatus[] = ["active", "trial", "past_due", "cancelled"];
