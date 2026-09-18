import {
  addSpecimen,
  cleanSlot,
  counts,
  createInitialState,
  reidentify,
  seal,
  shelveBatch,
  shelveOne,
  togglePressed,
} from "./domain";
import type { AppState, NewSpecimenInput, OpResult } from "./types";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, extra = "") {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name} ${extra}`);
  }
}

/** 在与 store 相同的草稿副本语义下执行事务；失败不提交 */
function tx(state: AppState, fn: (draft: AppState) => OpResult): { state: AppState; r: OpResult } {
  const draft: AppState = structuredClone(state);
  const r = fn(draft);
  return { state: r.ok ? draft : state, r };
}

const mk = (over: Partial<NewSpecimenInput> & { collectionNo: string }): NewSpecimenInput => ({
  species: "测试种",
  locality: "测试地",
  altitude: "1000m",
  habitat: "林缘",
  collector: "测试员",
  sizeClass: "M",
  ...over,
});

console.log("规则 1：未压制或非接受不能上柜");
{
  let s = createInitialState();
  let r: OpResult;
  ({ state: s, r } = tx(s, (d) => addSpecimen(d, mk({ collectionNo: "T-001" }))));
  check("登记成功", r.ok);
  ({ state: s, r } = tx(s, (d) => shelveOne(d, s.specimens[0].id)));
  check("未压制+待鉴定上柜被拒", !r.ok, r.text);
  check("拒绝后无柜位", s.specimens[0].slotId === null);
  ({ state: s, r } = tx(s, (d) => togglePressed(d, s.specimens[0].id)));
  ({ state: s, r } = tx(s, (d) => shelveOne(d, s.specimens[0].id)));
  check("已压制但待鉴定仍被拒", !r.ok, r.text);
  check("仍无柜位", s.specimens[0].slotId === null);
}

console.log("规则 2：柜位按尺寸匹配（S 只能进 A 区，L 只能进 C 区）");
{
  let s = createInitialState();
  for (const [no, size] of [
    ["T-S", "S"],
    ["T-M", "M"],
    ["T-L", "L"],
  ] as const) {
    let r: OpResult;
    ({ state: s, r } = tx(s, (d) => addSpecimen(d, mk({ collectionNo: no, sizeClass: size }))));
    const id = s.specimens[0].id;
    ({ state: s } = tx(s, (d) => togglePressed(d, id)));
    ({ state: s } = tx(s, (d) => reidentify(d, id, "accepted", "测试接受")));
    ({ state: s, r } = tx(s, (d) => shelveOne(d, id)));
    check(`${size} 上柜成功`, r.ok, r.text);
  }
  const byNo = (no: string) => s.specimens.find((x) => x.collectionNo === no)!;
  check("S 进 A 区", byNo("T-S").slotId!.startsWith("A-"));
  check("M 进 B 区", byNo("T-M").slotId!.startsWith("B-"));
  check("L 进 C 区", byNo("T-L").slotId!.startsWith("C-"));
}

console.log("规则 3：容量不足整次拒绝，任何占用不变");
{
  const s0 = createInitialState();
  const ids: string[] = [];
  let s = s0;
  // C 区（L）种子后空余 = 2*3 - 1(占用) - 1(待清理) = 4，登记 5 份 L
  for (let i = 1; i <= 5; i += 1) {
    ({ state: s } = tx(s, (d) => addSpecimen(d, mk({ collectionNo: `LB-${i}`, sizeClass: "L" }))));
    const id = s.specimens[0].id;
    ids.push(id);
    ({ state: s } = tx(s, (d) => togglePressed(d, id)));
    ({ state: s } = tx(s, (d) => reidentify(d, id, "accepted", "接受")));
  }
  const before = JSON.stringify(s.slots);
  let r: OpResult;
  ({ state: s, r } = tx(s, (d) => shelveBatch(d, ids)));
  check("5 份 L 但仅 4 空位 → 整次拒绝", !r.ok, r.text);
  check("拒绝后占用状态完全不变", JSON.stringify(s.slots) === before);
  check("5 份标本均未占柜", ids.every((id) => s.specimens.find((x) => x.id === id)!.slotId === null));
  // 4 份应成功
  ({ state: s, r } = tx(s, (d) => shelveBatch(d, ids.slice(0, 4))));
  check("4 份时整批成功", r.ok, r.text);
}

console.log("规则 4：改判存疑/退回释放未封存柜位，历史保留");
{
  let s = createInitialState();
  let r: OpResult;
  ({ state: s, r } = tx(s, (d) => addSpecimen(d, mk({ collectionNo: "REL-1", sizeClass: "S" }))));
  const id = s.specimens[0].id;
  ({ state: s } = tx(s, (d) => togglePressed(d, id)));
  ({ state: s } = tx(s, (d) => reidentify(d, id, "accepted", "接受")));
  ({ state: s, r } = tx(s, (d) => shelveOne(d, id)));
  const slotId = s.specimens[0].slotId!;
  const histBefore = s.specimens[0].history.length;
  ({ state: s, r } = tx(s, (d) => reidentify(d, id, "doubtful", "花部存疑")));
  const sp = s.specimens.find((x) => x.id === id)!;
  check("改判存疑成功", r.ok);
  check("柜位已释放", sp.slotId === null);
  check("柜位恢复 free", s.slots.find((x) => x.id === slotId)!.status === "free");
  check("鉴定历史追加保留", sp.history.length === histBefore + 1);
  check("释放事件记录柜位号", sp.history[sp.history.length - 1].releasedSlot === slotId);
}

console.log("规则 5：已封存只能复核退回一次；柜位转待清理不可复用");
{
  let s = createInitialState();
  let r: OpResult;
  ({ state: s, r } = tx(s, (d) => addSpecimen(d, mk({ collectionNo: "SEAL-1", sizeClass: "M" }))));
  const id = s.specimens[0].id;
  ({ state: s } = tx(s, (d) => togglePressed(d, id)));
  ({ state: s } = tx(s, (d) => reidentify(d, id, "accepted", "接受")));
  ({ state: s } = tx(s, (d) => shelveOne(d, id)));
  const slotId = s.specimens.find((x) => x.id === id)!.slotId!;
  ({ state: s, r } = tx(s, (d) => seal(d, id)));
  check("封存成功", r.ok && s.specimens[0].sealed);
  // 封存后尝试改存疑
  ({ state: s, r } = tx(s, (d) => reidentify(d, id, "doubtful", "试图改判")));
  check("封存后不允许改存疑", !r.ok);
  // 复核退回
  ({ state: s, r } = tx(s, (d) => reidentify(d, id, "returned", "模式标本不符")));
  const sp = s.specimens.find((x) => x.id === id)!;
  const slot = s.slots.find((x) => x.id === slotId)!;
  check("复核退回成功", r.ok);
  check("封存标记解除", sp.sealed === false);
  check("标本释放柜位引用", sp.slotId === null);
  check("lastSlotId 保留追溯", sp.lastSlotId === slotId);
  check("原柜位标记待清理", slot.status === "cleaning" && slot.occupiedBy === null);
  check("机会标记已用", sp.reviewReturnUsed && sp.reviewReturnCount === 1);
  // 待清理柜位不能被再次匹配：登记一个 M 标本上柜，不应分到该柜
  ({ state: s } = tx(s, (d) => addSpecimen(d, mk({ collectionNo: "SEAL-2", sizeClass: "M" }))));
  const id2 = s.specimens[0].id;
  ({ state: s } = tx(s, (d) => togglePressed(d, id2)));
  ({ state: s } = tx(s, (d) => reidentify(d, id2, "accepted", "接受")));
  ({ state: s, r } = tx(s, (d) => shelveOne(d, id2)));
  check("待清理柜位不被分配", s.specimens[0].slotId !== slotId, s.specimens[0].slotId ?? "");
  // 二次复核退回（重新接受再封存后尝试）
  ({ state: s } = tx(s, (d) => reidentify(d, id, "accepted", "重新鉴定接受")));
  ({ state: s, r } = tx(s, (d) => shelveOne(d, id)));
  ({ state: s } = tx(s, (d) => seal(d, id)));
  ({ state: s, r } = tx(s, (d) => reidentify(d, id, "returned", "再次复核退回")));
  check("终生只能复核退回一次", !r.ok, r.text);
  check("第二次退回未改变封存", s.specimens.find((x) => x.id === id)!.sealed === true);
  // 清理后柜位恢复
  ({ state: s, r } = tx(s, (d) => cleanSlot(d, slotId)));
  check("确认清理后恢复空余", r.ok && s.slots.find((x) => x.id === slotId)!.status === "free");
}

console.log("规则 6：重复上柜幂等，不产生重复占用");
{
  let s = createInitialState();
  let r: OpResult;
  ({ state: s } = tx(s, (d) => addSpecimen(d, mk({ collectionNo: "DUP-1", sizeClass: "M" }))));
  const id = s.specimens[0].id;
  ({ state: s } = tx(s, (d) => togglePressed(d, id)));
  ({ state: s } = tx(s, (d) => reidentify(d, id, "accepted", "接受")));
  ({ state: s } = tx(s, (d) => shelveOne(d, id)));
  const firstSlot = s.specimens.find((x) => x.id === id)!.slotId;
  const occCountBefore = s.slots.filter((x) => x.occupiedBy === id).length;
  ({ state: s, r } = tx(s, (d) => shelveBatch(d, [id, id, id])));
  check("重复 id 的批处理成功且跳过", r.ok, r.text);
  const sp = s.specimens.find((x) => x.id === id)!;
  check("柜位保持不变", sp.slotId === firstSlot);
  check("只有一个柜位占用该标本", s.slots.filter((x) => x.occupiedBy === id).length === occCountBefore);
}

console.log("规则 7：种子封存标本（B-01-01）状态自洽");
{
  const s = createInitialState();
  const sealed = s.specimens.find((x) => x.collectionNo === "HX-240616-03")!;
  check("种子封存标本占柜", sealed.sealed && sealed.slotId === "B-01-01");
  check("柜位状态 occupied", s.slots.find((x) => x.id === "B-01-01")!.status === "occupied");
  check("待清理 C-01-02", s.slots.find((x) => x.id === "C-01-02")!.status === "cleaning");
  check("统计：待清理计数 1", counts(s).cleaning === 1);
}

console.log("规则 8：混合批次中一个不合法 → 整批拒绝，合法者也不上柜");
{
  let s = createInitialState();
  let r: OpResult;
  ({ state: s } = tx(s, (d) => addSpecimen(d, mk({ collectionNo: "MIX-OK", sizeClass: "S" }))));
  ({ state: s } = tx(s, (d) => addSpecimen(d, mk({ collectionNo: "MIX-BAD", sizeClass: "S" }))));
  const okId = s.specimens.find((x) => x.collectionNo === "MIX-OK")!.id;
  const badId = s.specimens.find((x) => x.collectionNo === "MIX-BAD")!.id;
  ({ state: s } = tx(s, (d) => togglePressed(d, okId)));
  ({ state: s } = tx(s, (d) => reidentify(d, okId, "accepted", "接受")));
  // BAD 未压制未鉴定
  const before = JSON.stringify(s.slots);
  ({ state: s, r } = tx(s, (d) => shelveBatch(d, [okId, badId])));
  check("混合批次被整次拒绝", !r.ok, r.text);
  check("合法标本也未上柜", s.specimens.find((x) => x.id === okId)!.slotId === null);
  check("占用表完全不变", JSON.stringify(s.slots) === before);
}

console.log("规则 9：登记校验");
{
  let s = createInitialState();
  let r: OpResult;
  ({ state: s, r } = tx(s, (d) => addSpecimen(d, mk({ collectionNo: "HX-240615-01" }))));
  check("采集号重复被拒", !r.ok);
  ({ state: s, r } = tx(s, (d) => addSpecimen(d, mk({ collectionNo: "", species: "" }))));
  check("必填校验", !r.ok);
}

console.log("规则 10：封存前置条件");
{
  let s = createInitialState();
  let r: OpResult;
  ({ state: s } = tx(s, (d) => addSpecimen(d, mk({ collectionNo: "SEAL-NO", sizeClass: "M" }))));
  const id = s.specimens[0].id;
  ({ state: s, r } = tx(s, (d) => seal(d, id)));
  check("无柜位不能封存", !r.ok);
}

console.log(`\n结果：${passed} 通过，${failed} 失败`);
if (failed > 0) throw new Error(`${failed} 条领域断言失败`);
