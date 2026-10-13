type OwnerAppBackdropProps = { className?: string };

/** Quiet pools of color, drawn with CSS rather than decorative line art. */
export default function OwnerAppBackdrop({ className = "" }: OwnerAppBackdropProps) {
  return <div className={`owner-app-backdrop ${className}`.trim()} aria-hidden="true">
    <span className="owner-ambient-orb owner-ambient-orb--sage" />
    <span className="owner-ambient-orb owner-ambient-orb--sand" />
  </div>;
}
