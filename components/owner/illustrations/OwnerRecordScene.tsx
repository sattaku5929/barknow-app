import { RECORD_SCENE_IMAGE } from "./recordSceneData";

type OwnerRecordSceneProps = { className?: string };

export default function OwnerRecordScene({ className = "" }: OwnerRecordSceneProps) {
  return (
    <img
      className={`owner-scene owner-scene--record ${className}`.trim()}
      src={RECORD_SCENE_IMAGE}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  );
}
