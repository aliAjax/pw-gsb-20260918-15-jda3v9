import type { IdentStatus, SizeClass, SlotStatus } from "../types";
import { IDENT_LABEL, SIZE_LABEL } from "../domain";

export function IdentBadge({ status }: { status: IdentStatus }) {
  return <span className={`badge ident-${status}`}>{IDENT_LABEL[status]}</span>;
}

export function PressedBadge({ pressed }: { pressed: boolean }) {
  return (
    <span className={pressed ? "badge pressed-yes" : "badge pressed-no"}>
      {pressed ? "已压制" : "待压制"}
    </span>
  );
}

export function SealBadge({ sealed }: { sealed: boolean }) {
  return sealed ? <span className="badge sealed">已封存</span> : <span className="badge unsealed">未封存</span>;
}

export function SizeBadge({ size }: { size: SizeClass }) {
  return <span className={`badge size-${size}`}>{SIZE_LABEL[size]}</span>;
}

export function SlotStatusBadge({ status }: { status: SlotStatus }) {
  const map: Record<SlotStatus, string> = {
    free: "空余",
    occupied: "已占用",
    cleaning: "待清理",
  };
  return <span className={`badge slot-${status}`}>{map[status]}</span>;
}
