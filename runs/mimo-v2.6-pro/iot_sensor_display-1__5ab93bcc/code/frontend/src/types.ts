export interface Sensor {
  id: number;
  name: string;
  unit: string;
  location: string;
  last_value: number | null;
  last_updated: string | null;
  owner: string;
}

export interface Reading {
  id: number;
  sensor_id: number;
  value: number;
  recorded_at: string;
}

export interface SensorList {
  items: Sensor[];
}

export interface ReadingList {
  items: Reading[];
  total: number;
}
