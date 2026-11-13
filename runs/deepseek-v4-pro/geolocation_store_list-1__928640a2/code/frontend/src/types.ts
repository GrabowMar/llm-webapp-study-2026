export interface Store {
  id: number;
  name: string;
  address: string;
  phone: string;
  latitude: number;
  longitude: number;
  distance_km: number | null;
}

export interface StoreInput {
  name: string;
  address: string;
  phone: string;
  latitude: number;
  longitude: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}
