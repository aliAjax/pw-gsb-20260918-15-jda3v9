import { SLOT_STATUS_LABEL, SIZE_LABEL } from "../domain";
import type { AppState, SizeClass, Slot } from "../types";

interface Props {
  state: AppState;
  onClean: (slotId: string) => void;
  onOpenSpecimen: (specimenId: string) => void;
}

const ORDER: SizeClass[] = ["small", "medium", "large"];

function SlotCell({
  slot,
  state,
  onClean,
  onOpenSpecimen,
}: {
  slot: Slot;
  state: AppState;
  onClean: (slotId: string) => void;
  onOpenSpecimen: (specimenId: string) => void;
}) {
  const occupant = slot.specimenId
    ? state.specimens.find((s) => s.id === slot.specimenId)
    : undefined;

  return (
    <div className={`slot slot-${slot.status}`} title={SLOT_STATUS_LABEL[slot.status]}>
      <div className="slot-head">
        <b>{slot.id}</b>
        <span className="slot-size">{SIZE_LABEL[slot.slotSize]}格</span>
      </div>
      <div className="slot-body">
        <span className={`slot-status dot-${slot.status}`}>
          {SLOT_STATUS_LABEL[slot.status]}
        </span>
        {occupant && (
          <button className="link" onClick={() => onOpenSpecimen(occupant.id)}>
            {occupant.collectionNo}
            {occupant.sealed ? " · 已封存" : ""}
          </button>
        )}
        {slot.status === "cleanup" && (
          <button className="mini warn" onClick={() => onClean(slot.id)}>
            清理后复用
          </button>
        )}
        {slot.status === "free" && <small>可容纳≤{SIZE_LABEL[slot.slotSize]}</small>}
      </div>
    </div>
  );
}

export function CabinetView({ state, onClean, onOpenSpecimen }: Props) {
  const cabinets = [...new Set(state.slots.map((s) => s.cabinet))].sort();
  const counts = {
    free: state.slots.filter((s) => s.status === "free").length,
    occupied: state.slots.filter((s) => s.status === "occupied").length,
    cleanup: state.slots.filter((s) => s.status === "cleanup").length,
  };

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>馆藏柜位记录</p>
          <h2>柜位图</h2>
        </div>
        <div className="legend">
          <span><i className="dot-free" />空闲 {counts.free}</span>
          <span><i className="dot-occupied" />占用 {counts.occupied}</span>
          <span><i className="dot-cleanup" />待清理 {counts.cleanup}</span>
        </div>
      </div>
      <div className="cabinets">
        {cabinets.map((cab) => (
          <div className="cabinet" key={cab}>
            <h3>柜 {cab}</h3>
            <div className="slot-grid">
              {ORDER.map((size) =>
                state.slots
                  .filter((s) => s.cabinet === cab && s.slotSize === size)
                  .map((slot) => (
                    <SlotCell
                      key={slot.id}
                      slot={slot}
                      state={state}
                      onClean={onClean}
                      onOpenSpecimen={onOpenSpecimen}
                    />
                  )),
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="hint">
        柜位按标本尺寸匹配；复核退回后的格位进入“待清理”，必须人工清理后才会恢复空闲。
      </p>
    </section>
  );
}
