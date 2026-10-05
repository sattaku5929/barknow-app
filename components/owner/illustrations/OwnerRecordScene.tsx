type OwnerRecordSceneProps = { className?: string };

export default function OwnerRecordScene({ className = "" }: OwnerRecordSceneProps) {
  return (
    <svg className={`owner-scene owner-scene--record ${className}`.trim()} viewBox="0 0 360 220" aria-hidden="true" focusable="false">
      <rect width="360" height="220" rx="24" fill="#F9F6F1" />
      <rect y="138" width="360" height="82" fill="#F2EBE2" />
      <rect y="96" width="360" height="44" fill="#DDEAF0" />
      <path d="M0 128c45-8 80-26 110-54" stroke="#8AAE94" strokeWidth="10" strokeLinecap="round" />
      <circle cx="72" cy="62" r="34" fill="#D9E7DD" />
      <path d="M61 38c-18 4-34 17-39 34m83-23c10 7 16 17 18 29" stroke="#7FA487" strokeWidth="8" strokeLinecap="round" />
      <rect x="52" y="112" width="104" height="10" rx="5" fill="#B78C64" />
      <rect x="60" y="121" width="8" height="34" rx="4" fill="#40565F" />
      <rect x="140" y="121" width="8" height="34" rx="4" fill="#40565F" />
      <rect x="242" y="52" width="20" height="58" rx="5" fill="#C7D8E3" />
      <rect x="270" y="40" width="24" height="70" rx="5" fill="#C1D3DF" />
      <rect x="302" y="61" width="18" height="49" rx="5" fill="#CDD9E2" />
      <circle cx="152" cy="100" r="16" fill="#F6D4CB" />
      <path d="M139 96c5-14 20-20 33-9c-4 2-8 4-13 4c-7 0-13 1-20 5Z" fill="#312B2B" />
      <rect x="128" y="114" width="50" height="52" rx="16" fill="#008661" />
      <path d="M119 164l12 27M156 164l-7 31" stroke="#F5EEE5" strokeWidth="11" strokeLinecap="round" />
      <path d="M116 193h22M141 195h22" stroke="#FFF" strokeWidth="5" strokeLinecap="round" />
      <rect x="160" y="108" width="18" height="30" rx="5" fill="#F5F5F5" stroke="#D6DDE1" strokeWidth="2" />
      <circle cx="170" cy="114" r="1.5" fill="#C0C6CA" />
      <circle cx="174" cy="114" r="1.5" fill="#C0C6CA" />
      <path d="M158 130l-12 8" stroke="#F6D4CB" strokeWidth="5" strokeLinecap="round" />
      <path d="M178 168c0-16 10-28 28-28c24 0 44 15 44 35c0 13-11 23-26 23h-23c-13 0-23-8-23-18Z" fill="#E5C89D" />
      <circle cx="204" cy="152" r="12" fill="#FFF" />
      <ellipse cx="207" cy="153" rx="2.6" ry="2.6" fill="#2A2A2A" />
      <path d="M195 158c3 3 7 5 12 5s9-1 12-4" stroke="#2A2A2A" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="214" cy="170" r="4" fill="#008661" />
      <path d="M181 166c-10-2-18 0-25 4" stroke="#008661" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
