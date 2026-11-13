export interface Account {
  username: string;
  balance: number;
}

export type TransferDirection = "in" | "out";

export interface Transfer {
  id: number;
  from_username: string;
  to_username: string;
  amount: number;
  memo: string;
  created_at: string;
  direction: TransferDirection;
}

export interface TransferPage {
  items: Transfer[];
  total: number;
  page: number;
  page_size: number;
}

export interface Session {
  token: string;
  csrf_token: string;
  username: string;
}
