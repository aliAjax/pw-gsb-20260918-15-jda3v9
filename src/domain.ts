// 植物标本馆入库闭环：核心领域规则（纯函数）
//
// 规则总览：
// 1. 标本必须压制完成(pressed/sealed)且鉴定为 accepted 才能占用柜位
// 2. 柜位按标本尺寸匹配（格位规格 >= 标本尺寸）
// 3. 容量不足时整次拒绝，不改变任何占用
// 4. 改判为 doubtful/returned 时释放未封存柜位，鉴定历史始终保留
// 5. 已封存标本只能复核退回一次；退回后原柜位进入 cleanup，不能立即复用
// 6. 重复上柜不产生重复占用（已占用者幂等跳过）

import type {
  AppState,
  DomainResult,
  IdHistoryEntry,
  IdentificationStatus,
  SizeClass,
  Slot,
  Specimen,
} from "./types";

export const SIZE_RANK: Record<SizeClass, number> = { small: 1, medium: 2, large: 3 };

export const SIZE_LABEL: Record<SizeClass, string> = {
  small: "小号",
  medium: "中号",
  large: "大号",
};

export const PRESS_LABEL = {
  fresh: "待压制",
  pressed: "已压制",
  sealed: "已封存",
} as const;

export const ID_LABEL = {
  pending: "待鉴定",
  accepted: "接受",
  doubtful: "存疑",
  returned: "退回",
} as const;

export const SLOT_STATUS_LABEL = {
  free: "空闲",
  occupied: "占用",
  cleanup: "待清理",
} as const;

let seq = 0;
export function uid(prefix: string, at: number): string {
  seq += 1;
  return `${prefix}-${at.toString(36)}-${seq.toString(36)}`;
}

export function clone(state: AppState): AppState {
  return {
    specimens: state.specimens.map((s) => ({ ...s })),
    slots: state.slots.map((s) => ({ ...s })),
    history: state.history.map((h) => ({ ...h })),
  };
}

/** 规格为 slotSize 的格位能否容纳 sizeClass 的标本 */
export function fits(slotSize: SizeClass, sizeClass: SizeClass): boolean {
  return SIZE_RANK[slotSize] >= SIZE_RANK[sizeClass];
}

/** 标本是否满足上柜门槛：压制完成且鉴定接受（已封存也属于压制完成） */
export function canOccupy(s: Specimen): boolean {
  return s.pressStatus !== "fresh" && s.identification === "accepted";
}

function fail(message: string, state: AppState): DomainResult {
  return { state, ok: false, message };
}

// ---------------------------------------------------------------------------
// 上柜（支持批量，整次原子提交）
// ---------------------------------------------------------------------------

export function shelve(state: AppState, ids: string[], at: number = Date.now()): DomainResult {
  const idSet = new Set(ids);
  const picked = state.specimens.filter((s) => idSet.has(s.id));

  if (picked.length === 0) return fail("未选择任何标本", state);

  // 已占用柜位的标本：重复上柜幂等跳过，不产生重复占用
  const pending = picked.filter((s) => s.slotId === null);
  const already = picked.length - pending.length;

  // 门槛校验：任一不达标则整次拒绝
  for (const s of pending) {
    if (s.pressStatus === "fresh") {
      return fail(`整次拒绝：${s.collectionNo} 尚未压制完成，不能上柜`, state);
    }
    if (s.identification !== "accepted") {
      return fail(`整次拒绝：${s.collectionNo} 鉴定结论非“接受”，不能上柜`, state);
    }
    if (s.sealed) {
      return fail(`整次拒绝：${s.collectionNo} 已封存，不应重新分配柜位`, state);
    }
  }

  // 模拟分配（不写状态）：按尺寸匹配空闲格位，容量不足整次拒绝
  const assignment = new Map<string, string>();
  const usedSlots = new Set<string>();

  // 大件优先分配，避免小号标本占掉大号格
  const sorted = [...pending].sort(
    (a, b) => SIZE_RANK[b.sizeClass] - SIZE_RANK[a.sizeClass],
  );

  for (const specimen of sorted) {
    const slot = state.slots.find(
      (c) =>
        c.status === "free" &&
        c.specimenId === null &&
        !usedSlots.has(c.id) &&
        fits(c.slotSize, specimen.sizeClass),
    );
    if (!slot) {
      return fail(
        `整次拒绝：${specimen.collectionNo}（${SIZE_LABEL[specimen.sizeClass]}）无匹配空闲柜位，本次未改变任何占用`,
        state,
      );
    }
    usedSlots.add(slot.id);
    assignment.set(specimen.id, slot.id);
  }

  const next = clone(state);
  for (const specimen of next.specimens) {
    const slotId = assignment.get(specimen.id);
    if (slotId) specimen.slotId = slotId;
  }
  for (const slot of next.slots) {
    const specimenId = next.specimens.find((s) => s.slotId === slot.id)?.id ?? null;
    if (specimenId) {
      slot.status = "occupied";
      slot.specimenId = specimenId;
      slot.releasedAt = null;
    }
  }

  const assigned = assignment.size;
  const skipped = already > 0 ? `；${already} 份已在柜，跳过未重复占用` : "";
  return {
    state: next,
    ok: true,
    message: `上柜完成：${assigned} 份标本占用柜位${skipped}`,
  };
}

