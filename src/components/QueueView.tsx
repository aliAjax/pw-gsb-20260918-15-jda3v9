import { useMemo, useState } from "react";
import type { AppState, IdentStatus, NewSpecimenInput, SizeClass, Specimen } from "../types";
import { IDENT_LABEL, SIZE_LABEL } from "../domain";
import { IdentBadge, PressedBadge, SealBadge, SizeBadge } from "./badges";

type FilterKey = "all" | "unpressed" | IdentStatus | "shelved" | "sealed" | "cleaned-return";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "unpressed", label: "待压制" },
  { key: "pending", label: "待鉴定" },
  { key: "accepted", label: "已接受" },
  { key: "doubtful", label: "存疑" },
  { key: "returned", label: "退回" },
  { key: "shelved", label: "已上柜" },
  { key: "sealed", label: "已封存" },
];

interface QueueProps {
  state: AppState;
  onOpen: (id: string) => void;
  onAdd: (input: NewSpecimenInput) => void;
  onTogglePressed: (id: string) => void;
  onReidentify: (id: string, to: IdentStatus, note: string) => void;
  onShelve: (id: string) => void;
  onSeal: (id: string) => void;
}

function matchFilter(sp: Specimen, key: FilterKey, state: AppState): boolean {
  switch (key) {
    case "all":
      return true;
    case "unpressed":
      return !sp.pressed;
    case "shelved":
      return sp.slotId !== null;
    case "sealed":
      return sp.sealed;
    case "cleaned-return":
      return sp.reviewReturnUsed;
    default:
      return sp.identification === key;
  }
}

