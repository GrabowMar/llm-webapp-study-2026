export interface Book {
  id: number;
  title: string;
  author: string;
  year: number | null;
  isbn: string | null;
  created_at: string;
  review_count: number;
  average_rating: number | null;
}

export interface Review {
  id: number;
  book_id: number;
  rating: number;
  comment: string;
  created_at: string;
  username: string;
}

export interface BookPage {
  items: Book[];
  total: number;
  page: number;
  page_size: number;
}

export interface ReviewList {
  items: Review[];
}
