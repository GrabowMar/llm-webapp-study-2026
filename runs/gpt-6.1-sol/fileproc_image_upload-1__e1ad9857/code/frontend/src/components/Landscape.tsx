export default function Landscape() {
  return (
    <svg viewBox="0 0 1000 500" preserveAspectRatio="xMidYMid slice" className="h-full w-full" role="img" aria-label="An illustrated sun setting over quiet mountains and a shimmering lake">
      <defs>
        <linearGradient id="sky" x2="0" y2="1"><stop stopColor="#b6c3b4" /><stop offset=".56" stopColor="#e4d7b9" /><stop offset="1" stopColor="#edd2af" /></linearGradient>
        <linearGradient id="water" x2="0" y2="1"><stop stopColor="#93a89a" /><stop offset="1" stopColor="#4e756b" /></linearGradient>
        <linearGradient id="front" x2=".8" y2="1"><stop stopColor="#426054" /><stop offset="1" stopColor="#183a31" /></linearGradient>
        <linearGradient id="fade"><stop stopColor="#eaece1" /><stop offset=".32" stopColor="#eaece1" stopOpacity="0" /></linearGradient>
        <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="3" stitchTiles="stitch" /><feColorMatrix type="saturate" values="0" /><feComponentTransfer><feFuncA type="linear" slope=".14" /></feComponentTransfer><feBlend in="SourceGraphic" mode="multiply" /></filter>
      </defs>
      <g filter="url(#grain)">
        <path fill="url(#sky)" d="M0 0h1000v500H0z" />
        <circle cx="696" cy="134" r="43" fill="#f6e5bc" />
        <path fill="#aeb9a8" d="m0 254 80-65 55 30 88-92 52 50 34-17 76 91 75-42 74 31 85-80 91 58 54-34 92 56 78-69 66 68V500H0Z" />
        <path fill="#91a490" d="m0 288 62-37 43 13 101-89 96 121 96-48 44 31 122-98 65 59 42-13 54 47 98-98 80 110 97-46v260H0Z" />
        <path fill="#6d8a78" d="m0 320 83-89 88 103 37-31 69 42 65-56 52 15 92-89 30 41 27-13 91 102 57-24 67 30 64-62 91 43 89-79v247H0Z" />
        <path fill="url(#water)" d="M0 350q209-37 391 13t609-30v167H0Z" />
        <g fill="none" stroke="#e0d8b7" strokeWidth="1" opacity=".44"><path d="M542 377h173m-214 13h221m-180 14h194m-145 12h94m-183 12h232m-275 16h326m-391 18h438m-454 17h418" /></g>
        <path fill="#466a57" d="m0 361 42-57 28 6 50-72 86 113 78 33 123 33-86 27L0 432Z" />
        <path fill="url(#front)" d="m1000 193-60 63-49 19-35 76-83 43-122 48-174 58h523Z" />
        <g fill="#284d3d"><path d="m929 243-18 72h13v63h10v-63h14Zm-75 72-17 56h11v49h10v-49h11Zm-60 41-14 43h9v40h9v-40h10Zm-619-58-15 45h10v39h9v-39h11ZM66 283l-22 68h15v57h11v-57h15Z" /></g>
        <path fill="#264b3e" d="M0 444q148-50 287-6t130 62H0Z" />
        <path fill="url(#fade)" d="M0 0h1000v500H0z" />
      </g>
      <g fill="none" stroke="#557060" strokeWidth="1.5" opacity=".65"><path d="m790 89 7-4 7 4m19 12 6-3 6 3m-59 6 5-3 5 3" /></g>
    </svg>
  );
}
