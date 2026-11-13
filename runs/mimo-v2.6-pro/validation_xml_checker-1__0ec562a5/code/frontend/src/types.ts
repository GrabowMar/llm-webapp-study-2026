export type CheckResult = {
  valid: boolean;
  error: string | null;
  line: number | null;
  column: number | null;
  root_element: string | null;
};

export type SavedCheck = CheckResult & {
  id: number;
  xml_preview: string;
  created_at: string;
};

export type SavedPage = {
  items: SavedCheck[];
  total: number;
  page: number;
  page_size: number;
};

export type Session = {
  token: string;
  username: string;
};
