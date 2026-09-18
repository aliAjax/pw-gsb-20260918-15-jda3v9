import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import { AddSpecimenForm } from "./components/AddSpecimenForm";
import { CabinetView } from "./components/CabinetView";
import { SpecimenDetail } from "./components/SpecimenDetail";
import { SpecimenQueue } from "./components/SpecimenQueue";
import {
  canOccupy,
  cleanSlot,
  reidentify,
  reviewReturn,
  seal,
  shelve,
} from "./domain";
import { loadState, resetState, saveState } from "./storage";
import type { AppState, DomainResult, IdentificationStatus } from "./types";

type FilterKey =
  | "all"
  | "fresh"
  | "pending"
  | "ready"
  | "shelved"
  | "sealed"
  | "doubtful"
  | "returned";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "fresh", label: "待压制" },
  { key: "pending", label: "待鉴定" },
  { key: "ready", label: "可上柜" },
  { key: "shelved", label: "已上柜" },
  { key: "sealed", label: "已封存" },
  { key: "doubtful", label: "存疑" },
  { key: "returned", label: "退回" },
];

interface Toast {
  id: number;
  ok: boolean;
  text: string;
}

function matches(key: FilterKey, s: AppState["specimens"][number]): boolean {
  switch (key) {
    case "all":
      return true;
    case "fresh":
      return s.pressStatus === "fresh";
    case "pending":
      return s.identification === "pending";
    case "ready":
      return canOccupy(s) && s.slotId === null && !s.sealed;
    case "shelved":
      return s.slotId !== null;
    case "sealed":
      return s.sealed;
    case "doubtful":
      return s.identification === "doubtful";
    case "returned":
      return s.identification === "returned";
  }
}

function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // 刷新后状态仍在：每次提交写入 localStorage
  useEffect(() => {
    saveState(state);
  }, [state]);

  const notify = (ok: boolean, text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, ok, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  };

  const apply = (res: DomainResult) => {
    if (res.ok) {
      setState(res.state);
      notify(true, res.message);
    } else {
      notify(false, res.message);
    }
  };

  const handleShelve = (ids: string[]) => {
    const res = shelve(state, ids);
    apply(res);
    if (res.ok) setSelected(new Set());
  };

  const handleReidentify = (id: string, to: IdentificationStatus) =>
    apply(reidentify(state, id, to));

  const handleSeal = (id: string) => apply(seal(state, id));

  const handleReviewReturn = (id: string) => apply(reviewReturn(state, id));

  const handleClean = (slotId: string) => apply(cleanSlot(state, slotId));

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const metrics = useMemo(
    () => [
      { label: "入库队列", value: state.specimens.length },
      { label: "待鉴定", value: state.specimens.filter((s) => s.identification === "pending").length },
      { label: "已上柜", value: state.specimens.filter((s) => s.slotId !== null).length },
      { label: "待清理柜位", value: state.slots.filter((c) => c.status === "cleanup").length },
    ],
    [state],
  );

  const visible = state.specimens.filter((s) => matches(filter, s));
  const visibleState: AppState = { ...state, specimens: visible };

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62007 · 植物标本馆 · Port 62007</p>
        <h1>压制标本入库 · 鉴定放行与柜位封存闭环</h1>
        <span>
          压制完成且鉴定接受方可上柜；柜位按尺寸匹配，容量不足整次拒绝；改判存疑/退回释放未封存柜位并留存鉴定历史；
          已封存标本仅可复核退回一次，原柜位先待清理、不可立即复用；重复上柜幂等，刷新后状态保留。
        </span>
      </section>

      <section className="metrics">
        {metrics.map((m) => (
          <article key={m.label}>
            <small>{m.label}</small>
            <strong>{m.value}</strong>
          </article>
        ))}
      </section>

      <section className="workspace">
        <aside className="panel">
          <h2>鉴定状态筛选</h2>
          <div className="chips">
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
          <hr />
          <h2>数据</h2>
          <button
            className="reset-btn"
            onClick={() => {
              if (window.confirm("恢复为初始演示数据？当前所有改动将丢失。")) {
                setState(resetState());
                setSelected(new Set());
                setDetailId(null);
                notify(true, "已恢复初始演示数据");
              }
            }}
          >
            重置演示数据
          </button>
        </aside>

        <AddSpecimenForm
          state={state}
          onCommit={(next, message) => {
            setState(next);
            notify(true, message);
          }}
          onReject={(message) => notify(false, message)}
        />
      </section>

      <SpecimenQueue
        state={visibleState}
        selected={selected}
        onToggle={toggleOne}
        onToggleAll={(ids) => setSelected(new Set(ids))}
        onShelve={handleShelve}
        onReidentify={handleReidentify}
        onSeal={handleSeal}
        onReviewReturn={handleReviewReturn}
        onOpenDetail={setDetailId}
      />

      <div style={{ height: 18 }} />

      <CabinetView state={state} onClean={handleClean} onOpenSpecimen={setDetailId} />

      <SpecimenDetail
        state={state}
        specimenId={detailId}
        onClose={() => setDetailId(null)}
        onReidentify={handleReidentify}
        onShelve={handleShelve}
        onSeal={handleSeal}
        onReviewReturn={handleReviewReturn}
      />

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.ok ? "toast-ok" : "toast-err"}`}>
            {t.ok ? "✓ " : "✕ "}{t.text}
          </div>
        ))}
      </div>
    </main>
  );
}

export default App;
