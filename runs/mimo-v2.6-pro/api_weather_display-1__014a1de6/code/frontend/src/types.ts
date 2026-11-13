export interface WeatherReport {
  id: number;
  city: string;
  country: string | null;
  temperature_c: number | null;
  condition: string | null;
  humidity: number | null;
  wind_kph: number | null;
  observed_at: string;
}

export interface Lookup {
  id: number;
  city: string;
  found: boolean;
  looked_up_at: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface ReportInput {
  city: string;
  country: string | null;
  temperature_c: number | null;
  condition: string | null;
  humidity: number | null;
  wind_kph: number | null;
}

export type Unit = "C" | "F";
