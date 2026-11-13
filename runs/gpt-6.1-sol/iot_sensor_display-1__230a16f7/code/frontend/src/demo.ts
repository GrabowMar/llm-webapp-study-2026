import type { Reading, Sensor } from "./types";

const startedAt = Date.now();
const definitions = [
  { name: "Air temperature", unit: "°C", location: "Greenhouse", value: 24.6, values: [22.1, 22.4, 22.2, 22.8, 22.6, 23.3, 23, 23.8, 23.5, 24.1, 23.8, 24.6] },
  { name: "Humidity", unit: "%", location: "Greenhouse", value: 68.2, values: [72, 70, 71, 69, 70, 68, 69, 67, 69, 67.6, 68.8, 68.2] },
  { name: "Light intensity", unit: "lux", location: "Outdoor garden", value: 1240, values: [610, 640, 830, 740, 920, 890, 1040, 980, 1160, 1140, 1290, 1240] },
  { name: "Soil moisture", unit: "%", location: "Outdoor garden", value: 42.8, values: [48, 47, 47.3, 46.2, 46.5, 45, 45.2, 44.5, 44.7, 43.6, 43.4, 42.8] },
  { name: "Water temperature", unit: "°C", location: "Water tank", value: 18.3, values: [17.1, 17.4, 17.3, 17.6, 17.5, 17.9, 17.7, 18.1, 18, 18.3, 18.1, 18.3] },
  { name: "CO₂ level", unit: "ppm", location: "Studio", value: 412, values: [440, 432, 435, 423, 429, 418, 427, 415, 420, 410, 416, 412] },
];

export const demoSensors: Sensor[] = definitions.map((definition, index) => ({
  id: -(index + 1),
  name: definition.name,
  unit: definition.unit,
  location: definition.location,
  last_value: definition.value,
  last_updated: new Date(startedAt - (index * 7 + 8) * 1000).toISOString(),
  owner: "fieldwork-demo",
}));

export function demoReadings(id: number): Reading[] {
  const definition = definitions[-id - 1];
  if (!definition) return [];
  return definition.values.map((value, index) => ({
    id: index + 1,
    sensor_id: id,
    value,
    recorded_at: new Date(startedAt - (11 - index) * 5 * 60000 - (-id - 1) * 7000 - 8000).toISOString(),
  })).reverse();
}
