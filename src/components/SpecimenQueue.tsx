import {
  ID_LABEL,
  PRESS_LABEL,
  SIZE_LABEL,
} from "../domain";
import type { AppState, IdentificationStatus, Specimen } from "../types";

interface Props {
  state: AppState;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[]) => void;
  onShelve: (ids: string[]) => void;
  onReidentify: (id: string, to: IdentificationStatus) => void;
  onSeal: (id: string) => void;
  onReviewReturn: (id: string) => void;
  onOpenDetail: (id: string) => void;
}

const ID_BADGE: Record<IdentificationStatus, string> = {
  pending: "badge-pending",
  accepted: "badge-accepted",
  doubtful: "badge-doubtful",
  returned: "badge-returned",
};

function QueueRow({
  state,
  specimen,
  selected,
  onToggle,
  onShelve,
  onReidentify,
  onSeal,
  onReviewReturn,
  onOpenDetail,
}: {
  state: AppState;
  specimen: Specimen;
  selected: boolean;
  onToggle: (id: string) => void;
  onShelve: (ids: string[]) => void;
  onReidentify: (id: string, to: IdentificationStatus) => void;
  onSeal: (id: string) => void;
  onReviewReturn: (id: string) => void;
  onOpenDetail: (id: string) => void;
}) {
  const slotName = specimen.slotId ?? "—";
  const canShelveNow =
    specimen.slotId === null &&
    specimen.pressStatus !== "fresh" &&
    specimen.identification === "accepted" &&
    !specimen.sealed;

  return (
    <article className={`queue-row ${selected ? "selected" : ""}`}>
      <div className="queue-main">
        <input
          type="checkbox"
          className="row-check"
          checked={selected}
          disabled={!canShelveNow && !selected}
          onChange={() => onToggle(specimen.id)}
          aria-label="选择批量上柜"
        />
        <div className="queue-id" onClick={() => onOpenDetail(specimen.id)} role="button">
          <h3>{specimen.collectionNo}</h3>
          <p>
            {specimen.species} · {SIZE_LABEL[specimen.sizeClass]}
          </p>
        </div>
        <div className="queue-tags">
          <span className={`badge ${PRESS_BADGE[specimen.pressStatus]}`}>
            {specimen.sealed ? "已封存" : PRESS_LABEL[specimen.pressStatus]}
          </span>
          <span className={`badge ${ID_BADGE[specimen.identification]}`}>
            鉴定·{ID_LABEL[specimen.identification]}
          </span>
          <span className={`badge ${specimen.slotId ? "badge-slot" : "badge-none"}`}>
            柜位 {slotName}
          </span>
          {specimen.reviewReturned && <span className="badge badge-warn">已用复核退回</span>}
        </div>
      </div>
      <div className="queue-actions">
        <button onClick={() => onOpenDetail(specimen.id)}>详情</button>
        {!specimen.sealed && specimen.identification !== "accepted" && (
          <button onClick={() => onReidentify(specimen.id, "accepted")}>改判接受</button>
        )}
        {!specimen.sealed && specimen.identification !== "doubtful" && (
          <button onClick={() => onReidentify(specimen.id, "doubtful")}>改判存疑</button>
        )}
        {!specimen.sealed && specimen.identification !== "returned" && (
          <button onClick={() => onReidentify(specimen.id, "returned")}>改判退回</button>
        )}
        <button onClick={() => onShelve([specimen.id])} disabled={!canShelveNow}>
          上柜
        </button>
        {!specimen.sealed && (
          <button
            className="primary"
            onClick={() => onSeal(specimen.id)}
            disabled={!specimen.slotId || specimen.identification !== "accepted"}
          >
            封存
          </button>
        )}
        {specimen.sealed && (
          <button
            className="danger"
            onClick={() => onReviewReturn(specimen.id)}
            disabled={specimen.reviewReturned}
            title={specimen.reviewReturned ? "复核退回终身仅一次" : "封存后唯一一次复核退回"}
          >
            复核退回
          </button>
        )}
      </div>
    </article>
  );
}

const PRESS_BADGE = {
  fresh: "badge-pending",
  pressed: "badge-accepted",
  sealed: "badge-warn",
} as const;

export function SpecimenQueue(props: Props) {
  const { state, selected } = props;
  const selectable = state.specimens.filter(
    (s) =>
      s.slotId === null &&
      s.pressStatus !== "fresh" &&
      s.identification === "accepted" &&
      !s.sealed,
  );
  const allChecked = selectable.length > 0 && selectable.every((s) => selected.has(s.id));

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>入库队列</p>
          <h2>标本工作台（{state.specimens.length}）</h2>
        </div>
        <div className="batch-bar">
          <label className="check-all">
            <input
              type="checkbox"
              checked={allChecked}
              onChange={() =>
                props.onToggleAll(allChecked ? [] : selectable.map((s) => s.id))
              }
            />
            全选可上柜
          </label>
          <button
            className="primary"
            disabled={selected.size === 0}
            onClick={() => props.onShelve([...selected])}
          >
            批量上柜（{selected.size}）
          </button>
        </div>
      </div>
      <div className="queue">
        {state.specimens.length === 0 && <p className="empty">当前筛选下没有标本。</p>}
        {state.specimens.map((s) => (
          <QueueRow
            key={s.id}
            state={state}
            specimen={s}
            selected={selected.has(s.id)}
            onToggle={props.onToggle}
            onShelve={props.onShelve}
            onReidentify={props.onReidentify}
            onSeal={props.onSeal}
            onReviewReturn={props.onReviewReturn}
            onOpenDetail={props.onOpenDetail}
          />
        ))}
      </div>
    </section>
  );
}
