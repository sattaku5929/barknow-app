import { REPORT_SCENE_IMAGE } from "./reportSceneData";

type OwnerReportSceneProps = { className?: string };

export default function OwnerReportScene({ className = "" }: OwnerReportSceneProps) {
  return (
    <img
      className={`owner-scene owner-scene--report ${className}`.trim()}
      src={REPORT_SCENE_IMAGE}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  );
}
