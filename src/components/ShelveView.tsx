import { useMemo, useState } from "react";
import type { AppState } from "../types";
import { SHELVE_RULES, SIZE_LABEL } from "../domain";
import { IdentBadge, PressedBadge, SizeBadge } from "./badges";

interface ShelveProps {
  state: AppState;
  onOpen: (id: string) => void;
  onShelveBatch: (ids: string[]) => void;
}

export default function ShelveView({ state, onOpen, onShelveBatch }: ShelveProps) {
  const eligible = useMemo(
    () =>
      state.specimens.filter(
        (s) => s.pressed && s.identification === "accepted" && s.slotId === null && !s.sealed
      ),
    [state.specimens]
  );
  const blocked = useMemo(
    () =>
      state.specimens.filter(
        (s) => !s.sealed && !s.slotId && !(s.pressed && s.identification === "accepted")
      ),
    [state.specimens]
  );

  const [picked, setPicked] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // 前端预检（真正的原子拒绝在 domain.shelveBatch 内）：分尺寸统计空余容量
  const freeCount = (size: "S" | "M" | "L") =>
    state.slots.filter((s) => s.sizeClass === size && s.status === "free").length;
  const pickedBySize = (["S", "M", "L"] as const).map((size) => ({
    size,
    need: Array.from(picked).filter((id) => state.specimens.find((s) => s.id === id)?.sizeClass === size).length,
    free: freeCount(size),
  }));
  const short = pickedBySize.filter((x) => x.need > x.free);
  const overCapacity = short.length > 0;

  return (
    <div className="shelve-wrap">
      <section className="panel">
        <div className="heading">
          <div>
            <p>批量上柜</p>
            <h2>鉴定放行 → 尺寸匹配 → 整批占用</h2>
          </div>
          <div className="batch-tools">
            <button onClick={() => setPicked(new Set(eligible.map((s) => s.id)))}>全选可上柜</button>
            <button onClick={() => setPicked(new Set())}>清空选择</button>
            <button
              className="primary"
              disabled={picked.size === 0}
              onClick={() => {
                onShelveBatch(Array.from(picked));
                setPicked(new Set());
              }}
            >
              整批上柜（{picked.size}）
            </button>
          </div>
        </div>

        <div className="capacity-bar">
          {pickedBySize.map((x) => (
            <span key={x.size} className={x.need > x.free ? "cap bad" : "cap"}>
              {SIZE_LABEL[x.size]}：需求 {x.need} / 空余 {x.free}
              {x.need > x.free && <b>（容量不足，整批将被拒绝）</b>}
            </span>
          ))}
        </div>
        {overCapacity && (
          <p className="inline-error">
            容量不足：{short.map((x) => `${SIZE_LABEL[x.size]}缺 ${x.need - x.free} 个`).join("、")}
            。提交后整次拒绝，不分配、不封存，任何现有占用保持不变。
          </p>
        )}

        <ul className="rules-callout">
          {SHELVE_RULES.slice(0, 4).map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>

        <h3 className="sub-h">可上柜标本（压制完成 + 鉴定接受 + 无柜位）</h3>
        <div className="shelve-grid">
          {eligible.length === 0 && <p className="empty">暂无可上柜标本</p>}
          {eligible.map((sp) => (
            <label key={sp.id} className={`pick-card ${picked.has(sp.id) ? "picked" : ""}`}>
              <input type="checkbox" checked={picked.has(sp.id)} onChange={() => toggle(sp.id)} />
              <div onClick={() => onOpen(sp.id)}>
                <h4>{sp.collectionNo}</h4>
                <p>{sp.species}</p>
                <div className="badge-row">
                  <IdentBadge status={sp.identification} />
                  <PressedBadge pressed={sp.pressed} />
                  <SizeBadge size={sp.sizeClass} />
                </div>
              </div>
            </label>
          ))}
        </div>

        {blocked.length > 0 && (
          <>
            <h3 className="sub-h">暂不符合上柜条件（仅供核对，不参与分配）</h3>
            <div className="blocked-list">
              {blocked.map((sp) => (
                <div key={sp.id} className="blocked-row" onClick={() => onOpen(sp.id)}>
                  <b>{sp.collectionNo}</b>
                  <span>{sp.species}</span>
                  <span className="blocked-reason">
                    {!sp.pressed && "压制未完成；"}
                    {sp.identification !== "accepted" && `鉴定为${
                      { pending: "待鉴定", doubtful: "存疑", returned: "退回" }[sp.identification]
                    }；`}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
