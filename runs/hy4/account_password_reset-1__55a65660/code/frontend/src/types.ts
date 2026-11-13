export type Account = {
  id: number;
  username: string;
  email: string | null;
};

export type OutboxMessage = {
  id: number;
  to: string;
  subject: string;
  body: string;
  sent_at: string;
};
