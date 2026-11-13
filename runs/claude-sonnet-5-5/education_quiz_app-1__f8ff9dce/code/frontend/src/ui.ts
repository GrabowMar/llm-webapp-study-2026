export const btnPrimary =
  "rounded bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50";
export const btnSecondary =
  "rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:opacity-50";
export const inputCls =
  "w-full rounded border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
export const cardCls = "rounded-lg bg-white p-6 shadow";

export const formatDate = (iso: string) => new Date(iso).toLocaleString();
