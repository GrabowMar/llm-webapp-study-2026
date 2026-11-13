import { useId } from "react";

export function ProductArt({ name, className = "" }: { name: string; className?: string }) {
  const id = useId().replace(/:/g, "");
  const paint = (color: string) => `url(#${id}-${color})`;
  const lower = name.toLowerCase();
  let art;
  if (lower.includes("vase")) {
    art = <>
      <path d="M179 129c-8-43 8-76 21-99m-18 71c-12-15-19-25-23-43m29 21c16-9 30-15 45-15" stroke="#6e7050" strokeWidth="2" fill="none" />
      <g fill="#838363"><ellipse cx="164" cy="69" rx="6" ry="15" transform="rotate(-34 164 69)" /><ellipse cx="197" cy="49" rx="5" ry="14" transform="rotate(28 197 49)" /><ellipse cx="216" cy="69" rx="5" ry="13" transform="rotate(63 216 69)" /><ellipse cx="181" cy="88" rx="5" ry="13" transform="rotate(-22 181 88)" /></g>
      <path d="M161 104h38v28c0 11 25 31 27 57l3 45c1 12-20 21-50 21s-48-9-47-21l3-45c2-26 26-46 26-57Z" fill={paint("amber")} />
      <ellipse cx="180" cy="104" rx="19" ry="5" fill="#8e4f26" /><ellipse cx="180" cy="104" rx="14" ry="3" fill="#52391f" />
      <path d="M146 174c5-12 16-24 19-39v-23" fill="none" stroke="#fce4b0" strokeOpacity=".5" strokeWidth="5" strokeLinecap="round" />
      <path d="M142 228c18 8 53 10 74 0" stroke="#ecbc76" opacity=".45" fill="none" />
    </>;
  } else if (lower.includes("bookend")) {
    art = <>
      <path d="M92 238V133a63 63 0 0 1 126 0v105h-38V134a25 25 0 0 0-50 0v104Z" fill="#c8b7a0" />
      <path d="M103 243V138a63 63 0 0 1 126 0v105h-38V139a25 25 0 0 0-50 0v104Z" fill={paint("stone")} />
      <path d="M182 240V139a26 26 0 0 0-43-19" fill="none" stroke="#b2a087" strokeWidth="3" />
      <path d="M238 238V166a47 47 0 0 0-94 0v72h29v-71a18 18 0 0 1 36 0v71Z" fill="#a7947b" />
      <path d="M248 245V173a47 47 0 0 0-94 0v72h29v-71a18 18 0 0 1 36 0v71Z" fill={paint("stone")} />
    </>;
  } else if (lower.includes("mug")) {
    art = <>
      <path d="M222 126h20c44 0 45 80-1 80h-20" fill="none" stroke="#b4b39d" strokeWidth="16" />
      <path d="M226 125h15c38 0 38 76-1 76h-14" fill="none" stroke="#d8d7c4" strokeWidth="11" />
      <path d="M109 116h119l-6 110c-2 26-104 27-106 0Z" fill={paint("cream")} />
      <ellipse cx="169" cy="116" rx="59" ry="14" fill="#dfdeca" /><ellipse cx="169" cy="117" rx="51" ry="10" fill="#999781" /><ellipse cx="169" cy="121" rx="46" ry="7" fill="#65513c" />
      <path d="m121 139 3 77" stroke="#f5f1e0" strokeWidth="7" strokeLinecap="round" opacity=".55" />
      <path d="M122 230c20 10 72 12 92 0" fill="none" stroke="#9c9b85" strokeOpacity=".35" strokeWidth="2" />
    </>;
  } else if (lower.includes("cushion") || lower.includes("throw")) {
    art = <>
      <path d="m94 96 164-7 19 150-177 15-15-22Z" fill="#777c56" />
      <path d="M94 96c57 12 101-12 164-7-8 52 10 96 19 150-62-3-110 20-177 15 10-53-13-108-6-158Z" fill={paint("olive")} />
      <path d="M106 111c48 9 92-8 138-7-5 40 8 87 14 121-45 0-96 15-143 15 5-45-10-89-9-129Z" fill="none" stroke="#b0b28a" strokeWidth="1" strokeDasharray="2 3" />
      <path d="m92 97 29 32m136-39-21 29m40 120-31-17m-143 30 23-31" stroke="#697048" strokeWidth="3" opacity=".6" />
      <path d="M149 118c-12 33-16 76-11 109m36-111c-4 40-1 74 7 105" stroke="#d3d2ab" strokeOpacity=".13" strokeWidth="14" fill="none" />
      <path d="m101 254 3-19m173 4-5-19" stroke="#4f573b" strokeWidth="2" />
    </>;
  } else if (lower.includes("board") || lower.includes("tray")) {
    art = <g transform="rotate(-16 180 160)">
      <path d="M155 72V44q0-12 12-12h26q12 0 12 12v28h30q15 0 15 15v150q0 15-15 15H125q-15 0-15-15V87q0-15 15-15Z" fill="#a47c4e" transform="translate(4 7)" />
      <path d="M155 72V44q0-12 12-12h26q12 0 12 12v28h30q15 0 15 15v150q0 15-15 15H125q-15 0-15-15V87q0-15 15-15Z" fill={paint("wood")} />
      <circle cx="180" cy="48" r="6" fill="#a38258" /><circle cx="180" cy="47" r="4.5" fill="#e8e1d6" />
      <g stroke="#9c7547" strokeOpacity=".23" fill="none"><path d="M130 87c-12 80 13 88-3 149m20-149c-8 70 9 88 0 156m20-163c-14 70 14 105 4 160m20-162c-11 90 14 103 7 158m21-155c-15 92 5 112-1 155m18-153c-2 70 10 90 0 134" /><path d="M151 142c28-20 43 60 12 63-22 3-33-46-12-63Z" /><ellipse cx="165" cy="175" rx="7" ry="19" /></g>
    </g>;
  } else if (lower.includes("candle")) {
    art = <>
      <path d="M180 86c-19-21 12-30 0-48 22 17 20 37 0 48Z" fill="#d2a46c" opacity=".8" /><path d="M180 82c-5-10 6-17 3-24 8 12 6 19-3 24Z" fill="#f6e2ab" />
      <path d="M180 98V84" stroke="#524131" strokeWidth="2" />
      <rect x="131" y="100" width="98" height="146" rx="10" fill={paint("cream")} />
      <g stroke="#b9b39c" strokeWidth="3" opacity=".6">{Array.from({ length: 12 }, (_, i) => <path key={i} d={`M${137 + i * 8} 107v131`} />)}</g>
      <ellipse cx="180" cy="101" rx="48" ry="9" fill="#e8dfc8" /><ellipse cx="180" cy="101" rx="17" ry="3" fill="#d8c9ae" />
      <path d="M180 100V88" stroke="#493c2c" strokeWidth="2" />
    </>;
  } else if (lower.includes("notebook")) {
    art = <g transform="rotate(-13 180 160)">
      <path d="M115 74h137v174H115Z" fill="#c3ae87" transform="translate(2 6)" />
      <path d="M120 75h130v171H120Z" fill="#f4ead7" transform="translate(3 2)" />
      <path d="M112 68h139v171H112Z" fill={paint("terracotta")} />
      <path d="M122 68v171" stroke="#774330" opacity=".3" strokeWidth="2" />
      <rect x="144" y="121" width="78" height="52" rx="1" fill="#e9d9ba" /><text x="183" y="141" textAnchor="middle" fontFamily="Georgia, serif" fontSize="10" fill="#736348">FIELD NOTES</text><path d="M164 151h37m-30 6h23" stroke="#a1957c" strokeWidth="1" />
      <path d="m225 241 9 15 4-15" fill="#595e47" />
    </g>;
  } else if (lower.includes("bowl")) {
    art = <>
      <path d="M80 146c9 97 38 108 100 108s93-11 101-108Z" fill={paint("terracotta")} />
      <ellipse cx="180" cy="146" rx="101" ry="31" fill="#d7a18a" /><ellipse cx="180" cy="145" rx="90" ry="24" fill="#a26046" /><ellipse cx="180" cy="149" rx="84" ry="20" fill="#bf8165" />
      <path d="M100 170c5 38 21 60 39 66" stroke="#e1b19a" strokeWidth="7" fill="none" strokeLinecap="round" opacity=".35" />
    </>;
  } else if (lower.includes("planter")) {
    art = <>
      <path d="M180 151V50m0 57c-18-32-39-42-48-40m48 20c21-30 32-33 48-34m-47 72c19-8 37-9 46-8" stroke="#656e45" strokeWidth="3" fill="none" />
      <g fill="#7e8557"><ellipse cx="155" cy="87" rx="11" ry="27" transform="rotate(-48 155 87)" /><ellipse cx="205" cy="70" rx="12" ry="27" transform="rotate(48 205 70)" /><ellipse cx="182" cy="54" rx="12" ry="27" transform="rotate(7 182 54)" /><ellipse cx="213" cy="117" rx="11" ry="24" transform="rotate(75 213 117)" /></g>
      <path d="m124 151 17 91c4 16 74 16 78 0l17-91Z" fill={paint("terracotta")} /><rect x="118" y="144" width="124" height="25" rx="5" fill="#ba8063" /><ellipse cx="180" cy="145" rx="62" ry="13" fill="#cb967b" /><ellipse cx="180" cy="145" rx="52" ry="8" fill="#60513e" />
    </>;
  } else if (lower.includes("tote")) {
    art = <>
      <path d="M141 126V87c0-52 79-52 79 0v39" fill="none" stroke="#b8a787" strokeWidth="12" /><path d="M145 123V86c0-45 70-45 70 0v37" fill="none" stroke="#e2d5b8" strokeWidth="7" />
      <path d="m112 117-13 129q82 17 165 0l-16-129Z" fill={paint("cream")} /><path d="m122 132-10 102q70 14 139 0l-11-102" stroke="#c4bda4" strokeWidth="1" strokeDasharray="2 3" fill="none" />
      <text x="181" y="193" textAnchor="middle" fontFamily="Georgia, serif" fontSize="15" fill="#7c8066">form & field</text><path d="m142 205 79-1" stroke="#7c8066" opacity=".4" />
    </>;
  } else {
    art = <><rect x="108" y="89" width="145" height="146" rx="15" fill={paint("stone")} /><circle cx="181" cy="161" r="37" fill="none" stroke="#ad9676" strokeWidth="2" /><path d="M155 185v-47h52v47" fill="none" stroke="#ad9676" strokeWidth="2" /></>;
  }
  return <svg viewBox="0 0 360 300" className={`h-full w-full ${className}`} role="img" aria-label={`Illustrated placeholder for ${name}`}>
    <defs>
      <linearGradient id={`${id}-amber`} x1="0" x2="1"><stop stopColor="#9b5b28" /><stop offset=".35" stopColor="#ca8b43" /><stop offset=".7" stopColor="#b37432" /><stop offset="1" stopColor="#815020" /></linearGradient>
      <linearGradient id={`${id}-cream`} x1="0" x2="1"><stop stopColor="#bdbca5" /><stop offset=".3" stopColor="#e5e1ca" /><stop offset=".65" stopColor="#d8d4bc" /><stop offset="1" stopColor="#aeac95" /></linearGradient>
      <linearGradient id={`${id}-stone`} x1="0" x2="1" y1="0" y2="1"><stop stopColor="#e0d4bd" /><stop offset=".55" stopColor="#d1c1a8" /><stop offset="1" stopColor="#bcaa8e" /></linearGradient>
      <linearGradient id={`${id}-wood`} x1="0" x2="1"><stop stopColor="#b78d57" /><stop offset=".4" stopColor="#d7b07b" /><stop offset="1" stopColor="#bd945c" /></linearGradient>
      <linearGradient id={`${id}-terracotta`} x1="0" x2="1"><stop stopColor="#b1765c" /><stop offset=".3" stopColor="#cf967a" /><stop offset=".7" stopColor="#bc8267" /><stop offset="1" stopColor="#945c43" /></linearGradient>
      <linearGradient id={`${id}-olive`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#939776" /><stop offset=".45" stopColor="#858d64" /><stop offset=".8" stopColor="#a0a382" /><stop offset="1" stopColor="#767e55" /></linearGradient>
      <radialGradient id={`${id}-shadow`}><stop stopColor="#4c4434" stopOpacity=".19" /><stop offset="1" stopColor="#4c4434" stopOpacity="0" /></radialGradient>
      <pattern id={`${id}-grain`} width="19" height="23" patternUnits="userSpaceOnUse"><circle cx="3" cy="5" r=".55" fill="#8d775c" opacity=".13" /><circle cx="15" cy="18" r=".4" fill="#fff" opacity=".2" /></pattern>
    </defs>
    <ellipse cx="182" cy="253" rx="114" ry="19" fill={paint("shadow")} />
    {art}
    <rect width="360" height="300" fill={paint("grain")} pointerEvents="none" />
  </svg>;
}

export function HeroArt() {
  const id = useId().replace(/:/g, "");
  return <svg viewBox="0 0 600 420" className="h-full w-full" role="img" aria-label="An illustrated still life of earthy ceramics, olive branches and linen">
    <defs>
      <linearGradient id={`${id}-vase`} x1="0" x2="1"><stop stopColor="#935738" /><stop offset=".3" stopColor="#b87755" /><stop offset=".65" stopColor="#b47854" /><stop offset="1" stopColor="#895032" /></linearGradient>
      <linearGradient id={`${id}-small`} x1="0" x2="1"><stop stopColor="#b0af98" /><stop offset=".4" stopColor="#d9d5bd" /><stop offset="1" stopColor="#9b9e83" /></linearGradient>
      <linearGradient id={`${id}-bowl`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#dbccb1" /><stop offset="1" stopColor="#b1a28a" /></linearGradient>
      <radialGradient id={`${id}-shade`}><stop stopColor="#4b4437" stopOpacity=".2" /><stop offset="1" stopColor="#4b4437" stopOpacity="0" /></radialGradient>
      <linearGradient id={`${id}-wall`} x1="0" x2="1" y1="0" y2="1"><stop stopColor="#e7e0d3" /><stop offset="1" stopColor="#d9d0be" /></linearGradient>
    </defs>
    <path d="M188 323V139a113 113 0 0 1 226 0v184Z" fill={`url(#${id}-wall)`} />
    <circle cx="319" cy="168" r="123" fill="#c5bea5" opacity=".18" />
    <path d="M0 339h600v81H0Z" fill="#d5cbb8" opacity=".48" />
    <path d="M0 339h600" stroke="#c7bda9" strokeOpacity=".35" />
    <path d="m126 306 115 19 225 4 70 91H53l20-38 32-33Z" fill="#e8e1d2" />
    <path d="m126 306 115 19 225 4m-288 4-35 87m89-83-14 83m207-68 18 68m-312-47 215 19" stroke="#c9bfa9" strokeWidth="1.4" opacity=".45" fill="none" />
    <ellipse cx="293" cy="352" rx="128" ry="22" fill={`url(#${id}-shade)`} />
    <ellipse cx="415" cy="374" rx="110" ry="16" fill={`url(#${id}-shade)`} />
    <path d="M312 181c-5-71-37-120-72-151m68 102c21-39 50-60 84-78m-88 54c-33-18-53-18-81-17m55-6c-3-25-16-41-29-56m-2 51c-5-25-18-42-33-53m117 68c6-31 16-41 33-53m-61 81c29 1 43-7 63-22" stroke="#686b49" strokeWidth="2.4" fill="none" />
    <g fill="#727857">
      <ellipse cx="252" cy="46" rx="7" ry="20" transform="rotate(-35 252 46)" /><ellipse cx="268" cy="62" rx="7" ry="19" transform="rotate(16 268 62)" /><ellipse cx="281" cy="79" rx="7" ry="19" transform="rotate(-40 281 79)" /><ellipse cx="262" cy="99" rx="7" ry="21" transform="rotate(-71 262 99)" /><ellipse cx="229" cy="92" rx="6" ry="17" transform="rotate(-77 229 92)" /><ellipse cx="228" cy="52" rx="6" ry="17" transform="rotate(-26 228 52)" /><ellipse cx="326" cy="111" rx="7" ry="19" transform="rotate(41 326 111)" /><ellipse cx="356" cy="80" rx="7" ry="20" transform="rotate(52 356 80)" /><ellipse cx="384" cy="59" rx="6" ry="17" transform="rotate(55 384 59)" /><ellipse cx="351" cy="55" rx="6" ry="17" transform="rotate(22 351 55)" /><ellipse cx="363" cy="104" rx="6" ry="19" transform="rotate(68 363 104)" />
    </g>
    <g fill="#94977a"><ellipse cx="241" cy="29" rx="5" ry="15" transform="rotate(-37 241 29)" /><ellipse cx="296" cy="94" rx="6" ry="16" transform="rotate(9 296 94)" /><ellipse cx="336" cy="72" rx="6" ry="18" transform="rotate(-12 336 72)" /></g>
    <path d="M287 171h45v44c1 26 34 45 40 78 7 36-23 56-64 56-48 0-78-15-72-54 5-33 49-52 51-79Z" fill={`url(#${id}-vase)`} />
    <ellipse cx="309" cy="171" rx="23" ry="6" fill="#b17a58" /><ellipse cx="309" cy="171" rx="17" ry="3" fill="#6f492e" />
    <path d="M287 190v22c-2 32-36 48-39 83" stroke="#d2a382" strokeWidth="7" strokeLinecap="round" fill="none" opacity=".26" />
    <path d="M162 251h29v18c0 13 24 22 24 49 0 25-18 35-43 35s-39-10-37-33c2-26 27-36 27-51Z" fill={`url(#${id}-small)`} /><ellipse cx="176" cy="251" rx="15" ry="4" fill="#a3a48c" /><ellipse cx="176" cy="251" rx="10" ry="2" fill="#777962" />
    <path d="M349 326c4 39 25 46 67 46 39 0 64-7 72-46Z" fill={`url(#${id}-bowl)`} /><ellipse cx="419" cy="326" rx="70" ry="17" fill="#ded0b8" /><ellipse cx="419" cy="326" rx="61" ry="11" fill="#aa9a80" /><ellipse cx="419" cy="330" rx="55" ry="8" fill="#c6b69a" />
    <path d="M349 314c-18 7-27 16-43 37m25-23c13 1 22 5 33 8m-39 0c-2-10-5-13-10-16" stroke="#6e7450" strokeWidth="1.5" fill="none" /><ellipse cx="353" cy="332" rx="5" ry="14" fill="#868c69" transform="rotate(74 353 332)" /><ellipse cx="316" cy="327" rx="4" ry="11" fill="#7d8260" transform="rotate(-26 316 327)" />
    <path d="M551 56v36m-18-18h36" stroke="#b49d7b" strokeWidth="1" /><circle cx="551" cy="74" r="14" stroke="#b49d7b" fill="none" strokeWidth="1" />
    <text x="532" y="385" fontFamily="Georgia, serif" fontStyle="italic" fontSize="13" fill="#8c826f">a quieter kind of good.</text>
  </svg>;
}
