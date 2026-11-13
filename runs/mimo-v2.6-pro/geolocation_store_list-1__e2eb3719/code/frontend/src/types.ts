export interface Store {
  id: number;
  name: string;
  address: string;
  phone: string | null;
  latitude: number;
  longitude: number;
  distance_km: number | null;
}

export interface StoreInput {
  name: string;
  address: string;
  phone: string | null;
  latitude: number | string;
  longitude: number | string;
}

export interface FormError {
  message: string;
  fields?: Record<string, string>;
}

export interface Session {
  username: string;
  token: string;
}
