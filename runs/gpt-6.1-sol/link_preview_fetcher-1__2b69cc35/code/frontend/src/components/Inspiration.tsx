import { ArrowUpRight, Globe2 } from "lucide-react";

const examples = [
  { host: "developer.mozilla.org", url: "https://developer.mozilla.org/en-US/", title: "The web is for everyone.", description: "A trusty field guide to the web. Explore the building blocks of your next big idea.", image: "mdn" },
  { host: "react.dev", url: "https://react.dev/", title: "A new way to think in React", description: "Little components. Endless possibilities. Get inspired to make something of your own.", image: "react" },
  { host: "tailwindcss.com", url: "https://tailwindcss.com/", title: "Make something beautiful", description: "A little less wrestling with styles. A little more bringing your ideas to life.", image: "tailwind" },
];

export default function Inspiration() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {examples.map((example) => (
        <a key={example.host} href={example.url} target="_blank" rel="noopener noreferrer" className="group flex flex-col overflow-hidden rounded-xl border border-line bg-white transition duration-200 hover:-translate-y-1 hover:border-olive/30 hover:shadow-lg hover:shadow-ink/5">
          <div className="relative aspect-[1.85/1] overflow-hidden">
            <img src={`/examples/${example.image}.svg`} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]" />
            <span className="absolute right-3 top-3 rounded-full bg-white/80 p-1.5 text-ink opacity-0 transition group-hover:opacity-100 group-focus:opacity-100"><ArrowUpRight size={15} /></span>
          </div>
          <div className="flex flex-1 flex-col p-5">
            <div className="mb-3 flex items-center gap-2 text-[11px] text-muted"><Globe2 size={12} />{example.host}</div>
            <h3 className="font-serif text-[21px] leading-snug tracking-[-0.3px] group-hover:text-olive">{example.title}</h3>
            <p className="mt-2 text-[12px] leading-[1.8] text-muted">{example.description}</p>
            <div className="mt-auto flex items-center justify-between pt-5"><span className="text-[9px] tracking-[0.13em] text-muted/80">EXAMPLE PREVIEW</span><ArrowUpRight size={14} className="text-muted/70" /></div>
          </div>
        </a>
      ))}
    </div>
  );
}
