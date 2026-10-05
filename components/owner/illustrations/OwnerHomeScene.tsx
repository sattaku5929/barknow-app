import { HOME_SCENE_IMAGE } from "./homeSceneData";

type OwnerHomeSceneProps = { className?: string };

export default function OwnerHomeScene({ className = "" }: OwnerHomeSceneProps) {
  return (
    <img
      className={`owner-scene owner-scene--home ${className}`.trim()}
      src={HOME_SCENE_IMAGE}
      alt=""
      aria-hidden="true"
      loading="eager"
      decoding="async"
      draggable={false}
    />
  );
}
