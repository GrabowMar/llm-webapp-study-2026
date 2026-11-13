import { useState } from "react";
import { HeroIllustration, Icon } from "./Icons";
import { ErrorBanner, primaryButton } from "./ui";
import type { User } from "./api";

export default function Home({ user, startQuiz, loading, error, onSignIn }: { user: User | null; startQuiz: (count: number) => void; loading: boolean; error: string; onSignIn: () => void }) {
  const [count, setCount] = useState(5);
  return <div>
    <div className="mb-7 flex items-center justify-between gap-4">
      <div><p className="mb-1.5 text-xs text-muted">A little wiser, every day.</p><h1 className="text-[27px] font-semibold tracking-[-1px] sm:text-[29px]">{user ? `Welcome back, ${user.username}.` : "Hello, curious mind."}<span className="ml-2 inline-block text-[#92a77c]"><Icon name="spark" size={23} /></span></h1></div>
      <span className="hidden items-center gap-2.5 rounded-full border border-[#e2e5db] px-4 py-2.5 text-[11px] text-[#81877c] xl:flex"><span className="h-1.5 w-1.5 rounded-full bg-[#91a779]" />A good day to learn something new</span>
    </div>
    <section className="relative mb-7 flex min-h-[293px] overflow-hidden rounded-[22px] border border-[#d9e5d1] bg-[#e6eedf]">
      <div className="relative z-10 flex w-full flex-col justify-center px-7 py-9 sm:px-9 lg:w-[65%] lg:px-10">
        <div className="mb-5 flex items-center gap-2 text-[10px] font-semibold tracking-[.18em] text-[#63755b]"><Icon name="spark" size={14} />YOUR DAILY BRAIN BOOST</div>
        <h2 className="text-[36px] leading-[1.12] font-medium tracking-[-1.8px] sm:text-[42px] xl:text-[46px]">A little curiosity.<br />A lot to discover.</h2>
        <p className="mt-4 max-w-[320px] text-[13px] leading-[1.8] text-[#73806b]">Big ideas, little-known facts, and a few “I knew that!” moments. Give your brain a little adventure.</p>
        <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[10px] font-medium text-[#617057]"><span className="flex items-center gap-1.5"><Icon name="check" size={13} />Always something new</span><span className="flex items-center gap-1.5"><Icon name="check" size={13} />Just a few minutes</span></div>
      </div>
      <div className="absolute -right-4 bottom-1 hidden h-[295px] w-[370px] lg:block xl:right-2 xl:w-[400px]"><HeroIllustration /></div>
    </section>
    <div className="grid gap-6 lg:grid-cols-[1.65fr_1fr]">
      <section className="rounded-[20px] border border-[#e4e7df] bg-white p-6 sm:p-7">
        <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3.5"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f0f3e9] text-[#778960]"><Icon name="globe" size={23} /></span><div><h2 className="text-[19px] font-semibold tracking-[-.5px]">The everyday quiz</h2><p className="mt-1 text-[11px] text-muted">A little bit of everything. A fresh mix, every time.</p></div></div><span className="hidden rounded-full bg-[#f3f5ed] px-3 py-1.5 text-[9px] font-medium text-[#7f8a6d] sm:block">GENERAL KNOWLEDGE</span></div>
        <fieldset className="mt-7"><legend className="mb-3 text-[11px] font-medium text-[#70786d]">How curious are you feeling?</legend><div className="grid grid-cols-3 gap-2.5">{([{ count: 5, label: "Quick spark" }, { count: 10, label: "A good stretch" }, { count: 15, label: "Deep dive" }]).map(item => <label key={item.count} className={`relative flex cursor-pointer flex-col items-center rounded-xl border px-2 py-3.5 transition-colors ${count === item.count ? "border-[#82986f] bg-[#f1f5e9]" : "border-[#e6e8e1] hover:bg-paper"}`}><input type="radio" name="quiz-length" value={item.count} checked={count === item.count} onChange={() => setCount(item.count)} className="peer sr-only" /><span className="pointer-events-none absolute inset-0 rounded-xl peer-focus-visible:ring-2 peer-focus-visible:ring-[#73966b]" /><span className="text-[19px] leading-none font-semibold">{item.count}<span className="ml-1 text-[10px] font-normal text-muted">questions</span></span><span className="mt-2 text-[10px] text-muted">{item.label}</span>{count === item.count && <span className="absolute top-2 right-2 flex h-3 w-3 items-center justify-center rounded-full bg-[#84996f] text-white"><Icon name="check" size={9} /></span>}</label>)}</div></fieldset>
        <div className="mt-5"><ErrorBanner message={error} /></div>
        <button onClick={() => startQuiz(count)} disabled={loading} className={`${primaryButton} mt-1 w-full justify-between px-5`}>{loading ? "Finding your next discoveries…" : "Let’s play"}<Icon name="arrow" size={18} /></button>
        <div className="mt-3.5 flex items-center justify-center gap-4 text-[10px] text-[#969c90]"><span className="flex items-center gap-1.5"><Icon name="clock" size={12} />About {Math.round(count * .4)} minutes</span><span className="h-1 w-1 rounded-full bg-[#c5cbbf]" /><span>No pressure. Just curiosity.</span></div>
      </section>
      <aside className="relative flex flex-col overflow-hidden rounded-[20px] border border-[#e5e5d4] bg-[#f0f0e4] p-6 sm:p-7">
        <div className="flex items-center justify-between"><span className="text-[9px] font-semibold tracking-[.16em] text-[#86876a]">THE CURIOSITY CORNER</span><Icon name="bulb" size={25} className="text-[#898e6d]" /></div>
        <p className="mt-7 text-[11px] font-medium text-[#929379]">Did you know?</p>
        <h2 className="mt-2 font-serif text-[33px] leading-[1.17] tracking-[-.7px] text-[#505b43]">An octopus has<br />three hearts.</h2>
        <p className="mt-4 max-w-[260px] text-[11px] leading-[1.9] text-[#8a8e79]">Two pump blood to the gills. The third keeps it flowing to the rest of the body. Talk about putting your heart into it.</p>
        <div className="mt-auto pt-5"><p className="flex items-center gap-2 border-t border-[#dedfce] pt-4 text-[10px] text-[#8b8e76]"><Icon name="spark" size={13} />A tiny fact. A bigger world.</p></div>
      </aside>
    </div>
    <section className="mt-9"><div className="mb-5 flex items-center gap-3"><h2 className="text-[17px] font-semibold tracking-[-.4px]">Small quiz. Big possibilities.</h2><span className="h-px flex-1 bg-[#e3e6dc]" /></div><div className="grid gap-5 sm:grid-cols-3">{[
      { number: "01", icon: "shuffle" as const, title: "Expect the unexpected", text: "Science, history, culture and beyond. Every quiz is a fresh shuffle." },
      { number: "02", icon: "bulb" as const, title: "Learn a little something", text: "See the answers, find your aha moment, and take something new away." },
      { number: "03", icon: "history" as const, title: "Watch yourself grow", text: "Sign in to save your attempts and look back at how far you’ve come." },
    ].map(item => <div key={item.number} className="rounded-2xl border border-[#e5e8df] bg-[#fbfcf8] p-5"><div className="mb-4 flex items-center justify-between"><Icon name={item.icon} size={20} className="text-[#8e9a7b]" /><span className="text-[10px] text-[#b0b8a7]">{item.number}</span></div><h3 className="text-xs font-semibold">{item.title}</h3><p className="mt-2 text-[11px] leading-[1.9] text-[#92988b]">{item.text}</p></div>)}</div></section>
    {!user && <p className="mt-7 text-center text-[11px] text-muted">Your curiosity deserves a little history. <button onClick={onSignIn} className="ml-1 font-medium text-[#637955] underline decoration-[#c0cbb5] underline-offset-4 hover:text-ink">Create a free account <span aria-hidden="true">↗</span></button></p>}
  </div>;
}
