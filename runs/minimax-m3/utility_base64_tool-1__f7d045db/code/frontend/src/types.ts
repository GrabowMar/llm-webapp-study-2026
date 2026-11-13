export type Direction = "encode" | "decode";

export interface Conversion {
  id: number;
  direction: Direction;
  input_preview: string;
  output_preview: string;
  created_at: string;
}

export interface SavedConversion extends Conversion {
  output: string;
}

export interface ConversionPage {
  items: Conversion[];
  total: number;
  page: number;
  page_size: number;
}

export interface AuthUser {
  id: number;
  username: string;
}
