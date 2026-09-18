import { useMemo } from "react";
import type { AppState, SizeClass } from "../types";
import { SIZE_LABEL } from "../domain";
import { SlotStatusBadge } from "./badges";

interface CabinetsProps {
  state: AppState;
  onOpen: (id: string) => void;
  onCleanSlot: (slotId: string) => void;
}

const ZONES: { zone: string; size: SizeClass; title: string }[] = [
  { zone: "A", size: "S", title: "A 区 · 小号柜（S）" },
  { zone: "B", size: "M", title: "B 区 · 中号柜（M）" },
  { zone: "C", size: "L", title: "C 区 · 大号柜（L）" },
];

export default function CabinetsView({ state, onOpen, onCleanSlot }: CabinetsProps) {
  const summary = useMemo(() => {
    const bySize = (size: SizeClass) => {
      const all = state.slots.filter((s) => s.sizeClass === size);
      return {
        total: all.length,
        free: all.filter((s) => s.status === "free").length,
        occupied: all.filter((s) => s.status === "occupied").length,
        cleaning: all.filter((s) => s.status === "cleaning").length,
      };
    };
    return { S: bySize("S"), M: bySize("M"), L: bySize("L") };
  }, [state.slots]);

  const specimenOf = (id: string | null) => state.specimens.find((s) => s.id === id);

  return (
    <div className="cabinets-wrap">
      <section className="panel">
        <div className="heading">
          <div>
            <p>馆藏柜位记录</p>
            <h2>容量与占用状态</h2>
          </div>
          <div className="legend">
            <SlotStatusBadge status="free" />
            <SlotStatusBadge status="occupied" />
            <SlotStatusBadge status="cleaning" />
          </div>
        </div>

        <div className="capacity-cards">
          {ZONES.map(({ zone, size, title }) => {
            const c = summary[size];
            return (
              <article key={zone} className="cap-card">
                <h3>{title}</h3>
                <p>
                  共 {c.total} · 空余 <b className="num-free">{c.free}</b> · 占用{" "}
                  <b className="num-occ">{c.occupied}</b> · 待清理 <b className="num-clean">{c.cleaning}</b>
                </p>
              </article>
            );
          })}
        </div>
      </section>

      {ZONES.map(({ zone, title }) => (
        <section className="panel" key={zone}>
          <h3 className="sub-h">{title}</h3>
          <div className="slot-grid">
            {state.slots
              .filter((s) => s.id.startsWith(`${zone}-`))
              .map((slot) => {
                const owner = specimenOf(slot.occupiedBy);
                const pendingOwner = specimenOf(slot.pendingCleaningBy);
                return (
                  <div key={slot.id} className={`slot-cell slot-${slot.status}`}>
                    <div className="slot-id">{slot.id}</div>
                    <div className="slot-state">
                      <SlotStatusBadge status={slot.status} />
                    </div>
                    {owner && (
                      <button className="slot-owner" onClick={() => onOpen(owner.id)} title="查看标本详情">
                        {owner.collectionNo}
                        {owner.sealed && <em>·封存</em>}
                      </button>
                    )}
                    {slot.status === "cleaning" && (
                      <>
                        <p className="slot-pending">
                          原占用：{pendingOwner?.collectionNo ?? "—"}
                          <br />
                          复核退回，暂不可复用
                        </p>
                        <button className="warn small" onClick={() => onCleanSlot(slot.id)}>
                          确认清理并释放
                        </button>
                      </>
                    )}
                    {slot.status === "free" && <span className="slot-empty-text">可匹配 {SIZE_LABEL[slot.sizeClass]}</span>}
                  </div>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}
