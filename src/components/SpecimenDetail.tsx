import type { AppState, IdentStatus, Specimen } from "../types";
import { IDENT_LABEL, SHELVE_RULES, SIZE_LABEL } from "../domain";
import { IdentBadge, PressedBadge, SealBadge, SizeBadge } from "./badges";

interface DetailProps {
  specimen: Specimen;
  state: AppState;
  onClose: () => void;
  onTogglePressed: (id: string) => void;
  onReidentify: (id: string, to: IdentStatus, note: string) => void;
  onShelve: (id: string) => void;
  onSeal: (id: string) => void;
  onCleanSlot: (slotId: string) => void;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-field">
      <span>{label}</span>
      <b>{value || "—"}</b>
    </div>
  );
}

export default function SpecimenDetail({
  specimen: sp,
  state,
  onClose,
  onTogglePressed,
  onReidentify,
  onShelve,
  onSeal,
  onCleanSlot,
}: DetailProps) {
  const slotName = (id: string | null) => {
    if (!id) return "—";
    const slot = state.slots.find((s) => s.id === id);
    return slot ? `${id}（${SIZE_LABEL[slot.sizeClass]}）` : id;
  };

  const askNote = (to: IdentStatus) => {
    const label = IDENT_LABEL[to];
    const note = window.prompt(`请填写改判为「${label}」的鉴定依据：`, "");
    if (note === null) return;
    onReidentify(sp.id, to, note);
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <p>单份标本详情</p>
            <h2>{sp.collectionNo}</h2>
            <div className="badge-row">
              <IdentBadge status={sp.identification} />
              <PressedBadge pressed={sp.pressed} />
              <SealBadge sealed={sp.sealed} />
              <SizeBadge size={sp.sizeClass} />
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>

        <div className="detail-grid">
          <Field label="物种名称" value={sp.species} />
          <Field label="采集人" value={sp.collector} />
          <Field label="采集地点" value={sp.locality} />
          <Field label="海拔" value={sp.altitude} />
          <Field label="生境描述" value={sp.habitat} />
          <Field label="尺寸档位" value={SIZE_LABEL[sp.sizeClass]} />
          <Field label="当前柜位" value={slotName(sp.slotId)} />
          <Field
            label="原柜位（复核退回）"
            value={sp.lastSlotId && sp.lastSlotId !== sp.slotId ? slotName(sp.lastSlotId) : "—"}
          />
          <Field label="封存时间" value={sp.sealedAt ?? "—"} />
          <Field
            label="复核退回"
            value={sp.reviewReturnUsed ? `已使用 ${sp.reviewReturnCount} 次（不可再次复核退回）` : "未使用（可复核退回一次）"}
          />
        </div>

        <div className="detail-actions">
          <button onClick={() => onTogglePressed(sp.id)} disabled={sp.sealed}>
            {sp.pressed ? "撤销压制完成" : "标记压制完成"}
          </button>
          {!sp.sealed ? (
            <>
              <button
                className="primary"
                disabled={sp.identification === "accepted"}
                onClick={() => askNote("accepted")}
              >
                鉴定为接受
              </button>
              <button className="warn" disabled={sp.identification === "doubtful"} onClick={() => askNote("doubtful")}>
                改判存疑
              </button>
              <button className="danger" disabled={sp.identification === "returned"} onClick={() => askNote("returned")}>
                鉴定退回
              </button>
              <button
                className="primary"
                disabled={!sp.pressed || sp.identification !== "accepted" || sp.slotId !== null}
                onClick={() => onShelve(sp.id)}
              >
                分配柜位（上柜）
              </button>
              <button
                className="primary"
                disabled={!sp.slotId || sp.sealed || sp.identification !== "accepted"}
                onClick={() => onSeal(sp.id)}
              >
                封存
              </button>
            </>
          ) : (
            <button
              className="danger"
              disabled={sp.reviewReturnUsed || sp.identification !== "accepted"}
              onClick={() => {
                const note = window.prompt("请填写复核退回依据（已封存标本终生仅可复核退回一次）：", "");
                if (note === null) return;
                onReidentify(sp.id, "returned", note);
              }}
            >
              {sp.reviewReturnUsed ? "复核退回机会已用尽" : "复核退回（仅一次，柜位转待清理）"}
            </button>
          )}
          {sp.lastSlotId &&
            state.slots.find((s) => s.id === sp.lastSlotId)?.status === "cleaning" && (
              <button className="warn" onClick={() => onCleanSlot(sp.lastSlotId!)}>
                确认清理原柜位 {sp.lastSlotId}
              </button>
            )}
        </div>

        <div className="timeline">
          <h3>鉴定历史（全程保留，释放柜位不清除记录）</h3>
          {sp.history.map((evt) => (
            <div className="timeline-item" key={evt.id}>
              <time>{evt.at}</time>
              <div>
                <b>
                  {evt.kind}：{IDENT_LABEL[evt.from]} → {IDENT_LABEL[evt.to]}
                </b>
                <span className="timeline-by">{evt.by}</span>
                <p>{evt.note}</p>
                {evt.releasedSlot && <em>释放/清理柜位：{evt.releasedSlot}</em>}
              </div>
            </div>
          ))}
        </div>

        <details className="rules-detail">
          <summary>闭环规则</summary>
          <ol>
            {SHELVE_RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ol>
        </details>
      </div>
    </div>
  );
}
