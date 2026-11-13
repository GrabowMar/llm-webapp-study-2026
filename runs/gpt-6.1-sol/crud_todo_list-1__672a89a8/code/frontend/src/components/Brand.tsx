export default function Brand() {
  return (
    <div className="flex items-center gap-2.5" aria-label="Tidy">
      <span className="flex size-9 items-center justify-center rounded-xl bg-leaf text-white">
        <svg viewBox="0 0 40 40" className="size-8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M11 12h18M11 20h9m-9 8h9m2-5 3 3 6-7" />
        </svg>
      </span>
      <span className="text-[27px] font-semibold tracking-[-1.5px]">tidy<span className="text-leaf">.</span></span>
    </div>
  );
}
