import { useId } from "react";

type Dish = "chicken" | "pasta" | "salad" | "pancakes" | "galette";

export function dishFor(title: string, category: string): Dish {
  const name = title.toLowerCase();
  if (name.includes("chicken")) return "chicken";
  if (name.includes("pasta")) return "pasta";
  if (name.includes("pancake") || category === "Breakfast") return "pancakes";
  if (name.includes("galette") || category === "Dessert") return "galette";
  return "salad";
}

export default function FoodArt({ dish = "salad", hero = false, className = "" }: { dish?: Dish; hero?: boolean; className?: string }) {
  const id = useId().replace(/:/g, "");
  const ref = (name: string) => `url(#${id}-${name})`;
  const backgrounds = { chicken: "#d3c3a8", pasta: "#c5c4b3", salad: "#d9d7c4", pancakes: "#cbb79b", galette: "#c8aca0" };
  const leaf = (x: number, y: number, rotation: number, scale = 1, key = "") => (
    <g key={key} transform={`translate(${x} ${y}) rotate(${rotation}) scale(${scale})`}>
      <path d="M0 0 C-22-12-33-36-13-49 C10-57 21-24 0 0Z" fill={ref("leaf")} />
      <path d="M0 0 L-9-40 M-5-19 L-20-29 M-7-29 L4-37" fill="none" stroke="#b0bd79" strokeWidth="1" opacity=".55" />
    </g>
  );
  const lemon = (x: number, y: number, rotation: number, key: string) => (
    <g key={key} transform={`translate(${x} ${y}) rotate(${rotation})`}>
      <path d="M-38 0 A38 38 0 0 1 38 0Z" fill="#c6a033" stroke="#e0bd3e" strokeWidth="5" />
      <path d="M-32-1 A32 32 0 0 1 32-1Z" fill="#f9df78" stroke="#fff1bf" strokeWidth="3" />
      {[-60, -30, 0, 30, 60].map(angle => <path key={angle} d="M0-2 L0-31" transform={`rotate(${angle} 0 -2)`} stroke="#fff6cb" strokeWidth="2" />)}
    </g>
  );
  return (
    <svg viewBox="0 0 600 400" role="img" aria-label={`An illustrated plate of ${dish === "salad" ? "peach and burrata salad" : dish}`} className={`h-full w-full ${className}`} preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id={`${id}-table`}><stop stopColor={hero ? "#e1e6d7" : backgrounds[dish]} /><stop offset="1" stopColor={hero ? "#e8ecdf" : backgrounds[dish]} /></radialGradient>
        <radialGradient id={`${id}-plate`} cx="40%" cy="30%"><stop stopColor="#fffef8" /><stop offset=".8" stopColor="#edeee5" /><stop offset="1" stopColor="#cecfc4" /></radialGradient>
        <radialGradient id={`${id}-inside`}><stop stopColor="#efefe6" /><stop offset=".9" stopColor="#f8f8ef" /><stop offset="1" stopColor="#deded3" /></radialGradient>
        <linearGradient id={`${id}-leaf`} x2="1" y2="1"><stop stopColor="#809445" /><stop offset=".45" stopColor="#476332" /><stop offset="1" stopColor="#244331" /></linearGradient>
        <linearGradient id={`${id}-peach`} x2="0" y2="1"><stop stopColor="#f2a94c" /><stop offset=".5" stopColor="#ffd792" /><stop offset="1" stopColor="#e67c49" /></linearGradient>
        <radialGradient id={`${id}-cheese`} cx="35%" cy="25%"><stop stopColor="#fffff4" /><stop offset=".65" stopColor="#f6f0da" /><stop offset="1" stopColor="#d8d4b9" /></radialGradient>
        <radialGradient id={`${id}-tomato`} cx="30%" cy="25%"><stop stopColor="#f88455" /><stop offset=".5" stopColor="#d6472e" /><stop offset="1" stopColor="#a02f22" /></radialGradient>
        <linearGradient id={`${id}-pasta`} x2="0" y2="1"><stop stopColor="#f3ba65" /><stop offset=".35" stopColor="#e99748" /><stop offset=".8" stopColor="#c56b34" /><stop offset="1" stopColor="#994c2a" /></linearGradient>
        <radialGradient id={`${id}-chicken`} cx="38%" cy="30%"><stop stopColor="#eeb774" /><stop offset=".4" stopColor="#cf8b43" /><stop offset=".75" stopColor="#a25b2d" /><stop offset="1" stopColor="#663c25" /></radialGradient>
        <radialGradient id={`${id}-cake`} cx="40%" cy="30%"><stop stopColor="#eac18a" /><stop offset=".7" stopColor="#d8a266" /><stop offset="1" stopColor="#b17a41" /></radialGradient>
        <radialGradient id={`${id}-berry`} cx="30%" cy="25%"><stop stopColor="#9191ad" /><stop offset=".4" stopColor="#525675" /><stop offset="1" stopColor="#293145" /></radialGradient>
        <filter id={`${id}-shadow`} x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="4" dy="12" stdDeviation="10" floodColor="#3b3e24" floodOpacity=".22" /></filter>
        <filter id={`${id}-smallshadow`} x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="2" dy="3" stdDeviation="3" floodColor="#343721" floodOpacity=".3" /></filter>
      </defs>
      <path fill={ref("table")} d="M0 0H600V400H0Z" />
      <g opacity=".35" transform="rotate(-16 85 220)">
        <path d="M-60 80 H155 V470 H-60Z" fill={hero ? "#c8cebb" : "#f3eee4"} />
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => <path key={i} d={`M${i * 18 - 40} 80V470`} stroke="#b4bba7" strokeWidth="1" />)}
      </g>
      <g transform={hero ? "translate(38 0) rotate(-8 310 200)" : "translate(0 0)"}>
        <circle cx="307" cy="202" r="170" fill={ref("plate")} filter={ref("shadow")} />
        <circle cx="307" cy="202" r="153" fill="none" stroke="#fffdf4" strokeWidth="2" />
        <circle cx="307" cy="202" r="133" fill={ref("inside")} stroke="#d7d8cb" strokeWidth="1" />
        <g filter={ref("smallshadow")}>
          {(dish === "salad" || dish === "chicken") && Array.from({ length: dish === "salad" ? 35 : 14 }, (_, i) => {
            const a = i * 2.4;
            const r = 38 + (i % 5) * 17;
            return leaf(307 + Math.cos(a) * r, 205 + Math.sin(a) * r, i * 51, .7 + (i % 3) * .16, `leaf${i}`);
          })}
          {dish === "salad" && <>
            {Array.from({ length: 9 }, (_, i) => {
              const a = i * .7;
              return <g key={i} transform={`translate(${307 + Math.cos(a) * 83} ${202 + Math.sin(a) * 77}) rotate(${i * 39})`}>
                <path d="M-35-13 Q0-44 38-13 Q12 24-35-13Z" fill={ref("peach")} stroke="#d36c46" strokeWidth="2" />
                <path d="M-30-13 Q0-31 33-13" fill="none" stroke="#ffdd9a" strokeWidth="3" />
              </g>;
            })}
            {[[258, 152], [371, 178], [347, 276], [241, 248], [309, 105], [395, 237]].map(([x, y], i) => <g key={i} transform={`translate(${x} ${y}) rotate(${i * 45})`}>
              <ellipse rx="16" ry="21" fill={ref("tomato")} />
              <ellipse rx="11" ry="15" fill="#f07c4f" /><path d="M0-13V13M-9 0H9" stroke="#e6a160" strokeWidth="2" />
              <ellipse cx="-5" cy="-6" rx="2" ry="3" fill="#f5d17e" /><ellipse cx="5" cy="6" rx="2" ry="3" fill="#f5d17e" />
            </g>)}
            <path d="M268 186C250 152 298 143 318 164C353 157 375 187 357 206C377 238 334 257 314 239C285 264 257 238 270 215C250 208 256 190 268 186Z" fill={ref("cheese")} />
            <path d="M281 179Q310 192 327 176M291 230Q310 210 346 211M306 181Q296 204 314 220" stroke="#fffef4" strokeWidth="5" fill="none" />
            {leaf(315, 200, 47, .85)}{leaf(316, 202, -55, .65)}
            <path d="M245 182Q290 204 358 237M277 263Q327 255 372 209" stroke="#75623b" strokeWidth="2" opacity=".55" fill="none" />
          </>}
          {dish === "pasta" && <>
            <path d="M210 174Q219 103 298 105Q403 95 419 203Q408 301 303 306Q201 291 201 215Z" fill="#b65e38" />
            {Array.from({ length: 48 }, (_, i) => {
              const a = i * 2.4;
              const r = Math.sqrt(i / 48) * 98;
              return <g key={i} transform={`translate(${307 + Math.cos(a) * r} ${200 + Math.sin(a) * r}) rotate(${i * 73})`}>
                <path d="M-23-9Q0-14 23-9L23 9Q0 14-23 9Z" fill={ref("pasta")} stroke="#b96735" strokeWidth="1" />
                {[-6, -2, 2, 6].map(y => <path key={y} d={`M-21 ${y} Q0 ${y - 3} 21 ${y}`} fill="none" stroke="#f0ad5d" strokeWidth="1.2" opacity=".8" />)}
                <ellipse cx="23" cy="0" rx="3" ry="9" fill="#9c4e2e" stroke="#edac63" strokeWidth="2" />
              </g>;
            })}
            {leaf(285, 175, -60, .9)}{leaf(310, 208, 35, 1)}{leaf(355, 243, 135, .8)}{leaf(268, 257, -80, .75)}
            {Array.from({ length: 25 }, (_, i) => <path key={i} d={`M${237 + (i * 37) % 145} ${132 + (i * 59) % 135}l9-3-2 4-8 2Z`} fill="#fcf1c5" />)}
          </>}
          {dish === "chicken" && <>
            <g transform="rotate(-25 308 202)">
              <path d="M259 124C228 144 232 206 250 241C269 274 331 279 355 245C382 215 379 155 353 133C330 115 287 109 259 124Z" fill={ref("chicken")} />
              <path d="M256 166C212 153 200 186 219 222L249 244Q277 238 273 214Z" fill={ref("chicken")} />
              <path d="M350 178C390 161 411 191 390 221L355 249Q332 234 344 212Z" fill={ref("chicken")} />
              <path d="M279 128Q267 199 298 260M310 125Q344 181 334 257" fill="none" stroke="#f2bf79" strokeWidth="3" opacity=".4" />
              {Array.from({ length: 35 }, (_, i) => <ellipse key={i} cx={262 + (i * 47) % 91} cy={142 + (i * 31) % 100} rx={1 + i % 3} ry="1.5" fill="#7c502d" opacity=".5" />)}
            </g>
            {lemon(221, 158, -65, "lemon1")}{lemon(385, 257, 100, "lemon2")}{lemon(251, 300, -5, "lemon3")}
            {[0, 1, 2].map(i => <g key={i} transform={`translate(${276 + i * 25} ${165 + i * 28}) rotate(${35 + i * 40})`}>
              <path d="M0 0V85" stroke="#526446" strokeWidth="3" />
              {[10, 25, 40, 55, 70].map(y => <path key={y} d={`M0 ${y}l-13-10M0 ${y + 4}l13-10`} stroke="#56724b" strokeWidth="3" strokeLinecap="round" />)}
            </g>)}
          </>}
          {dish === "pancakes" && <>
            {[0, 1, 2, 3].map(i => <g key={i} transform={`translate(${i % 2 * 4} ${-i * 13})`}>
              <ellipse cx="306" cy="235" rx="103" ry="68" fill="#a86c36" />
              <ellipse cx="306" cy="226" rx="103" ry="68" fill={ref("cake")} />
              <path d="M205 224Q210 287 306 291Q400 286 408 225" stroke="#ebc594" strokeWidth="4" fill="none" />
            </g>)}
            <path d="M267 152Q310 126 351 156Q380 167 367 189L339 221Q323 244 309 219Q298 202 281 217Q256 224 246 206Q245 185 267 152Z" fill="#a9682c" opacity=".75" />
            <path d="M303 227Q299 261 305 294" stroke="#ab682a" strokeWidth="9" strokeLinecap="round" />
            <path d="M282 154L316 143L335 166L300 181Z" fill="#f7e8a7" stroke="#ebd187" strokeWidth="2" />
            {[[247, 158], [260, 141], [269, 161], [363, 216], [376, 202], [247, 288], [221, 260], [333, 128], [348, 142], [386, 258]].map(([x, y], i) => <g key={i}>
              <circle cx={x} cy={y} r="10" fill={ref("berry")} /><path d={`M${x - 3} ${y - 3}l3-3 3 3-3 2Z`} fill="#333a55" />
            </g>)}
            {leaf(336, 153, 30, .65)}{leaf(336, 156, -70, .6)}
          </>}
          {dish === "galette" && <>
            <path d="M302 88L350 101L389 128L415 171L420 216L400 262L364 297L315 310L265 303L224 275L199 234L197 186L218 140L255 107Z" fill={ref("cake")} stroke="#b78046" strokeWidth="3" />
            <circle cx="309" cy="203" r="91" fill="#a13d2c" />
            {Array.from({ length: 32 }, (_, i) => {
              const a = i * 2.4;
              const r = Math.sqrt(i / 32) * 76;
              return <g key={i} transform={`translate(${307 + Math.cos(a) * r} ${202 + Math.sin(a) * r}) rotate(${i * 45})`}>
                <path d="M-14-10Q0-30 15-9Q18 3 0 22Q-18 3-14-10Z" fill={ref("tomato")} stroke="#ce5341" strokeWidth="1" />
                <path d="M0-13Q-8 0 0 16Q8 0 0-13Z" fill="#ffb191" opacity=".7" />
                {[-7, 7].map(x => <path key={x} d={`M${x}-5v3M${x} 3v3`} stroke="#f4d68d" strokeWidth="1.5" />)}
              </g>;
            })}
            <path d="M300 90L340 105L324 130L287 127L262 141L226 151L215 187L230 216L229 257L270 269L305 283L339 270L373 262L384 224L394 185L373 155L353 132L350 103" fill="none" stroke="#ddb07a" strokeWidth="23" strokeLinejoin="round" />
            <path d="M248 130L235 151M203 191L219 194M253 284L260 264M335 296L329 277M400 238L381 232" stroke="#a97440" strokeWidth="2" opacity=".6" />
            <circle cx="323" cy="177" r="33" fill={ref("cheese")} /><path d="M301 171Q330 149 342 176M303 187Q321 171 345 189" fill="none" stroke="#fffcf1" strokeWidth="4" />
            {leaf(330, 174, 40, .6)}{leaf(329, 174, -60, .55)}
          </>}
        </g>
        {Array.from({ length: 38 }, (_, i) => {
          const a = i * 2.4;
          const r = Math.sqrt(i / 38) * 118;
          return <circle key={i} cx={307 + Math.cos(a) * r} cy={202 + Math.sin(a) * r} r={i % 3 === 0 ? 1.5 : .8} fill="#3e4528" opacity=".45" />;
        })}
      </g>
      <g transform={hero ? "translate(556 96) rotate(16)" : "translate(512 83) rotate(16)"} filter={ref("smallshadow")} opacity=".85">
        <path d="M-6 3V54Q-6 66 0 66Q6 66 6 54V3M-14 2V48Q-14 57 0 57Q14 57 14 48V2M0 61V236" fill="none" stroke="#e6e7df" strokeWidth="5" strokeLinecap="round" />
        <path d="M1 68V230" stroke="#a3a69c" strokeWidth="2" />
      </g>
      {hero && <g transform="translate(64 72) rotate(-30)">
        <path d="M0 0Q5 50 20 115" stroke="#60704b" strokeWidth="3" fill="none" />
        {[15, 35, 55, 75, 95].map(y => <g key={y}>{leaf(y / 8, y, -70, .45)}{leaf(y / 8, y + 5, 65, .4)}</g>)}
      </g>}
    </svg>
  );
}
