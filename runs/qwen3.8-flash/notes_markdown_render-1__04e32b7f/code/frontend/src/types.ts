export interface NoteSummary {
  id: number;
  title: string;
  published: boolean;
  updated_at: string;
  author?: string;
}

export interface Note extends NoteSummary {
  body: string;
  author: string;
}
