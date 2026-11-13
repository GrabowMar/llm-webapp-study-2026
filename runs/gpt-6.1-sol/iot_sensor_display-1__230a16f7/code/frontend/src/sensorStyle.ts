import { Droplets, Radio, Sun, Thermometer, Waves, Wind } from "lucide-react";
import type { Sensor } from "./types";

export function sensorStyle(sensor: Sensor) {
  const name = sensor.name.toLowerCase();
  if (name.includes("water") || name.includes("tank")) return { Icon: Waves, background: "bg-[#e8f1f4]", color: "#6896a5", text: "text-[#608d9b]" };
  if (name.includes("humidity") || name.includes("moisture") || sensor.unit === "%") return { Icon: Droplets, background: "bg-[#eaf0e4]", color: "#809768", text: "text-[#78905f]" };
  if (name.includes("light") || sensor.unit === "lux") return { Icon: Sun, background: "bg-[#faf2df]", color: "#c6a056", text: "text-[#b99349]" };
  if (name.includes("co₂") || name.includes("co2") || sensor.unit === "ppm") return { Icon: Wind, background: "bg-[#edeaf4]", color: "#9b8daf", text: "text-[#8c7ca4]" };
  if (name.includes("temp") || sensor.unit.includes("°")) return { Icon: Thermometer, background: "bg-[#f6eae1]", color: "#c39779", text: "text-[#b4886a]" };
  return { Icon: Radio, background: "bg-[#eaf0e4]", color: "#809768", text: "text-[#78905f]" };
}
