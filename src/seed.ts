import type { AppState, SizeClass, Slot } from "./types";

// 初始馆藏：3 组柜（A/B/C），每柜多格，覆盖小/中/大三种规格。
// 部分格位初始即占用/待清理，便于演示闭环。
export function createSeedState(): AppState {
  const now = Date.now();
  const cabinets = ["A", "B", "C"];
  const slots: Slot[] = [];
  for (const cabinet of cabinets) {
    for (let shelf = 1; shelf <= 2; shelf += 1) {
      for (let cell = 1; cell <= 3; cell += 1) {
        const id = `柜${cabinet}-${String(shelf).padStart(2, "0")}-${String(cell).padStart(2, "0")}`;
        const slotSize: SizeClass = cell === 1 ? "small" : cell === 2 ? "medium" : "large";
        slots.push({
          id,
          cabinet,
          slotSize,
          status: "free",
          specimenId: null,
          releasedAt: null,
        });
      }
    }
  }

  return {
    specimens: [
      {
        id: "sp-seed-01",
        collectionNo: "HX-240615-01",
        species: "槭属待定",
        location: "秦岭 · 海拔1420m · 阴坡林缘",
        altitude: "1420m",
        habitat: "落叶阔叶林缘",
        collector: "周岚",
        pressStatus: "pressed",
        identification: "pending",
        sizeClass: "medium",
        slotId: null,
        sealed: false,
        reviewReturned: false,
        createdAt: now - 1000 * 60 * 60 * 26,
      },
      {
        id: "sp-seed-02",
        collectionNo: "HX-240615-08",
        species: "蕨类（待定种）",
        location: "大巴山 · 阴湿沟谷",
        altitude: "980m",
        habitat: "溪旁石缝，阴湿",
        collector: "林澈",
        pressStatus: "pressed",
        identification: "accepted",
        sizeClass: "small",
        slotId: null,
        sealed: false,
        reviewReturned: false,
        createdAt: now - 1000 * 60 * 60 * 20,
      },
      {
        id: "sp-seed-03",
        collectionNo: "HX-240616-03",
        species: "山菊",
        location: "神农架 · 海拔2100m · 亚高山草甸",
        altitude: "2100m",
        habitat: "亚高山草甸",
        collector: "周岚",
        pressStatus: "sealed",
        identification: "accepted",
        sizeClass: "large",
        slotId: "柜C-02-03",
        sealed: true,
        reviewReturned: false,
        createdAt: now - 1000 * 60 * 60 * 48,
      },
      {
        id: "sp-seed-04",
        collectionNo: "HX-240616-07",
        species: "秦岭箭竹",
        location: "佛坪 · 海拔1600m",
        altitude: "1600m",
        habitat: "针阔混交林下",
        collector: "高岩",
        pressStatus: "pressed",
        identification: "doubtful",
        sizeClass: "medium",
        slotId: null,
        sealed: false,
        reviewReturned: false,
        createdAt: now - 1000 * 60 * 60 * 10,
      },
    ],
    slots: slots.map((slot) =>
      slot.id === "柜C-02-03"
        ? { ...slot, status: "occupied", specimenId: "sp-seed-03" }
        : slot.id === "柜B-01-02"
          ? { ...slot, status: "cleanup", specimenId: null, releasedAt: now - 1000 * 60 * 30 }
          : slot,
    ),
    history: [
      {
        id: "hist-seed-01",
        specimenId: "sp-seed-03",
        from: null,
        to: "accepted",
        note: "入库时录入",
        at: now - 1000 * 60 * 60 * 48,
      },
      {
        id: "hist-seed-02",
        specimenId: "sp-seed-04",
        from: "accepted",
        to: "doubtful",
        note: "花部特征与近似种不符，存疑待复查",
        at: now - 1000 * 60 * 60 * 6,
      },
    ],
  };
}