export default function QueueView({
  state,
  onOpen,
  onAdd,
  onTogglePressed,
  onReidentify,
  onShelve,
  onSeal,
}: QueueProps) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [keyword, setKeyword] = useState("");
  const [form, setForm] = useState<NewSpecimenInput>({
    collectionNo: "",
    species: "",
    locality: "",
    altitude: "",
    habitat: "",
    collector: "",
    sizeClass: "M",
  });

  const list = useMemo(() => {
    const kw = keyword.trim();
    return state.specimens.filter((sp) => {
      if (!matchFilter(sp, filter, state)) return false;
      if (!kw) return true;
      return [sp.collectionNo, sp.species, sp.locality, sp.collector, sp.slotId ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(kw.toLowerCase());
    });
  }, [state.specimens, filter, keyword]);

  const set = (key: keyof NewSpecimenInput, value: string) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="queue-layout">
      <aside className="panel filter-panel">
        <h2>鉴定状态筛选</h2>
        <div className="chips vertical">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={filter === f.key ? "chip-active" : ""}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="search-box">
          <span>检索采集号 / 物种 / 地点 / 柜位</span>
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="输入关键字" />
        </label>
        <p className="filter-count">命中 {list.length} 份</p>
      </aside>

      <div className="queue-main">
        <section className="panel form-panel">
          <div className="heading">
            <div>
              <p>专业字段</p>
              <h2>新增标本登记</h2>
            </div>
          </div>
          <div className="field-grid">
            <label>
              <span>采集号 *</span>
              <input value={form.collectionNo} onChange={(e) => set("collectionNo", e.target.value)} placeholder="如 HX-240619-01" />
            </label>
            <label>
              <span>物种名称 *</span>
              <input value={form.species} onChange={(e) => set("species", e.target.value)} placeholder="填写物种名称" />
            </label>
            <label>
              <span>采集地点 *</span>
              <input value={form.locality} onChange={(e) => set("locality", e.target.value)} placeholder="如 阴坡次生林" />
            </label>
            <label>
              <span>海拔</span>
              <input value={form.altitude} onChange={(e) => set("altitude", e.target.value)} placeholder="如 1300m" />
            </label>
            <label>
              <span>采集人</span>
              <input value={form.collector} onChange={(e) => set("collector", e.target.value)} placeholder="填写采集人" />
            </label>
            <label>
              <span>标本尺寸（决定柜位档位）</span>
              <select value={form.sizeClass} onChange={(e) => set("sizeClass", e.target.value as SizeClass)}>
                <option value="S">小号 S（A 区柜）</option>
                <option value="M">中号 M（B 区柜）</option>
                <option value="L">大号 L（C 区柜）</option>
              </select>
            </label>
            <label className="wide">
              <span>生境描述</span>
              <input value={form.habitat} onChange={(e) => set("habitat", e.target.value)} placeholder="填写生境描述" />
            </label>
          </div>
          <div className="form-actions">
            <button
              className="primary"
              onClick={() => {
                onAdd(form);
                setForm({
                  collectionNo: "",
                  species: "",
                  locality: "",
                  altitude: "",
                  habitat: "",
                  collector: "",
                  sizeClass: form.sizeClass,
                });
              }}
            >
              登记入队（未压制 / 待鉴定）
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="heading">
            <div>
              <p>入库队列</p>
              <h2>鉴定放行与上柜</h2>
            </div>
          </div>
          <div className="specimen-list">
            {list.length === 0 && <p className="empty">没有符合筛选条件的标本</p>}
            {list.map((sp) => {
              const slot = sp.slotId ? state.slots.find((s) => s.id === sp.slotId) : undefined;
              const canShelve = sp.pressed && sp.identification === "accepted" && sp.slotId === null && !sp.sealed;
              return (
                <article key={sp.id} className="specimen-card" onClick={() => onOpen(sp.id)}>
                  <div className="card-main">
                    <h3>
                      {sp.collectionNo}
                      {slot && <em className="slot-tag">柜位 {slot.id}</em>}
                      {!sp.slotId && sp.lastSlotId &&
                        state.slots.find((s) => s.id === sp.lastSlotId)?.status === "cleaning" && (
                          <em className="slot-tag cleaning-tag">原柜 {sp.lastSlotId} 待清理</em>
                        )}
                    </h3>
                    <p className="card-sub">{sp.species}</p>
                    <p className="card-meta">
                      {sp.locality} · 海拔 {sp.altitude || "—"} · {sp.collector}
                    </p>
                    <div className="badge-row">
                      <IdentBadge status={sp.identification} />
                      <PressedBadge pressed={sp.pressed} />
                      <SealBadge sealed={sp.sealed} />
                      <SizeBadge size={sp.sizeClass} />
                      {sp.reviewReturnUsed && <span className="badge review-used">复核退回已用</span>}
                    </div>
                  </div>
                  <div className="card-actions" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => onTogglePressed(sp.id)} disabled={sp.sealed}>
                      {sp.pressed ? "撤销压制" : "压制完成"}
                    </button>
                    {!sp.sealed ? (
                      <>
                        {sp.identification !== "accepted" && (
                          <button
                            className="primary"
                            disabled={!sp.pressed}
                            title={!sp.pressed ? "须先完成压制" : ""}
                            onClick={() => {
                              const note = window.prompt(`鉴定依据（${sp.collectionNo}）：`, "");
                              if (note === null) return;
                              onReidentify(sp.id, "accepted", note);
                            }}
                          >
                            鉴定接受
                          </button>
                        )}
                        {(sp.identification === "accepted" || sp.identification === "pending") && (
                          <button
                            className="warn"
                            onClick={() => {
                              const note = window.prompt("改判存疑的依据：", "");
                              if (note === null) return;
                              onReidentify(sp.id, "doubtful", note);
                            }}
                          >
                            存疑
                          </button>
                        )}
                        <button
                          className="primary"
                          disabled={!canShelve}
                          title={
                            !sp.pressed
                              ? "须压制完成"
                              : sp.identification !== "accepted"
                                ? `须鉴定为接受（当前：${IDENT_LABEL[sp.identification]}）`
                                : sp.slotId
                                  ? "已占用柜位"
                                  : ""
                          }
                          onClick={() => onShelve(sp.id)}
                        >
                          上柜{SIZE_LABEL[sp.sizeClass]}
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
                        disabled={sp.reviewReturnUsed}
                        onClick={() => {
                          const note = window.prompt("复核退回依据（已封存标本仅可一次）：", "");
                          if (note === null) return;
                          onReidentify(sp.id, "returned", note);
                        }}
                      >
                        {sp.reviewReturnUsed ? "复核已退回" : "复核退回"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
