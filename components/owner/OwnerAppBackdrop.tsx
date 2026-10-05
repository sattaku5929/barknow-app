type OwnerAppBackdropProps = {
  className?: string;
};

export default function OwnerAppBackdrop({ className = "" }: OwnerAppBackdropProps) {
  return (
    <svg
      className={`owner-app-backdrop ${className}`.trim()}
      viewBox="0 0 760 1180"
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMid slice"
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <g className="owner-app-backdrop__city" strokeWidth="1.5">
          <path d="M56 170V94h82v76M76 112h16m22 0h10M76 136h16m22 0h10" />
          <path d="M622 258v-94h77v94m-58-69h17m-17 25h17" />
          <path d="M96 842v-84h69v84m-50-60h16m-16 25h16" />
          <path d="M598 1017v-93h87v93m-64-67h18m-18 27h18" />
        </g>

        <g className="owner-app-backdrop__life" strokeWidth="1.8">
          <path d="M567 113c-1-23 1-43 7-61m0 12c-13-8-18-19-11-31c13 4 19 12 18 25m-6 8c12-10 25-9 34 1c-4 13-14 20-31 20" />
          <path d="M184 1036c1-22 3-40 8-57m-1 10c-12-8-17-18-11-28c12 2 19 10 19 22m-5 8c11-9 23-9 31-1c-3 12-13 19-29 19" />

          <path d="M617 531c8-14 17-24 28-31c8-5 17-4 25 1c8 5 12 13 12 23c0 11-5 20-14 27c-9 7-20 10-31 7c-10-2-17-7-20-15c-3-5-3-8 0-12Z" />
          <path d="M629 505c-4-11 0-20 10-25c6 5 9 12 7 21m19 3c5-10 13-14 22-10c0 10-5 17-14 22" />
          <path d="M639 530c2 3 5 5 9 5s7-2 9-5m-23 17l-2 16m24-15l4 15m-31 0h10m17 0h11" />
          <path d="M606 540c-10 2-18 0-24-7c-4-5-3-10 1-13" />
        </g>

        <g className="owner-app-backdrop__park" strokeWidth="1.6">
          <path d="M55 438c42-20 82-23 119-9m416 267c40-18 78-20 115-8" />
          <path d="M106 405c1-31 4-57 11-78m-1 13c-17-10-23-24-15-39c17 4 26 14 27 31m-8 11c15-13 31-13 42 0c-4 17-17 26-39 26" />
          <path d="M641 666c1-31 4-57 11-78m-1 13c-17-10-23-24-15-39c17 4 26 14 27 31m-8 11c15-13 31-13 42 0c-4 17-17 26-39 26" />
        </g>

        <g className="owner-app-backdrop__details" strokeWidth="1.4">
          <path d="M291 76c12-9 27-9 39 0m-28-12c4-3 10-3 14 0M440 928c12-9 27-9 39 0m-28-12c4-3 10-3 14 0" />
          <path d="M61 622c18 4 31 14 40 29m548-254c17 3 31 13 41 28" />
        </g>
      </g>
    </svg>
  );
}
