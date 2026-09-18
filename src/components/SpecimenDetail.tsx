import { ID_LABEL, PRESS_LABEL, SIZE_LABEL } from "../domain";
import type { AppState, IdentificationStatus } from "../types";

interface Props {
  state: AppState;
  specimenId: string | null;
  onClose: () => void;
  onReidentify: (id: string, to: IdentificationStatus) => void;
  onShelve: (ids: string[]) => void;
  onSeal: (id: string) => void;
  onReviewReturn: (id: string) => void;
}

function fmt(at: number | null): string {
  if (!at) return "—";
  return new Date(at).toLocaleString("zh-CN", { hour12: false });
}

export function SpecimenDetail({
  state,
  specimenId,
  onClose,
  onReidentify,
  onShelve,
  onSeal,
  onReviewReturn,
}: Props) {
  if (!specimenId) return null;
  const s = state.specimens.find((x) => x.id === specimenId);
  if (!s) return null;

  const slot = s.slotId ? state.slots.find((c) => c.id === s.slotId) : undefined;
  const history = state.history
    .filter((h) => h.specimenId === s.id)
    .sort((a, b) => b.at - a.at);

  const canShelveNow =
    s.slotId === null && s.pressStatus !== "fresh" && s.identification === "accepted" && !s.sealed;

  return (
    <div className="drawer-mask" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <p>单份标本详情</p>
            <h2>{s.collectionNo}</h2>
          </div>
          <button onClick={onClose} aria-label="关闭">×</button>
        </div>

        <div className="detail-tags">
          <span className="badge badge-accepted">{s.sealed ? "已封存" : PRESS_LABEL[s.pressStatus]}</span>
          <span className="badge badge-slot">鉴定·{ID_LABEL[s.identification]}</span>
          <span className="badge badge-none">{SIZE_LABEL[s.sizeClass]}标本</span>
          {s.reviewReturned && <span className="badge badge-warn">复核退回已使用</span>}
        </div>

        <dl className="detail-grid">
          <div><dt>物种名称</dt><dd>{s.species}</dd></div>
          <div><dt>海拔</dt><dd>{s.altitude || "—"}</dd></div>
          <div><dt>采集人</dt><dd>{s.collector}</dd></div>
          <div><dt>登记时间</dt><dd>{fmt(s.createdAt)}</dd></div>
        </dl>

        <div className="loc-card">
          <h3>采集地点信息卡</h3>
          <p className="loc-name">{s.location}</p>
          <p className="loc-habitat">{s.habitat || "无生境描述"}</p>
        </div>

        <div className="loc-card">
          <h3>馆藏位置</h3>
          {slot ? (
            <p className="loc-name">
              {slot.id}（{SIZE_LABEL[slot.slotSize]}格）
              {s.sealed ? " · 已封存" : " · 占用中"}
            </p>
          ) : (
            <p className="loc-name muted">未占用柜位</p>
          )}
          <div className="drawer-actions">
            {!s.sealed && (
              <>
                <button onClick={() => onReidentify(s.id, "accepted")} disabled={s.identification === "accepted"}>
                  改判接受
                </button>
                <button onClick={() => onReidentify(s.id, "doubtful")} disabled={s.identification === "doubtful"}>
                  改判存疑
                </button>
                <button onClick={() => onReidentify(s.id, "returned")} disabled={s.identification === "returned"}>
                  改判退回
                </button>
                <button onClick={() => onShelve([s.id])} disabled={!canShelveNow}>上柜</button>
                <button
                  className="primary"
                  onClick={() => onSeal(s.id)}
                  disabled={!s.slotId || s.identification !== "accepted"}
                >
                  封存
                </button>
              </>
            )}
            {s.sealed && (
              <button
                className="danger"
                onClick={() => onReviewReturn(s.id)}
                disabled={s.reviewReturned}
              >
                {s.reviewReturned ? "复核退回已使用" : "复核退回（仅一次）"}
              </button>
            )}
          </div>
          <p className="hint">
            未封存标本改判存疑/退回会立即释放柜位；已封存标本仅能通过“复核退回”释放，且终身一次，
            释放后原柜位进入待清理。
          </p>
        </div>

        <div className="history-card">
          <h3>鉴定历史（{history.length}）</h3>
          {history.length === 0 && <p className="muted">暂无改判记录。</p>}
          <ol className="history-list">
            {history.map((h) => (
              <li key={h.id}>
                <div className="history-flow">
                  <span>{h.from === null ? "录入" : ID_LABEL[h.from]}</span>
                  <span className="arrow">→</span>
                  <b>{ID_LABEL[h.to]}</b>
                </div>
                <div className="history-meta">
                  <span>{fmt(h.at)}</span>
                  {h.note && <p>{h.note}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}
