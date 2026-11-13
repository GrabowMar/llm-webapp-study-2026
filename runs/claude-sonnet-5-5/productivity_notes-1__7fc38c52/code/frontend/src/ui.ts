export const btn =
  "inline-flex items-center rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50";
export const btnGhost =
  "inline-flex items-center rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50";
export const btnDanger =
  "inline-flex items-center rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50";
export const input =
  "w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
export const label = "mb-1 block text-sm font-medium text-slate-700";
export const card = "rounded-lg border border-slate-200 bg-white p-4 shadow-sm";
export const chip =
  "inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100";

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleString();
}
