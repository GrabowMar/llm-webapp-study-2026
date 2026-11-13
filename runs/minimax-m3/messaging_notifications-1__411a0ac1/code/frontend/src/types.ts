export type User = {
  id: number;
  username: string;
  is_admin: boolean;
};

export type Notification = {
  id: number;
  message: string;
  type: string;
  read: boolean;
  created_at: string;
};

export type NotificationPage = {
  items: Notification[];
  total: number;
  page: number;
  page_size: number;
  unread_count: number;
};

export type Session = {
  token: string;
  user: User;
};

export type ReadFilter = "all" | "read" | "unread";
