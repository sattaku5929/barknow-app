"use client";

type PasswordVisibilityButtonProps = {
  visible: boolean;
  onToggle: () => void;
  label: string;
};

export default function PasswordVisibilityButton({ visible, onToggle, label }: PasswordVisibilityButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      onMouseDown={(event) => event.preventDefault()}
      aria-label={`${label}を${visible ? "非表示" : "表示"}にする`}
      aria-pressed={visible}
      title={visible ? "パスワードを隠す" : "パスワードを表示"}
      style={{
        position: "absolute",
        top: "50%",
        right: 6,
        transform: "translateY(-50%)",
        width: 44,
        height: 44,
        display: "grid",
        placeItems: "center",
        background: "transparent",
        border: 0,
        borderRadius: 8,
        padding: 0,
        color: "#42645a",
        cursor: "pointer",
      }}
    >
      {visible ? (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 3l18 18" />
          <path d="M10.58 10.59a2 2 0 0 0 2.83 2.83" />
          <path d="M9.88 5.09A10.7 10.7 0 0 1 12 4.9c5 0 8.7 4 10 7.1a12 12 0 0 1-3.01 4.12" />
          <path d="M6.1 6.12C4.1 7.43 2.8 9.54 2 12c1.3 3.1 5 7.1 10 7.1 1.46 0 2.8-.34 4.02-.92" />
        </svg>
      ) : (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.6-7.1 10-7.1S22 12 22 12s-3.6 7.1-10 7.1S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );
}
