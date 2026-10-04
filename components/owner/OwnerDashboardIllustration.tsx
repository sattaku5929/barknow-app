type OwnerDashboardIllustrationProps = {
  className?: string;
};

export default function OwnerDashboardIllustration({ className = "" }: OwnerDashboardIllustrationProps) {
  return (
    <svg
      className={`owner-dashboard-illustration ${className}`.trim()}
      viewBox="0 0 360 250"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="owner-city-sky" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F9FAFB" />
          <stop offset="100%" stopColor="#EEF4F1" />
        </linearGradient>
        <linearGradient id="owner-walkway" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#E9E2D7" />
          <stop offset="100%" stopColor="#F4EEE5" />
        </linearGradient>
      </defs>

      <rect x="2" y="2" width="356" height="246" rx="30" fill="url(#owner-city-sky)" />
      <path d="M0 191C65 175 115 181 166 197C224 215 292 220 360 197V250H0Z" fill="url(#owner-walkway)" />

      <g fill="none" stroke="#24483D" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M25 162V84h63v78" />
        <path d="M36 96h16M62 96h15M36 116h16M62 116h15M36 136h16M62 136h15" opacity=".45" />
        <path d="M84 162V104h52v58" />
        <path d="M96 117h28M96 136h28" opacity=".38" />

        <path d="M278 161V88h56v73" />
        <path d="M290 101h31M290 121h31M290 141h31" opacity=".38" />

        <path d="M149 162v-44h39v44" opacity=".55" />
        <path d="M160 130h17" opacity=".38" />

        <path d="M238 166c2-27 3-46 2-61" />
        <path d="M240 108c-17-4-23-19-12-31c8 3 14 8 16 15" fill="#AABFD0" stroke="#24483D" />
        <path d="M242 103c15-7 25-3 31 9c-7 10-18 13-31 7" fill="#C8D8CF" stroke="#24483D" />

        <path d="M103 176c13-10 29-10 42 1" opacity=".22" />
        <path d="M209 189c25-13 53-11 74 2" opacity=".22" />
      </g>

      <g>
        <ellipse cx="192" cy="208" rx="61" ry="8" fill="#CFC5B6" opacity=".36" />

        <g fill="none" stroke="#183D32" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M165 187c0-20 4-39 13-56c4-8 11-13 20-13c9 0 16 5 20 13c7 14 10 33 9 56" fill="#D9E3DB" />
          <path d="M181 119c1-11 8-20 17-20c10 0 17 9 18 20" fill="#E5C8A6" />
          <path d="M187 100c2-10 9-17 18-17c7 0 13 4 17 11c-8-3-15-2-21 2c-5 3-9 5-14 4Z" fill="#24483D" />
          <path d="M193 124c2 3 5 5 9 5c4 0 7-2 9-5" opacity=".55" />
          <path d="M183 146c10 6 21 6 32 0" opacity=".32" />
          <path d="M177 186l-5 28M216 186l7 28" />
          <path d="M169 214h12M216 214h13" />
          <path d="M176 154c-12 8-22 17-28 28" />
          <path d="M216 155c10 5 18 12 24 21" />
          <path d="M148 182c-3 2-4 6-1 9c3 3 7 2 9-1" />
        </g>

        <g fill="none" stroke="#183D32" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M129 194c-4-13 2-25 15-30c12-5 25 0 30 10c4 8 2 18-5 24c-6 5-15 7-24 5c-8-2-13-4-16-9Z" fill="#E7C5A4" />
          <path d="M137 166c-5-10-2-18 7-22c5 5 7 10 6 16" fill="#E7C5A4" />
          <path d="M158 165c4-9 11-13 19-10c0 8-4 14-11 18" fill="#E7C5A4" />
          <path d="M148 179c1 2 3 3 5 3c2 0 4-1 5-3" />
          <path d="M148 190c6 3 12 3 18 0" opacity=".55" />
          <path d="M140 201l-2 14M160 202l3 13" />
          <path d="M134 216h9M158 216h10" />
          <path d="M171 191c9 2 15 7 19 13" />
          <path d="M132 187c-8 0-14-3-19-9c-3-4-2-8 1-10" />
        </g>

        <path d="M157 166c11 7 20 14 30 24" fill="none" stroke="#008661" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="187" cy="191" r="3.5" fill="#008661" />
      </g>

      <g fill="none" stroke="#008661" strokeWidth="2" strokeLinecap="round" opacity=".55">
        <path d="M61 61c8-7 18-7 26 0" />
        <path d="M69 53c3-2 7-2 10 0" />
        <path d="M287 63c8-7 18-7 26 0" />
      </g>
    </svg>
  );
}
