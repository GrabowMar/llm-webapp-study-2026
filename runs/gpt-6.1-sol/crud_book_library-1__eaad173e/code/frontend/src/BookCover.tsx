import type { Book } from "./api";

const themes = [
  { bg: "bg-[#253c53]", text: "text-[#eee5ba]", art: "bg-[#e2b467]", type: "moon" },
  { bg: "bg-[#eee6d7]", text: "text-[#424239]", art: "bg-[#8e9481]", type: "circle" },
  { bg: "bg-[#dce2d4]", text: "text-[#385b47]", art: "bg-[#e99549]", type: "sun" },
  { bg: "bg-[#e5e0d0]", text: "text-[#414b37]", art: "bg-[#b1b78c]", type: "circle" },
  { bg: "bg-[#bf553e]", text: "text-[#fff0ce]", art: "bg-[#eed4a3]", type: "window" },
  { bg: "bg-[#f3ede1]", text: "text-[#465954]", art: "bg-[#cbb788]", type: "dots" },
  { bg: "bg-[#e3ba69]", text: "text-[#583d2d]", art: "bg-[#9a4c30]", type: "sun" },
  { bg: "bg-[#426b5c]", text: "text-[#f0e5b9]", art: "bg-[#a9bb7d]", type: "leaf" },
];

const knownTitles = [
  "The Midnight Library", "The Creative Act", "Tomorrow, and Tomorrow, and Tomorrow",
  "The Psychology of Money", "Normal People", "Atomic Habits", "The Alchemist", "Braiding Sweetgrass",
];

export default function BookCover({ book, large = false }: { book: Pick<Book, "title" | "author">; large?: boolean }) {
  const known = knownTitles.indexOf(book.title);
  const index = known >= 0 ? known : [...book.title].reduce((sum, c) => sum + c.charCodeAt(0), 0) % themes.length;
  const theme = themes[index];
  return (
    <div aria-hidden="true" className={`relative shrink-0 overflow-hidden rounded-r-[3px] shadow-[2px_3px_5px_#283e3215] ${theme.bg} ${theme.text} ${large ? "h-64 w-44" : "h-[49px] w-[35px]"}`}>
      <div className="absolute inset-y-0 left-0 z-10 w-[7%] border-r border-black/10 bg-black/10" />
      <div className={`relative z-10 flex h-full flex-col items-center text-center ${large ? "px-5 pt-7" : "px-1.5 pt-1.5"}`}>
        <span className={`${large ? "text-[9px] tracking-[.15em]" : "text-[2.7px] tracking-[.05em]"} uppercase`}>{book.author}</span>
        <span className={`mt-[8%] font-serif font-semibold ${large ? "text-[25px] leading-[1.05]" : "text-[6.5px] leading-[1.06]"}`}>{book.title}</span>
        {theme.type === "circle" && <div className={`mt-[12%] aspect-square w-[62%] rounded-full border ${large ? "border-ink/40" : "border-ink/40"}`} />}
        {theme.type === "moon" && <div className={`absolute bottom-[15%] left-[36%] aspect-square w-[32%] rounded-full ${theme.art}`}><div className={`absolute -right-[20%] -top-[12%] h-[90%] w-[90%] rounded-full ${theme.bg}`} /></div>}
        {theme.type === "sun" && <div className={`absolute -bottom-[5%] -right-[12%] aspect-square w-[95%] rounded-full ${theme.art}`}><div className={`absolute bottom-[10%] left-[24%] h-[90%] w-[24%] -rotate-12 ${theme.bg}`} /></div>}
        {theme.type === "window" && <div className={`absolute bottom-[14%] h-[33%] w-[54%] rounded-t-full ${theme.art}`}><div className="absolute inset-y-0 left-1/2 w-px bg-black/25" /><div className="absolute inset-x-0 top-1/2 h-px bg-black/25" /></div>}
        {theme.type === "dots" && <div className="absolute inset-x-[22%] bottom-[15%] grid grid-cols-5 gap-[2px]">{Array.from({ length: 20 }, (_, i) => <div key={i} className={`aspect-square rounded-full ${theme.art}`} />)}</div>}
        {theme.type === "leaf" && <div className={`absolute bottom-[8%] left-[38%] h-[39%] w-[26%] -rotate-30 rounded-tl-full rounded-br-full ${theme.art}`} />}
        <span className={`absolute bottom-[5%] ${large ? "text-[7px] tracking-widest" : "text-[2px]"}`}>FOLIO LIBRARY</span>
      </div>
      <div className="pointer-events-none absolute inset-0 bg-linear-to-r from-white/5 via-transparent to-black/5" />
    </div>
  );
}
