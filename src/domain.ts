import type {
  AppState,
  IdentEvent,
  IdentStatus,
  LogEntry,
  NewSpecimenInput,
  OpResult,
  SizeClass,
  Slot,
  Specimen,
} from "./types";

/* ------------------------------------------------------------------ */
/* 标签与常量                                                           */
/* ------------------------------------------------------------------ */

export const IDENT_LABEL: Record<IdentStatus, string> = {
  pending: "待鉴定",
  accepted: "接受",
  doubtful: "存疑",
  returned: "退回",
};

export const SIZE_LABEL: Record<SizeClass, string> = {
  S: "小号",
  M: "中号",
  L: "大号",
};

export const SLOT_STATUS_LABEL = {
  free: "空余",
  occupied: "已占用",
  cleaning: "待清理",
} as const;

export const CURRENT_USER = "张馆员";
export const STATE_KEY = "herbarium-v1";

export const SHELVE_RULES = [
  "标本必须压制完成且鉴定为「接受」，才允许占用柜位",
  "柜位按标本尺寸（小/中/大号）严格匹配",
  "柜位容量不足时整次拒绝：不分配、不封存，不改变任何现有占用",
  "重复上柜幂等：已占用柜位的标本自动跳过，绝不产生重复占用",
  "鉴定改判为存疑/退回：释放未封存柜位，鉴定历史完整保留",
  "已封存标本只能「复核退回」一次，退回后原柜位标记待清理、不可立即复用",
  "待清理柜位须人工确认清理后才恢复空余",
];

/* ------------------------------------------------------------------ */
/* 工具                                                                 */
/* ------------------------------------------------------------------ */

let seq = 0;
export function uid(prefix = "id"): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