// ---------------------------------------------------------------------------
// 鉴定改判（历史始终保留）
// ---------------------------------------------------------------------------

export function reidentify(
  state: AppState,
  specimenId: string,
  to: IdentificationStatus,
  note: string = "",
  at: number = Date.now(),
): DomainResult {
  const specimen = state.specimens.find((s) => s.id === specimenId);
  if (!specimen) return fail("标本不存在", state);

  if (specimen.identification === to) {
    return fail(`${specimen.collectionNo} 当前鉴定已是“${ID_LABEL[to]}”，无需改判`, state);
  }

  const next = clone(state);
  const target = next.specimens.find((s) => s.id === specimenId)!;
  const from = target.identification;
  target.identification = to;

  // 改判为存疑/退回：释放【未封存】标本占用的柜位；已封存的占用保留，
  // 必须走封存标本专属的“复核退回”流程
  if ((to === "doubtful" || to === "returned") && target.slotId !== null && !target.sealed) {
    const slotId = target.slotId;
    target.slotId = null;
    const slot = next.slots.find((c) => c.id === slotId);
    if (slot && slot.status === "occupied") {
      slot.status = "free";
      slot.specimenId = null;
      slot.releasedAt = null;
    }
  }

  const entry: IdHistoryEntry = {
    id: uid("hist", at),
    specimenId,
    from,
    to,
    note: note.trim(),
    at,
  };
  next.history.push(entry);

  return {
    state: next,
    ok: true,
    message: `${target.collectionNo} 鉴定已改判为“${ID_LABEL[to]}”，历史已留存`,
  };
}

// ---------------------------------------------------------------------------
// 封存（占用柜位且未封存的接受标本）
// ---------------------------------------------------------------------------

export function seal(state: AppState, specimenId: string): DomainResult {
  const specimen = state.specimens.find((s) => s.id === specimenId);
  if (!specimen) return fail("标本不存在", state);

  if (specimen.sealed) return fail(`${specimen.collectionNo} 已封存，无需重复封存`, state);
  if (specimen.pressStatus === "fresh")
    return fail(`${specimen.collectionNo} 尚未压制完成，不能封存`, state);
  if (specimen.identification !== "accepted")
    return fail(`${specimen.collectionNo} 鉴定非“接受”，不能封存`, state);
  if (!specimen.slotId)
    return fail(`${specimen.collectionNo} 尚未占用柜位，不能封存`, state);

  const next = clone(state);
  const target = next.specimens.find((s) => s.id === specimenId)!;
  target.sealed = true;
  target.pressStatus = "sealed";

  return { state: next, ok: true, message: `${target.collectionNo} 已在 ${specimen.slotId} 封存` };
}

// ---------------------------------------------------------------------------
// 复核退回（已封存标本终身仅一次）：释放柜位并标记待清理
// ---------------------------------------------------------------------------

