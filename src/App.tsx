import { useEffect, useState } from "react";
import "./styles.css";
import {
  addSpecimen,
  cleanSlot,
  counts,
  reidentify,
  seal,
  shelveOne,
  shelveBatch,
  togglePressed,
} from "./domain";
import type { IdentStatus, NewSpecimenInput } from "./types";
import { useHerbarium } from "./store";
import QueueView from "./components/QueueView";
import ShelveView from "./components/ShelveView";
import CabinetsView from "./components/CabinetsView";
import LocalitiesView from "./components/LocalitiesView";
import SpecimenDetail from "./components/SpecimenDetail";

type TabKey = "queue" | "shelve" | "cabinets" | "localities";

const TABS: { key: TabKey; label: string }[] = [
  { key: "queue", label: "入库队列" },
  { key: "shelve", label: "批量上柜" },
  { key: "cabinets", label: "馆藏柜位" },
  { key: "localities", label: "采集地点" },
];

function App() {
  const { state, act, reset, toast } = useHerbarium();
  const [tab, setTab] = useState<TabKey>("queue");
  const [openId, setOpenId] = useState<string | null>(null);
  const [visibleToast, setVisibleToast] = useState(toast);

  // toast 4 秒自动消失
  useEffect(() => {
    setVisibleToast(toast);
    if (!toast) return;
    const timer = window.setTimeout(() => setVisibleToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const c = counts(state);
  const detail = openId ? state.specimens.find((s) => s.id === openId) ?? null : null;

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62007 · 植物标本馆 · Port 62007</p>
        <h1>植物标本馆入库闭环</h1>
        <span>
          鉴定放行 → 尺寸匹配上柜 → 封存归档 → 复核退回 → 柜位待清理。状态实时持久化，刷新页面后占用与封存状态仍在。
        </span>
      </section>

      <section className="metrics">
        <article>
          <small>入库队列（未封存）</small>
          <strong>{c.queue}</strong>
        </article>
        <article>
          <small>待鉴定</small>
          <strong>{c.pending}</strong>
        </article>
        <article>
          <small>已上柜</small>
          <strong>{c.shelved}</strong>
        </article>
        <article>
          <small>已封存</small>
          <strong>{c.sealed}</strong>
        </article>
        <article>
          <small>柜位待清理</small>
          <strong className={c.cleaning > 0 ? "text-warn" : ""}>{c.cleaning}</strong>
        </article>
        <article>
          <small>采集点</small>
          <strong>{c.localities}</strong>
        </article>
      </section>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? "tab tab-active" : "tab"} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
        <button className="reset-btn" onClick={reset} title="清空本地数据并恢复演示数据">
          重置演示数据
        </button>
      </nav>

      {tab === "queue" && (
        <QueueView
          state={state}
          onOpen={setOpenId}
          onAdd={(input: NewSpecimenInput) => act((d) => addSpecimen(d, input))}
          onTogglePressed={(id) => act((d) => togglePressed(d, id))}
          onReidentify={(id, to: IdentStatus, note) => act((d) => reidentify(d, id, to, note))}
          onShelve={(id) => act((d) => shelveOne(d, id))}
          onSeal={(id) => act((d) => seal(d, id))}
        />
      )}
      {tab === "shelve" && (
        <ShelveView
          state={state}
          onOpen={setOpenId}
          onShelveBatch={(ids) => act((d) => shelveBatch(d, ids))}
        />
      )}
      {tab === "cabinets" && (
        <CabinetsView state={state} onOpen={setOpenId} onCleanSlot={(slotId) => act((d) => cleanSlot(d, slotId))} />
      )}
      {tab === "localities" && <LocalitiesView state={state} onOpen={setOpenId} />}

      <section className="panel log-panel">
        <div className="heading">
          <div>
            <p>操作留痕</p>
            <h2>近期操作日志</h2>
          </div>
        </div>
        {state.log.length === 0 && <p className="empty">暂无日志</p>}
        <ul className="log-list">
          {state.log.slice(0, 12).map((entry) => (
            <li key={entry.id}>
              <time>{entry.at}</time>
              <span className="log-by">{entry.by}</span>
              <span>{entry.text}</span>
            </li>
          ))}
        </ul>
      </section>

      {detail && (
        <SpecimenDetail
          specimen={detail}
          state={state}
          onClose={() => setOpenId(null)}
          onTogglePressed={(id) => act((d) => togglePressed(d, id))}
          onReidentify={(id, to, note) => act((d) => reidentify(d, id, to, note))}
          onShelve={(id) => act((d) => shelveOne(d, id))}
          onSeal={(id) => act((d) => seal(d, id))}
          onCleanSlot={(slotId) => act((d) => cleanSlot(d, slotId))}
        />
      )}

      {visibleToast && (
        <div className={visibleToast.ok ? "toast toast-ok" : "toast toast-err"} key={visibleToast.key}>
          {visibleToast.ok ? "✓ " : "✕ "}
          {visibleToast.text}
        </div>
      )}
    </main>
  );
}

export default App;