export function nowText(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function appendLog(state: AppState, text: string, by = CURRENT_USER): void {
  const entry: LogEntry = { id: uid("log"), at: nowText(), by, text };
  state.log = [entry, ...state.log].slice(0, 200);
}

function fail(text: string): OpResult {
  return { ok: false, text };
}

function ok(text: string): OpResult {
  return { ok: true, text };
}

function makeEvent(
  kind: IdentEvent["kind"],
  from: IdentStatus,
  to: IdentStatus,
  note: string,
  releasedSlot?: string | null
): IdentEvent {
  return {
    id: uid("evt"),
    at: nowText(),
    by: CURRENT_USER,
    kind,
    from,
    to,
    note,
    releasedSlot: releasedSlot ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* 柜位构造与种子数据                                                    */
/* ------------------------------------------------------------------ */

function makeSlot(zone: string, rack: string, level: string, sizeClass: SizeClass): Slot {
  return {
    id: `${zone}-${rack}-${level}`,
    sizeClass,
    status: "free",
    occupiedBy: null,
    pendingCleaningBy: null,
  };
}

function buildSlots(): Slot[] {
  const slots: Slot[] = [];
  const layout: Record<string, { racks: number; levels: number; size: SizeClass }> = {
    A: { racks: 2, levels: 4, size: "S" },
    B: { racks: 3, levels: 4, size: "M" },
    C: { racks: 2, levels: 3, size: "L" },
  };
  for (const [zone, cfg] of Object.entries(layout)) {
    for (let r = 1; r <= cfg.racks; r += 1) {
      for (let l = 1; l <= cfg.levels; l += 1) {
        slots.push(makeSlot(zone, String(r).padStart(2, "0"), String(l).padStart(2, "0"), cfg.size));
      }
    }
  }
  return slots;
}

function seedEvent(
  at: string,
  kind: IdentEvent["kind"],
  from: IdentStatus,
  to: IdentStatus,
  note: string
): IdentEvent {
  return { id: uid("evt"), at, by: CURRENT_USER, kind, from, to, note, releasedSlot: null };
}

export function createInitialState(): AppState {
  const slots = buildSlots();

  const occupy = (slotId: string, specimenId: string) => {
    const s = slots.find((x) => x.id === slotId);
    if (!s) throw new Error("seed slot missing: " + slotId);
    s.status = "occupied";
    s.occupiedBy = specimenId;
  };
  const markCleaning = (slotId: string, specimenId: string) => {
    const s = slots.find((x) => x.id === slotId);
    if (!s) throw new Error("seed slot missing: " + slotId);
    s.status = "cleaning";
    s.pendingCleaningBy = specimenId;
  };

  const specimens: Specimen[] = [
    {
      id: "sp-seed-01",
      collectionNo: "HX-240615-01",
      species: "槭属待定 Acer sp.",
      locality: "阴坡次生林",
      altitude: "1420m",
      habitat: "落叶阔叶林下，伴生绣线菊灌丛",
      collector: "李远征",
      sizeClass: "M",
      pressed: true,
      identification: "pending",
      slotId: null,
      lastSlotId: null,
      sealed: false,
      sealedAt: null,
      reviewReturnUsed: false,
      reviewReturnCount: 0,
      history: [seedEvent("2026-09-12 09:20", "登记", "pending", "pending", "标本登记入库，压制完成，等待鉴定")],
      createdAt: "2026-09-12 09:20",
    },
    {
      id: "sp-seed-02",
      collectionNo: "HX-240615-08",
      species: "蕨类（待定种）",
      locality: "阴湿沟谷",
      altitude: "1180m",
      habitat: "溪谷岩石表面，苔藓层上",
      collector: "周禾",
      sizeClass: "S",
      pressed: false,
      identification: "accepted",
      slotId: null,
      lastSlotId: null,
      sealed: false,
      sealedAt: null,
      reviewReturnUsed: false,
      reviewReturnCount: 0,
      history: [
        seedEvent("2026-09-12 10:05", "登记", "pending", "pending", "标本登记入库"),
        seedEvent("2026-09-14 15:40", "鉴定", "pending", "accepted", "孢子囊群形态符合，鉴定接受；但压制尚未完成"),
      ],
      createdAt: "2026-09-12 10:05",
    },
    {
      id: "sp-seed-03",
      collectionNo: "HX-240616-03",
      species: "山菊 Chrysanthemum indicum",
      locality: "林缘开阔地",
      altitude: "960m",
      habitat: "路边向阳草坡",
      collector: "李远征",
      sizeClass: "M",
      pressed: true,
      identification: "accepted",
      slotId: "B-01-01",
      lastSlotId: null,
      sealed: true,
      sealedAt: "2026-09-15 11:30",
      reviewReturnUsed: false,
      reviewReturnCount: 0,
      history: [
        seedEvent("2026-09-13 08:50", "登记", "pending", "pending", "标本登记入库"),
        seedEvent("2026-09-14 09:10", "鉴定", "pending", "accepted", "形态比对接受"),
        seedEvent("2026-09-15 11:30", "鉴定", "accepted", "accepted", "上柜 B-01-01 并封存"),
      ],
      createdAt: "2026-09-13 08:50",
    },
    {
      id: "sp-seed-04",
      collectionNo: "HX-240616-11",
      species: "栎属待定 Quercus sp.",
      locality: "山脊防火带",
      altitude: "1560m",
      habitat: "针阔混交林缘",
      collector: "王潜",
      sizeClass: "L",
      pressed: true,
      identification: "accepted",
      slotId: "C-01-01",
      lastSlotId: null,
      sealed: false,
      sealedAt: null,
      reviewReturnUsed: false,
      reviewReturnCount: 0,
      history: [
        seedEvent("2026-09-13 14:12", "登记", "pending", "pending", "标本登记入库"),
        seedEvent("2026-09-15 10:02", "鉴定", "pending", "accepted", "大型标本，鉴定接受，已上柜待封存"),
      ],
      createdAt: "2026-09-13 14:12",
    },
    {
      id: "sp-seed-05",
      collectionNo: "HX-240617-02",
      species: "堇菜属待定 Viola sp.",
      locality: "水田埂旁",
      altitude: "720m",
      habitat: "湿润粘土，水稻田边",
      collector: "周禾",
      sizeClass: "S",
      pressed: true,
      identification: "doubtful",
      slotId: null,
      lastSlotId: null,
      sealed: false,
      sealedAt: null,
      reviewReturnUsed: false,
      reviewReturnCount: 0,
      history: [
        seedEvent("2026-09-14 09:30", "登记", "pending", "pending", "标本登记入库"),
        seedEvent("2026-09-15 16:20", "鉴定", "pending", "accepted", "初步鉴定接受并上柜 A-01-01"),
        seedEvent("2026-09-16 10:45", "鉴定", "accepted", "doubtful", "花部特征存疑，改判存疑；已释放柜位 A-01-01"),
      ],
      createdAt: "2026-09-14 09:30",
    },
    {
      id: "sp-seed-06",
      collectionNo: "HX-240617-07",
      species: "未知草本（复核存疑）",
      locality: "高山草甸",
      altitude: "2380m",
      habitat: "杜鹃灌丛间隙",
      collector: "王潜",
      sizeClass: "L",
      pressed: true,
      identification: "returned",
      slotId: null,
      lastSlotId: "C-01-02",
      sealed: false,
      sealedAt: null,
      reviewReturnUsed: true,
      reviewReturnCount: 1,
      history: [
        seedEvent("2026-09-14 11:00", "登记", "pending", "pending", "标本登记入库"),
        seedEvent("2026-09-15 13:30", "鉴定", "pending", "accepted", "鉴定接受，上柜 C-01-02 并封存"),
        seedEvent("2026-09-16 09:15", "复核", "accepted", "returned", "复核发现模式标本不符，复核退回；原柜位 C-01-02 标记待清理"),
      ],
      createdAt: "2026-09-14 11:00",
    },
    {
      id: "sp-seed-07",
      collectionNo: "HX-240618-04",
      species: "卫矛 Euonymus alatus",
      locality: "沟谷杂木林",
      altitude: "1050m",
      habitat: "林下阴湿处",
      collector: "李远征",
      sizeClass: "M",
      pressed: true,
      identification: "accepted",
      slotId: null,
      lastSlotId: null,
      sealed: false,
      sealedAt: null,
      reviewReturnUsed: false,
      reviewReturnCount: 0,
      history: [
        seedEvent("2026-09-17 15:26", "登记", "pending", "pending", "标本登记入库，压制完成"),
        seedEvent("2026-09-18 08:50", "鉴定", "pending", "accepted", "木栓翅特征典型，鉴定接受，等待上柜"),
      ],
      createdAt: "2026-09-17 15:26",
    },
  ];

  occupy("B-01-01", "sp-seed-03");
  occupy("C-01-01", "sp-seed-04");
  markCleaning("C-01-02", "sp-seed-06");

  const log: LogEntry[] = [
    { id: uid("log"), at: "2026-09-16 09:15", by: CURRENT_USER, text: "复核退回 HX-240617-07，柜位 C-01-02 标记待清理" },
    { id: uid("log"), at: "2026-09-16 10:45", by: CURRENT_USER, text: "HX-240617-02 改判存疑，释放柜位 A-01-01" },
    { id: uid("log"), at: "2026-09-15 11:30", by: CURRENT_USER, text: "HX-240616-03 上柜 B-01-01 并封存" },
  ];

  return { specimens, slots, log };
}

/* ------------------------------------------------------------------ */
/* 领域操作（均以 draft 状态就地修改；返回 ok:false 表示整次拒绝）        */
/* ------------------------------------------------------------------ */

function findSpecimen(state: AppState, id: string): Specimen | undefined {
  return state.specimens.find((s) => s.id === id);
}

/** 录入新标本：默认未压制、待鉴定、无柜位 */
export function addSpecimen(state: AppState, input: NewSpecimenInput): OpResult {
  if (!input.collectionNo.trim()) return fail("采集号不能为空");
  if (!input.species.trim()) return fail("物种名称不能为空");
  if (!input.locality.trim()) return fail("采集地点不能为空");
  if (state.specimens.some((s) => s.collectionNo === input.collectionNo.trim())) {
    return fail(`采集号 ${input.collectionNo.trim()} 已存在，请勿重复登记`);
  }
  const at = nowText();
  const specimen: Specimen = {
    id: uid("sp"),
    collectionNo: input.collectionNo.trim(),
    species: input.species.trim(),
    locality: input.locality.trim(),
    altitude: input.altitude.trim(),
    habitat: input.habitat.trim(),
    collector: input.collector.trim() || "未填写",
    sizeClass: input.sizeClass,
    pressed: false,
    identification: "pending",
    slotId: null,
    lastSlotId: null,
    sealed: false,
    sealedAt: null,
    reviewReturnUsed: false,
    reviewReturnCount: 0,
    history: [makeEvent("登记", "pending", "pending", "标本登记入库，尚未压制")],
    createdAt: at,
  };
  state.specimens = [specimen, ...state.specimens];
  appendLog(state, `登记标本 ${specimen.collectionNo}（${SIZE_LABEL[specimen.sizeClass]}）`);
  return ok(`已登记 ${specimen.collectionNo}，待压制、待鉴定`);
}

/** 压制完成 / 撤销压制（仅未占用柜位的标本可撤销） */
export function togglePressed(state: AppState, id: string): OpResult {
  const sp = findSpecimen(state, id);
  if (!sp) return fail("标本不存在");
  if (!sp.pressed) {
    sp.pressed = true;
    appendLog(state, `${sp.collectionNo} 压制完成`);
    return ok(`${sp.collectionNo} 压制完成，可进入鉴定放行`);
  }
  if (sp.slotId) return fail(`${sp.collectionNo} 已占用柜位，不能撤销压制`);
  if (sp.sealed) return fail(`${sp.collectionNo} 已封存，不能撤销压制`);
  sp.pressed = false;
  appendLog(state, `${sp.collectionNo} 撤销压制完成标记`);
  return ok(`${sp.collectionNo} 已改回未压制`);
}

/**
 * 鉴定 / 复核改判：
 * - 已封存：只能复核退回（accepted→returned），终生一次；原柜位标记待清理。
 * - 未封存：存疑/退回释放当前未封存柜位；接受不自动上柜（须执行上柜）。
 * - 鉴定历史始终追加保留。
 */
export function reidentify(
  state: AppState,
  id: string,
  to: IdentStatus,
  note: string
): OpResult {
  const sp = findSpecimen(state, id);
  if (!sp) return fail("标本不存在");
  const from = sp.identification;
  if (from === to) return fail(`${sp.collectionNo} 当前鉴定已是「${IDENT_LABEL[to]}」`);
  const trimmed = note.trim() || "未填写依据";

  if (sp.sealed) {
    if (!(from === "accepted" && to === "returned")) {
      return fail("已封存标本只能由「接受」复核退回为「退回」，不允许其他改判");
    }
    if (sp.reviewReturnUsed) {
      return fail(`${sp.collectionNo} 的复核退回机会已使用过（仅限一次），不能再次复核退回`);
    }
    const slot = sp.slotId ? state.slots.find((x) => x.id === sp.slotId) : undefined;
    const slotId = sp.slotId;
    sp.sealed = false;
    sp.sealedAt = null;
    sp.identification = "returned";
    sp.reviewReturnUsed = true;
    sp.reviewReturnCount += 1;
    sp.slotId = null;
    sp.lastSlotId = slotId;
    if (slot) {
      slot.status = "cleaning";
      slot.occupiedBy = null;
      slot.pendingCleaningBy = sp.id;
    }
    sp.history.push(
      makeEvent("复核", from, "returned", `${trimmed}；封存后复核退回，原柜位 ${slotId ?? "无"} 标记待清理`, slotId)
    );
    appendLog(state, `复核退回已封存标本 ${sp.collectionNo}，柜位 ${slotId ?? "无"} 标记待清理`);
    return ok(`已复核退回 ${sp.collectionNo}，原柜位 ${slotId ?? "无"} 待清理后才可复用`);
  }

  let releasedSlot: string | null = null;
  if ((to === "doubtful" || to === "returned") && sp.slotId) {
    const slot = state.slots.find((x) => x.id === sp.slotId);
    releasedSlot = sp.slotId;
    if (slot) {
      slot.status = "free";
      slot.occupiedBy = null;
      slot.pendingCleaningBy = null;
    }
    sp.slotId = null;
  }
  sp.identification = to;
  const kind: IdentEvent["kind"] = to === "returned" || from === "accepted" ? "鉴定" : "鉴定";
  sp.history.push(
    makeEvent(
      kind,
      from,
      to,
      releasedSlot ? `${trimmed}；改判${IDENT_LABEL[to]}，释放柜位 ${releasedSlot}` : trimmed,
      releasedSlot
    )
  );
  appendLog(
    state,
    releasedSlot
      ? `${sp.collectionNo} 改判${IDENT_LABEL[to]}，释放柜位 ${releasedSlot}`
      : `${sp.collectionNo} 鉴定改判为${IDENT_LABEL[to]}`
  );
  return ok(
    releasedSlot
      ? `已改判${IDENT_LABEL[to]}并释放柜位 ${releasedSlot}，鉴定历史已保留`
      : `${sp.collectionNo} 鉴定已改判为「${IDENT_LABEL[to]}」`
  );
}

/**
 * 整批上柜：先校验再提交。
 * - 仅 压制完成 + 鉴定接受 + 未封存且无柜位 的标本参与分配；
 * - 已占用柜位的标本幂等跳过（重复上柜不产生重复占用）；
 * - 任一待分配标本缺少匹配空余柜位时，整次拒绝，所有现有占用保持不变。
 */
export function shelveBatch(state: AppState, ids: string[]): OpResult {
  const uniqueIds = Array.from(new Set(ids));
  const targets: Specimen[] = [];
  const skipped: string[] = [];

  for (const id of uniqueIds) {
    const sp = findSpecimen(state, id);
    if (!sp) return fail(`标本不存在（${id}），整次拒绝，未改变任何占用`);
    if (sp.sealed) {
      skipped.push(`${sp.collectionNo}(已封存)`);
      continue;
    }
    if (sp.slotId) {
      skipped.push(`${sp.collectionNo}(已占柜)`);
      continue;
    }
    if (!sp.pressed || sp.identification !== "accepted") {
      return fail(
        `${sp.collectionNo} 不满足上柜条件（压制完成：${sp.pressed ? "是" : "否"}，鉴定：${
          IDENT_LABEL[sp.identification]
        }），整次拒绝，未改变任何占用`
      );
    }
    targets.push(sp);
  }

  if (targets.length === 0) {
    return ok(
      skipped.length
        ? `本次没有需要新分配柜位的标本，已跳过：${skipped.join("、")}（幂等，无重复占用）`
        : "未选择任何标本"
    );
  }

  // 干跑分配：只在本地映射表中预占，全部成功后才写回真实状态
  const freeBySize: Record<SizeClass, Slot[]> = {
    S: state.slots.filter((s) => s.sizeClass === "S" && s.status === "free"),
    M: state.slots.filter((s) => s.sizeClass === "M" && s.status === "free"),
    L: state.slots.filter((s) => s.sizeClass === "L" && s.status === "free"),
  };

  const plan = new Map<string, Slot>();
  for (const sp of targets) {
    const candidate = freeBySize[sp.sizeClass].shift();
    if (!candidate) {
      const remain = freeBySize[sp.sizeClass].length;
      return fail(
        `${SIZE_LABEL[sp.sizeClass]}柜位容量不足：${sp.collectionNo} 无法匹配（当前空余 ${remain} 个）。整次拒绝，未分配、未封存，任何占用保持不变`
      );
    }
    plan.set(sp.id, candidate);
  }

  const assigned: string[] = [];
  for (const sp of targets) {
    const slot = plan.get(sp.id)!;
    slot.status = "occupied";
    slot.occupiedBy = sp.id;
    sp.slotId = slot.id;
    sp.lastSlotId = slot.id;
    sp.history.push(makeEvent("鉴定", sp.identification, "accepted", `压制完成、鉴定接受，分配柜位 ${slot.id}`));
    assigned.push(`${sp.collectionNo}→${slot.id}`);
  }
  appendLog(
    state,
    `整批上柜 ${assigned.length} 份：${assigned.join("、")}${
      skipped.length ? `；跳过 ${skipped.join("、")}` : ""
    }`
  );
  return ok(
    `已为 ${assigned.length} 份标本分配柜位：${assigned.join("、")}${
      skipped.length ? `；重复上柜已跳过：${skipped.join("、")}` : ""
    }`
  );
}

/** 单份上柜（详情页/队列操作，走与整批完全相同的事务规则） */
export function shelveOne(state: AppState, id: string): OpResult {
  return shelveBatch(state, [id]);
}

/** 封存：已占柜、未封存的接受标本方可封存 */
export function seal(state: AppState, id: string): OpResult {
  const sp = findSpecimen(state, id);
  if (!sp) return fail("标本不存在");
  if (sp.sealed) return fail(`${sp.collectionNo} 已处于封存状态（幂等）`);
  if (!sp.slotId) return fail(`${sp.collectionNo} 尚未占用柜位，不能封存`);
  if (sp.identification !== "accepted") return fail(`${sp.collectionNo} 鉴定非「接受」，不能封存`);
  if (!sp.pressed) return fail(`${sp.collectionNo} 压制未完成，不能封存`);
  sp.sealed = true;
  sp.sealedAt = nowText();
  appendLog(state, `${sp.collectionNo} 在柜位 ${sp.slotId} 封存完成`);
  return ok(`${sp.collectionNo} 已在柜位 ${sp.slotId} 封存`);
}

/** 确认柜位清理完成：待清理 → 空余，可重新被匹配复用 */
export function cleanSlot(state: AppState, slotId: string): OpResult {
  const slot = state.slots.find((s) => s.id === slotId);
  if (!slot) return fail("柜位不存在");
  if (slot.status !== "cleaning") return fail(`柜位 ${slotId} 不处于待清理状态`);
  const ownerId = slot.pendingCleaningBy;
  slot.status = "free";
  slot.occupiedBy = null;
  slot.pendingCleaningBy = null;
  const owner = ownerId ? findSpecimen(state, ownerId) : undefined;
  appendLog(state, `柜位 ${slotId} 清理完成，恢复空余${owner ? `（原占用 ${owner.collectionNo}）` : ""}`);
  return ok(`柜位 ${slotId} 已清理完毕，恢复可分配`);
}

/* ------------------------------------------------------------------ */
/* 派生统计                                                             */
/* ------------------------------------------------------------------ */

export function counts(state: AppState) {
  return {
    queue: state.specimens.filter((s) => !s.sealed).length,
    pending: state.specimens.filter((s) => s.identification === "pending").length,
    shelved: state.specimens.filter((s) => s.slotId !== null).length,
    sealed: state.specimens.filter((s) => s.sealed).length,
    cleaning: state.slots.filter((s) => s.status === "cleaning").length,
    localities: new Set(state.specimens.map((s) => s.locality)).size,
  };
}