export function reviewReturn(
  state: AppState,
  specimenId: string,
  note: string = "",
  at: number = Date.now(),
): DomainResult {
  const specimen = state.specimens.find((s) => s.id === specimenId);
  if (!specimen) return fail("标本不存在", state);

  if (!specimen.sealed)
    return fail(`${specimen.collectionNo} 未封存，请走普通鉴定改判流程`, state);
  if (specimen.reviewReturned)
    return fail(`${specimen.collectionNo} 的复核退回机会已使用，不能再次复核退回`, state);

  const next = clone(state);
  const target = next.specimens.find((s) => s.id === specimenId)!;
  target.identification = "returned";
  target.reviewReturned = true;
  target.sealed = false;
  target.pressStatus = "pressed";

  if (target.slotId) {
    const slotId = target.slotId;
    target.slotId = null;
    const slot = next.slots.find((c) => c.id === slotId)!;
    // 原柜位先标记待清理，不能立即复用
    slot.status = "cleanup";
    slot.specimenId = null;
    slot.releasedAt = at;
  }

  next.history.push({
    id: uid("hist", at),
    specimenId,
    from: "accepted",
    to: "returned",
    note: note.trim() ? note.trim() : "封存后复核退回",
    at,
  });

  return {
    state: next,
    ok: true,
    message: `${target.collectionNo} 复核退回，原柜位已标记待清理`,
  };
}

// ---------------------------------------------------------------------------
// 柜位清理（工作人员到场保洁后，待清理格位回归空闲，方可复用）
// ---------------------------------------------------------------------------

export function cleanSlot(state: AppState, slotId: string, at: number = Date.now()): DomainResult {
  const slot = state.slots.find((c) => c.id === slotId);
  if (!slot) return fail("柜位不存在", state);
  if (slot.status !== "cleanup")
    return fail(`${slotId} 不在待清理状态`, state);

  const next = clone(state);
  const target = next.slots.find((c) => c.id === slotId)!;
  target.status = "free";
  target.specimenId = null;
  target.releasedAt = null;

  return { state: next, ok: true, message: `${slotId} 清理完成，恢复空闲可复用` };
}

// ---------------------------------------------------------------------------
// 录入新标本
// ---------------------------------------------------------------------------

export interface NewSpecimenInput {
  collectionNo: string;
  species: string;
  location: string;
  altitude: string;
  habitat: string;
  collector: string;
  pressStatus: Specimen["pressStatus"];
  identification: IdentificationStatus;
  sizeClass: SizeClass;
}

export function addSpecimen(
  state: AppState,
  input: NewSpecimenInput,
  at: number = Date.now(),
): DomainResult {
  if (!input.collectionNo.trim()) return fail("采集号不能为空", state);
  if (state.specimens.some((s) => s.collectionNo === input.collectionNo.trim()))
    return fail(`采集号 ${input.collectionNo.trim()} 已存在`, state);

  const next = clone(state);
  const specimen: Specimen = {
    id: uid("sp", at),
    collectionNo: input.collectionNo.trim(),
    species: input.species.trim() || "未定名",
    location: input.location.trim() || "未记录",
    altitude: input.altitude.trim(),
    habitat: input.habitat.trim(),
    collector: input.collector.trim() || "未记录",
    pressStatus: input.pressStatus,
    identification: input.identification,
    sizeClass: input.sizeClass,
    slotId: null,
    sealed: false,
    reviewReturned: false,
    createdAt: at,
  };
  next.specimens.unshift(specimen);
  if (input.identification !== "pending") {
    next.history.push({
      id: uid("hist", at),
      specimenId: specimen.id,
      from: null,
      to: input.identification,
      note: "入库时录入",
      at,
    });
  }

  return { state: next, ok: true, message: `标本 ${specimen.collectionNo} 已进入入库队列` };
}

/** 标本当前所在柜位 */
export function slotOf(state: AppState, s: Specimen): Slot | undefined {
  return s.slotId ? state.slots.find((c) => c.id === s.slotId) : undefined;
}
