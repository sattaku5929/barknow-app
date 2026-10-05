type OwnerReportSceneProps = { className?: string };

export default function OwnerReportScene({ className = "" }: OwnerReportSceneProps) {
  return (
    <svg className={`owner-scene owner-scene--report ${className}`.trim()} viewBox="0 0 360 230" aria-hidden="true" focusable="false">
      <rect width="360" height="230" rx="24" fill="#FBF8F3" />
      <rect x="218" y="28" width="104" height="104" rx="9" fill="#F3F6F7" />
      <rect x="228" y="38" width="84" height="84" rx="5" fill="#DEE9EF" />
      <rect x="228" y="96" width="84" height="26" fill="#D4E2DA" />
      <rect x="22" y="34" width="58" height="70" rx="8" fill="#F8F4EF" />
      <rect x="88" y="26" width="72" height="84" rx="8" fill="#F8F4EF" />
      <rect x="168" y="42" width="42" height="54" rx="8" fill="#F8F4EF" />
      <circle cx="36" cy="41" r="4" fill="#008661" />
      <circle cx="100" cy="33" r="4" fill="#008661" />
      <path d="M41 79c0-12 8-20 18-20c11 0 18 8 18 18c0 10-8 18-18 18c-11 0-18-6-18-16Z" fill="#DCE8DE" />
      <path d="M50 78c4-8 15-12 24-7" fill="none" stroke="#C98A58" strokeWidth="4" strokeLinecap="round" />
      <path d="M109 56c10-10 27-12 40-1M108 80c12-11 27-14 41-8" stroke="#C98A58" strokeWidth="4" strokeLinecap="round" />
      <path d="M176 70h20M176 80h17M176 90h13" stroke="#B8C5C8" strokeWidth="3" strokeLinecap="round" />
      <rect x="28" y="174" width="304" height="38" rx="18" fill="#F2ECE2" />
      <circle cx="150" cy="117" r="18" fill="#F6D4CB" />
      <path d="M136 113c5-15 20-21 34-9c-4 2-8 4-13 4c-7 0-13 1-21 5Z" fill="#312B2B" />
      <rect x="126" y="131" width="64" height="56" rx="18" fill="#008661" />
      <rect x="158" y="135" width="26" height="33" rx="4" fill="#F1E9DC" />
      <path d="M162 144h17M162 151h15M162 158h11" stroke="#BCC5C7" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M146 187l-19 18M168 187l14 18" stroke="#F5EEE5" strokeWidth="11" strokeLinecap="round" />
      <path d="M122 205h18M173 205h18" stroke="#FFF" strokeWidth="5" strokeLinecap="round" />
      <path d="M198 175c0-15 10-25 24-25c21 0 45 12 45 31c0 12-10 22-25 22h-24c-12 0-20-8-20-18Z" fill="#C98A58" />
      <circle cx="214" cy="161" r="12" fill="#FFF" />
      <ellipse cx="217" cy="162" rx="2.6" ry="2.6" fill="#2A2A2A" />
      <path d="M207 166c3 3 7 5 12 5s9-1 12-4" stroke="#2A2A2A" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="222" cy="177" r="4" fill="#008661" />
    </svg>
  );
}
