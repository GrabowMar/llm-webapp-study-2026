export type Store = {
  id: number;
  name: string;
  address: string;
  phone: string | null;
  latitude: number;
  longitude: number;
  distance_km: number | null;
};

export type StoreInput = {
  name: string;
  address: string;
  phone: string;
  latitude: number | string;
  longitude: number | string;
};

export type Session = {
  token: string;
  username: string;
  isAdmin: boolean;
};

export type Coords = {
  lat: number;
  lng: number;
};
