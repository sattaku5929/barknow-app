import type { HouseholdMember } from "@/lib/observations/observationEvent";
export default function EventHandlerSelector({ members, value, onChange }: {
  members: HouseholdMember[]; value: string | null; onChange: (id: string | null) => void;
}) {
  return <fieldset className="event-handler"><legend>主に対応した人 <span>任意</span></legend>
    {members.length ? <div className="event-handler-chips">{members.map((member) => <button type="button" key={member.id}
      aria-pressed={value === member.id} className={value === member.id ? "is-selected" : ""}
      onClick={() => onChange(value === member.id ? null : member.id)}>{member.display_name}</button>)}</div>
      : <p>設定から家族・お世話する人を追加できます。</p>}
  </fieldset>;
}
