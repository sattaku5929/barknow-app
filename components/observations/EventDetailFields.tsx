import type { ObservationEvent } from "@/lib/observations/observationEvent";
import EventIntensitySelector from "./EventIntensitySelector";
import EventSecondsField from "./EventSecondsField";

type Update = (patch: Partial<ObservationEvent>) => void;
const choices = {
  stateBefore: [["", "選択しない"], ["calm", "落ち着いていた"], ["excited", "興奮していた"], ["tired", "疲れていた"], ["hungry", "お腹が空いていた"], ["uneasy", "そわそわしていた"], ["unknown", "分からない"]],
  environment: [["", "選択しない"], ["home", "家"], ["street", "道"], ["park", "公園"], ["cafe", "カフェ"], ["shop", "お店"], ["daycare", "保育園"], ["vehicle", "乗り物"], ["other", "その他"]],
  targetType: [["", "選択しない"], ["dog", "犬"], ["person", "人"], ["sound", "音"], ["object", "物"], ["owner", "飼い主"], ["none", "対象なし"], ["other", "その他"]],
  distanceBand: [["", "選択しない"], ["under_1m", "1m未満"], ["1_3m", "1〜3m"], ["3_5m", "3〜5m"], ["5_10m", "5〜10m"], ["over_10m", "10m以上"], ["unknown", "分からない"]],
  outcome: [["", "選択しない"], ["no_reaction", "反応しなかった"], ["settled_quickly", "すぐ落ち着いた"], ["partly_settled", "少し落ち着いた"], ["unchanged", "変わらなかった"], ["escalated", "反応が強くなった"]],
};
function Select({ label, value, options, onChange }: { label: string; value: string | null; options: string[][]; onChange: (value: string | null) => void }) {
  return <label className="field-label">{label}<select className="event-select" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>;
}
export function EventSituationFields({ value, update }: { value: ObservationEvent; update: Update }) {
  return <div className="event-field-pair">
    <Select label="その前の様子" value={value.stateBefore} options={choices.stateBefore} onChange={(stateBefore) => update({ stateBefore })} />
    <Select label="場所・環境" value={value.environment} options={choices.environment} onChange={(environment) => update({ environment })} />
  </div>;
}
export default function EventDetailFields({ value, update }: { value: ObservationEvent; update: Update }) {
  return <div className="event-detail-fields">
    <Select label="相手・対象" value={value.targetType} options={choices.targetType} onChange={(targetType) => update({ targetType })} />
    <Select label="距離感" value={value.distanceBand} options={choices.distanceBand} onChange={(distanceBand) => update({ distanceBand })} />
    <EventIntensitySelector value={value.intensity} onChange={(intensity) => update({ intensity })} />
    <EventSecondsField label="続いた時間" value={value.durationSeconds} onChange={(durationSeconds) => update({ durationSeconds })} />
    <label className="field-label">飼い主がしたこと<select className="event-select" value={value.ownerResponseKeys?.[0] ?? ""} onChange={(e) => update({ ownerResponseKeys: e.target.value ? [e.target.value] : null })}>
      <option value="">選択しない</option><option value="soothed">声をかけた</option><option value="waited">見守った</option><option value="moved_away">距離を取った</option><option value="redirected">気をそらした</option><option value="other">その他</option>
    </select></label>
    <Select label="その後どうなったか" value={value.outcome} options={choices.outcome} onChange={(outcome) => update({ outcome })} />
    <EventSecondsField label="落ち着くまでの時間" value={value.recoverySeconds} onChange={(recoverySeconds) => update({ recoverySeconds })} />
  </div>;
}
