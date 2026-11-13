export interface Post {
  id: number;
  title: string;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  author: string;
  excerpt: string;
  taken_down?: boolean;
}

export interface PostList {
  items: Post[];
  total: number;
  page: number;
  page_size: number;
}

export interface Session {
  token: string;
  username: string;
  isAdmin: boolean;
}

export interface ApiErrorBody {
  error?: string;
  message?: string;
  errors?: Record<string, string>;
}

export class ApiError extends Error {
  status: number;
  body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message || body.error || `Request failed (${status})`);
    this.status = status;
    this.body = body;
  }

  get fieldErrors(): Record<string, string> {
    return this.body.errors || {};
  }

  get allMessages(): string[] {
    const messages: string[] = [];
    if (this.body.message || this.body.error) {
      messages.push((this.body.message || this.body.error) as string);
    }
    for (const value of Object.values(this.fieldErrors)) {
      if (!messages.includes(value)) messages.push(value);
    }
    return messages.length ? messages : [this.message];
  }
}
