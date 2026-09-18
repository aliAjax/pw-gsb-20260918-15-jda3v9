// 植物标本馆入库闭环：领域类型定义

/** 鉴定状态：待鉴定 / 接受 / 存疑 / 退回 */
export type IdentStatus = "pending" | "accepted" | "doubtful" | "returned";

/** 标本尺寸档位（与柜位尺寸一一对应） */
export type SizeClass = "S" | "M" | "L";

/** 柜位状态：空余 / 已占用 / 待清理（复核退回后暂不可复用） */
export type SlotStatus = "free" | "occupied" | "cleaning";

/** 鉴定历史事件（鉴定改判、复核退回全程留痕，不因释放柜位而删除） */
export interface IdentEvent {
  id: string;
  at: string;
  by: string;
  kind: "登记" | "鉴定" | "复核";
  from: IdentStatus;
  to: IdentStatus;
  note: string;
  /** 本次改判/复核同时释放的柜位号（未释放则为空） */
  releasedSlot?: string | null;
}

export interface Specimen {
  id: string;
  /** 采集号 */
  collectionNo: string;
  species: string;
  /** 采集地点 */
  locality: string;
  altitude: string;
  habitat: string;
  collector: string;
  sizeClass: SizeClass;
  /** 压制是否完成 */
  pressed: boolean;
  identification: IdentStatus;
  /** 当前占用柜位；未占用为 null */
  slotId: string | null;
  /** 复核退回前最后占用的柜位（该柜位处于待清理期间用于追溯） */
  lastSlotId: string | null;
  /** 是否已封存 */
  sealed: boolean;
  sealedAt: string | null;
  /** 复核退回机会是否已使用（终生一次） */
  reviewReturnUsed: boolean;
  reviewReturnCount: number;
  history: IdentEvent[];
  createdAt: string;
}

export interface Slot {
  /** 柜位编号，如 B-12-04 */
  id: string;
  sizeClass: SizeClass;
  status: SlotStatus;
  /** 当前占用标本 id */
  occupiedBy: string | null;
  /** 待清理柜位的原占用标本 id */
  pendingCleaningBy: string | null;
}

export interface LogEntry {
  id: string;
  at: string;
  by: string;
  text: string;
}

export interface AppState {
  specimens: Specimen[];
  slots: Slot[];
  log: LogEntry[];
}

export interface NewSpecimenInput {
  collectionNo: string;
  species: string;
  locality: string;
  altitude: string;
  habitat: string;
  collector: string;
  sizeClass: SizeClass;
}

/** 领域操作统一返回：失败时调用方保证不提交任何状态变更 */
export interface OpResult {
  ok: boolean;
  text: string;
}
