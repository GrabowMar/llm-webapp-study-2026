export interface NoteSummary {
  id: number;
  title: string;
  published: boolean;
  updated_at: string;
}

export interface Note {
  id: number;
  title: string;
  body: string;
  published: boolean;
  updated_at: string;
  author: string;
}

export interface PublicNote {
  id: number;
  title: string;
  published: boolean;
  updated_at: string;
  author: string;
}
