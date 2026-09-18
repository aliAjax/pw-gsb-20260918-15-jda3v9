// 植物标本馆入库闭环：领域类型定义

/** 压制（干燥）状态 */
export type PressStatus = "fresh" | "pressed" | "sealed";

/** 鉴定结论 */
export type IdentificationStatus = "pending" | "accepted" | "doubtful" | "returned";

/** 标本尺寸（决定可匹配的柜位格规格） */
export type SizeClass = "small" | "medium" | "large";

/** 柜位格状态：空闲 / 占用 / 退回后待清理（不可立即复用） */
export type SlotStatus = "free" | "occupied" | "cleanup";

export interface Specimen {
  id: string;
  collectionNo: string;
  species: string;
  location: string;
  altitude: string;
  habitat: string;
  collector: string;
  pressStatus: PressStatus;
  identification: IdentificationStatus;
  sizeClass: SizeClass;
  /** 当前占用的柜位格 id；未上柜为 null */
  slotId: string | null;
  /** 是否已封存 */
  sealed: boolean;
  /** 已封存标本是否已经使用过唯一一次“复核退回” */
  reviewReturned: boolean;
  createdAt: number;
}

export interface Slot {
  id: string;
  cabinet: string;
  /** 格位支持的最大尺寸：可容纳小于等于自身规格的标本 */
  slotSize: SizeClass;
  status: SlotStatus;
  /** 占用该格的标本 id；空闲/待清理为 null */
  specimenId: string | null;
  /** 复核退回时间，用于待清理展示 */
  releasedAt: number | null;
}

/** 鉴定历史条目：改判不覆盖历史 */
export interface IdHistoryEntry {
  id: string;
  specimenId: string;
  from: IdentificationStatus | null;
  to: IdentificationStatus;
  note: string;
  at: number;
}

export interface AppState {
  specimens: Specimen[];
  slots: Slot[];
  history: IdHistoryEntry[];
}

export interface DomainResult {
  state: AppState;
  ok: boolean;
  message: string;
}
