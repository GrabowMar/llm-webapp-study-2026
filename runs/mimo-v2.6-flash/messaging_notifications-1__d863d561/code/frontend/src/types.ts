export type Notification = {
  id: number;
  message: string;
  type: string;
  read: boolean;
  created_at: string;
};

export type NotificationList = {
  items: Notification[];
  total: number;
  page: number;
  page_size: number;
  unread_count: number;
};

export type Session = {
  username: string;
  is_admin: boolean;
};
