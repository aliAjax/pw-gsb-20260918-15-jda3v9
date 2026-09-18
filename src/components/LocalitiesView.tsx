import { useMemo } from "react";
import type { AppState } from "../types";

interface LocalitiesProps {
  state: AppState;
  onOpen: (id: string) => void;
}

export default function LocalitiesView({ state, onOpen }: LocalitiesProps) {
  const groups = useMemo(() => {
    const map = new Map<
      string,
      {
        locality: string;
        altitudes: string[];
        habitats: string[];
        collectors: string[];
        ids: string[];
      }
    >();
    for (const sp of state.specimens) {
      const key = sp.locality;
      const g = map.get(key) ?? { locality: key, altitudes: [], habitats: [], collectors: [], ids: [] };
      if (sp.altitude && !g.altitudes.includes(sp.altitude)) g.altitudes.push(sp.altitude);
      if (sp.habitat && !g.habitats.includes(sp.habitat)) g.habitats.push(sp.habitat);
      if (sp.collector && !g.collectors.includes(sp.collector)) g.collectors.push(sp.collector);
      g.ids.push(sp.id);
      map.set(key, g);
    }
    return Array.from(map.values());
  }, [state.specimens]);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>采集地点信息卡</p>
          <h2>按采集点汇总（{groups.length} 个）</h2>
        </div>
      </div>
      <div className="locality-grid">
        {groups.map((g) => (
          <article key={g.locality} className="locality-card">
            <h3>{g.locality}</h3>
            <p>
              <span>海拔：</span>
              {g.altitudes.join(" / ") || "—"}
            </p>
            <p>
              <span>生境：</span>
              {g.habitats.join("；") || "—"}
            </p>
            <p>
              <span>采集人：</span>
              {g.collectors.join("、") || "—"}
            </p>
            <div className="locality-specimens">
              {g.ids.map((id) => {
                const sp = state.specimens.find((s) => s.id === id)!;
                return (
                  <button key={id} className="locality-chip" onClick={() => onOpen(id)}>
                    {sp.collectionNo}
                    {sp.sealed ? " ·封存" : sp.slotId ? ` ·${sp.slotId}` : ""}
                  </button>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
