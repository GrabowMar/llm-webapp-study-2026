export default function BookIllustration() {
  return (
    <div className="relative mx-auto w-full max-w-[440px] select-none" aria-hidden="true">
      <svg viewBox="0 0 480 300" className="w-full overflow-visible" fill="none">
        <circle cx="262" cy="143" r="125" fill="#e9eddf" />
        <circle cx="262" cy="143" r="105" stroke="#d7dec9" strokeDasharray="3 8" />
        <ellipse cx="264" cy="258" rx="155" ry="10" fill="#dce2d2" opacity=".65" />
        <path d="M132 223 369 218 375 242 139 248Q123 248 122 236Q121 225 132 223" fill="#78927a" />
        <path d="m140 225 227-5 4 19-229 6Q132 244 132 236Q131 229 140 225" fill="#f6f1df" />
        <path d="m151 232 210-5m-210 10 210-5" stroke="#dbd6c5" />
        <path d="M135 223 369 218M141 248l234-6" stroke="#446d51" strokeWidth="3" strokeLinecap="round" />
        <path d="m155 192 225 9-3 22-226-9q-11-1-10-13t14-9" fill="#d9a16c" />
        <path d="m158 196 211 8-2 14-209-8q-9 0-9-7t9-7" fill="#f7f1de" />
        <path d="m170 202 195 7m-195-2 195 7" stroke="#e3d6bc" />
        <path d="m154 191 226 10m-227 13 224 9" stroke="#b87949" strokeWidth="3" strokeLinecap="round" />
        <g transform="rotate(-11 232 140)">
          <path d="M150 79q0-10 11-10h146q10 0 10 10v113H151Z" fill="#315c48" />
          <path d="M157 80h150v109H157Z" fill="#f8f3e1" />
          <path d="M156 186h151v9H159q-10 0-10-8V80q0-12 11-12h149" stroke="#284d3b" strokeWidth="5" strokeLinecap="round" />
          <path d="M161 65h143q11 0 11 11v107H162q-11 0-11-11V76q0-11 10-11" fill="#52745b" />
          <path d="M164 65v118" stroke="#35563e" strokeWidth="2" />
          <rect x="181" y="83" width="113" height="82" rx="1" stroke="#c9d3b3" strokeWidth=".8" />
          <path d="m189 92 5-1m84 67 6-1" stroke="#c9d3b3" />
          <text x="237" y="115" fill="#f4efd8" fontFamily="Georgia, serif" fontSize="17" textAnchor="middle">One more</text>
          <text x="237" y="135" fill="#f4efd8" fontFamily="Georgia, serif" fontSize="17" textAnchor="middle">chapter.</text>
          <path d="M224 149h26" stroke="#c9d3b3" strokeWidth=".8" />
          <path d="m276 182 0 27 10-7 8 7v-27" fill="#c98554" />
        </g>
        <path d="M358 185q-1-72 28-116" stroke="#668060" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M365 125q-32-22-22-47 26 10 22 47M374 106q-7-32 15-44 8 26-15 44M364 141q27-4 34-25-27-6-34 25M360 160q-31-12-29-34 28 2 29 34" fill="#809675" />
        <path d="m104 116 3-9 3 9 9 3-9 3-3 9-3-9-9-3 9-3" fill="#b9a176" />
        <path d="m344 47 2-6 2 6 6 2-6 2-2 6-2-6-6-2 6-2" fill="#809675" />
        <circle cx="123" cy="186" r="3" fill="#b5c1a2" />
        <circle cx="406" cy="174" r="3" fill="#c7aa7b" />
        <path d="m87 173 12-5m307-65 9-5" stroke="#b6bca7" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <div className="absolute -bottom-2 left-1/2 w-max -translate-x-1/2 -rotate-4 rounded-full border border-[#e0e3d7] bg-[#fcfcf7] px-5 py-2.5 font-serif text-[17px] italic text-[#63765c] shadow-[0_3px_10px_#283e3205]">A good book is even better shared.</div>
    </div>
  );
}
