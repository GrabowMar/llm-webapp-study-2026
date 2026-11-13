import { useEffect, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { ArrowDownAZ, ArrowRight, Building2, ChevronLeft, ChevronRight, Clock3, Filter, MessageSquare, Plus, Search, Users, X } from "lucide-react";
import { api, date, initials, message, type CustomerPage, type Overview } from "./api";
import { Alert, inputClass, primaryButton, secondaryButton, Spinner } from "./ui";
import { CustomerForm } from "./CustomerForm";
import type { LayoutContext } from "./Layout";

const avatarColors = ["bg-[#e8eee5] text-[#697c55]", "bg-[#eeebf6] text-[#8671a3]", "bg-[#f4eae2] text-[#ac825f]", "bg-[#e5edf3] text-[#6985a0]", "bg-[#f3e6e7] text-[#ad747e]"];

export function Customers() {
  const { notify } = useOutletContext<LayoutContext>();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const company = params.get("company") || "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = [10, 20, 50].includes(Number(params.get("page_size"))) ? Number(params.get("page_size")) : 10;
  const [search, setSearch] = useState(q);
  const [result, setResult] = useState<CustomerPage | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [add, setAdd] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => { setSearch(q); }, [q]);
  useEffect(() => {
    if (search === q) return;
    const timer = setTimeout(() => {
      setParams((old) => { const next = new URLSearchParams(old); if (search.trim()) next.set("q", search.trim()); else next.delete("q"); next.delete("page"); return next; }, { replace: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, q, setParams]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    const query = new URLSearchParams({ q, company, page: String(page), page_size: String(pageSize) });
    api<CustomerPage>(`/customers?${query}`).then((data) => {
      if (!active) return;
      if (page > 1 && data.items.length === 0 && data.total > 0) {
        setParams((old) => { const next = new URLSearchParams(old); next.set("page", String(Math.ceil(data.total / pageSize))); return next; }, { replace: true });
      } else setResult(data);
    }).catch((err) => { if (active) setError(message(err)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [q, company, page, pageSize, revision, setParams]);
  useEffect(() => {
    let active = true;
    api<Overview>("/overview").then((data) => { if (active) setOverview(data); }).catch(() => {});
    return () => { active = false; };
  }, [revision]);
  function filter(key: string, value: string) {
    setParams((old) => { const next = new URLSearchParams(old); if (value) next.set(key, value); else next.delete(key); if (key !== "page") next.delete("page"); return next; });
  }
  const filtered = !!(q || company);
  const total = result?.total || 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <>
    <div className="mb-8 flex flex-wrap items-center justify-between gap-5"><div><p className="mb-2 text-[10px] font-semibold tracking-[1.7px] text-brand-600">A LITTLE CONTEXT. A BETTER CONNECTION.</p><div className="flex items-center gap-3"><h1 className="text-[30px] font-semibold tracking-[-1px]">Customers</h1><span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-500">{overview?.customers ?? "—"}</span></div><p className="mt-2 text-[13px] text-slate-500">Your people, their details, and every conversation in between.</p></div><button onClick={() => setAdd(true)} className={primaryButton}><Plus size={17} />Add customer</button></div>
    <div className="mb-8 grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-5">
      {[
        { label: "Total customers", value: overview?.customers, icon: Users, color: "bg-brand-50 text-brand-600", note: "Connections in your directory" },
        { label: "Companies", value: overview?.companies, icon: Building2, color: "bg-[#f1eef8] text-[#8b79b4]", note: "Organizations you work with" },
        { label: "Contacted recently", value: overview?.contacted, icon: Clock3, color: "bg-[#fcf3e5] text-[#bd9452]", note: "Customers in the last 30 days" },
        { label: "Interactions logged", value: overview?.interactions, icon: MessageSquare, color: "bg-[#ecf2fa] text-[#6a8cba]", note: "Conversations, kept together" },
      ].map(({ label, value, icon: Icon, color, note }) => <div key={label} className="rounded-xl border border-slate-200/80 bg-white p-4 sm:p-5"><div className="flex items-center justify-between gap-2"><p className="text-xs font-medium text-slate-500">{label}</p><span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${color}`}><Icon size={16} strokeWidth={1.7} /></span></div><p className="mt-3 text-[28px] font-semibold leading-none tracking-tight">{value ?? "—"}</p><p className="mt-3 hidden text-[11px] text-slate-400 sm:block">{note}</p></div>)}
    </div>
    <section aria-label="Customer directory" className="overflow-hidden rounded-xl border border-slate-200/80 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6"><div className="flex items-center gap-2.5"><h2 className="text-sm font-semibold">All customers</h2><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{total}</span></div><span className="flex items-center gap-1.5 text-[11px] text-slate-400"><ArrowDownAZ size={14} />Sorted by name</span></div>
      <div className="flex flex-wrap items-center gap-3 px-5 py-4 sm:px-6"><div className="relative w-full sm:max-w-[330px] sm:flex-1"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input aria-label="Search customers" placeholder="Search name, email, company…" value={search} onChange={(event) => setSearch(event.target.value)} className={`${inputClass} py-2.5 pl-9 pr-9 text-xs`} />{search && <button aria-label="Clear search" onClick={() => { setSearch(""); filter("q", ""); }} className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"><X size={14} /></button>}</div><div className="relative min-w-[175px]"><Building2 size={14} className="pointer-events-none absolute left-3 top-3.5 text-slate-400" /><select aria-label="Filter by company" value={company} onChange={(event) => filter("company", event.target.value)} className={`${inputClass} appearance-none py-2.5 pl-9 pr-9 text-xs`}><option value="">All companies</option>{company && !overview?.company_options.includes(company) && <option value={company}>{company}</option>}{overview?.company_options.map((item) => <option key={item} value={item}>{item}</option>)}</select><ChevronRight size={14} className="pointer-events-none absolute right-3 top-3.5 rotate-90 text-slate-400" /></div>{filtered && <button onClick={() => { setSearch(""); setParams({}); }} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-brand-700"><X size={13} />Clear filters</button>}<span className="ml-auto hidden text-[11px] text-slate-400 xl:inline">A shared view for your whole team</span></div>
      {error ? <div className="px-6 pb-6"><Alert>{error} <button onClick={() => setRevision(revision + 1)} className="ml-2 font-semibold underline">Try again</button></Alert></div> : loading ? <Spinner label="Finding your customers…" /> : result?.items.length ? <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-xs"><thead className="border-y border-slate-100 bg-[#fafbfc] text-[10px] font-medium uppercase tracking-[0.65px] text-slate-400"><tr><th scope="col" className="px-6 py-3.5 font-medium">Name <span className="ml-1 text-brand-600">↓</span></th><th scope="col" className="px-4 py-3.5 font-medium">Email address</th><th scope="col" className="px-4 py-3.5 font-medium">Phone</th><th scope="col" className="px-4 py-3.5 font-medium">Company</th><th scope="col" className="px-4 py-3.5 font-medium">Last contacted</th><th scope="col" className="py-3.5 pr-5"><span className="sr-only">View customer</span></th></tr></thead><tbody className="divide-y divide-slate-100">{result.items.map((customer) => <tr key={customer.id} className="group transition hover:bg-brand-50/35"><td className="px-6 py-4"><Link to={`/customers/${customer.id}`} className="flex items-center gap-3 rounded-md focus-visible:outline-brand-500"><span className={`flex size-9 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${avatarColors[customer.id % avatarColors.length]}`}>{initials(customer.name)}</span><span className="max-w-[220px] truncate text-[13px] font-semibold text-slate-700 group-hover:text-brand-700">{customer.name}</span></Link></td><td className="px-4 py-4 text-slate-500">{customer.email ? <a href={`mailto:${customer.email}`} className="hover:text-brand-700">{customer.email}</a> : <span className="text-slate-300">—</span>}</td><td className="px-4 py-4 text-slate-500">{customer.phone || <span className="text-slate-300">—</span>}</td><td className="px-4 py-4">{customer.company ? <span className="inline-flex max-w-[180px] items-center gap-1.5 rounded-md border border-slate-200/70 bg-slate-50 px-2 py-1 text-[11px] text-slate-600"><Building2 size={11} className="shrink-0 text-slate-400" /><span className="truncate">{customer.company}</span></span> : <span className="text-slate-300">—</span>}</td><td className="px-4 py-4">{customer.last_contacted_at ? <span className="flex items-center gap-1.5 text-slate-500"><span className="size-1.5 rounded-full bg-brand-500/65" />{date(customer.last_contacted_at)}</span> : <span className="text-[11px] text-slate-400">Not contacted yet</span>}</td><td className="pr-5"><Link to={`/customers/${customer.id}`} aria-label={`View ${customer.name}`} className="inline-flex rounded-lg p-2 text-slate-300 hover:bg-brand-50 hover:text-brand-600"><ChevronRight size={16} /></Link></td></tr>)}</tbody></table></div> : <div className="flex min-h-[320px] flex-col items-center justify-center border-t border-slate-100 px-6 py-12 text-center"><span className="mb-5 flex size-16 items-center justify-center rounded-2xl border border-brand-100 bg-brand-50 shadow-[0_5px_0_0_#f7faf7]">{filtered ? <Filter size={27} className="text-brand-500" strokeWidth={1.4} /> : <Users size={28} className="text-brand-500" strokeWidth={1.4} />}</span><h3 className="text-base font-semibold">{filtered ? "No matching connections" : "Your next connection starts here"}</h3><p className="mt-2 max-w-sm text-xs leading-6 text-slate-400">{filtered ? "Try a different search or company to find who you’re looking for." : "Add your first customer and give your team a shared place to keep the details that matter."}</p><button onClick={() => { if (filtered) { setSearch(""); setParams({}); } else setAdd(true); }} className={`${filtered ? secondaryButton : primaryButton} mt-5`}>{filtered ? "Clear filters" : <><Plus size={15} />Add your first customer</>}</button></div>}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 px-5 py-4 text-[11px] text-slate-400 sm:px-6"><div className="flex items-center gap-4"><p>{total ? `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total} customers` : "0 customers"}</p><label className="hidden items-center gap-2 sm:inline-flex">Rows per page<select aria-label="Rows per page" value={pageSize} onChange={(event) => filter("page_size", event.target.value)} className="rounded-md border border-slate-200 bg-white p-1 text-slate-600 outline-brand-500"><option>10</option><option>20</option><option>50</option></select></label></div><div className="flex items-center gap-2"><button aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => filter("page", String(page - 1))} className="rounded-md border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-50 disabled:opacity-35"><ChevronLeft size={14} /></button><span className="px-2 text-slate-500">Page <span className="font-medium text-slate-700">{page}</span> of {pages}</span><button aria-label="Next page" disabled={page >= pages || loading} onClick={() => filter("page", String(page + 1))} className="rounded-md border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-50 disabled:opacity-35"><ChevronRight size={14} /></button></div></div>
    </section>
    <p className="mt-5 flex items-center gap-2 text-[11px] text-slate-400"><Users size={13} />Every customer is shared with your team. Great relationships don’t happen alone.<ArrowRight size={12} className="hidden sm:block" /></p>
    {add && <CustomerForm onClose={() => setAdd(false)} onSaved={() => { setAdd(false); setRevision(revision + 1); notify("Customer added to your directory."); }} />}
  </>;
}
