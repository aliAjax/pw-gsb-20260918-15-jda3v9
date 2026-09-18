import { describe, expect, it } from "vitest";
import {
  addSpecimen,
  canOccupy,
  cleanSlot,
  fits,
  reidentify,
  reviewReturn,
  seal,
  shelve,
} from "./domain";
import type { AppState, Slot, Specimen } from "./types";

const T = 1_700_000_000_000;

function makeSpecimen(over: Partial<Specimen> = {}): Specimen {
  return {
    id: over.id ?? `sp-${Math.random().toString(36).slice(2)}`,
    collectionNo: over.collectionNo ?? `HX-${Math.random().toString(36).slice(2, 8)}`,
    species: "测试种",
    location: "测试地点",
    altitude: "1000m",
    habitat: "林缘",
    collector: "测试员",
    pressStatus: "pressed",
    identification: "accepted",
    sizeClass: "medium",
    slotId: null,
    sealed: false,
    reviewReturned: false,
    createdAt: T,
    ...over,
  };
}

function makeSlot(over: Partial<Slot> & { id: string }): Slot {
  return {
    cabinet: over.id.charAt(1),
    slotSize: "medium",
    status: "free",
    specimenId: null,
    releasedAt: null,
    ...over,
  };
}

function makeState(specimens: Specimen[], slots: Slot[] = []): AppState {
  return { specimens, slots, history: [] };
}

// 规则 1：压制完成且鉴定接受才能占用柜位
describe("上柜门槛", () => {
  it("待压制标本不能上柜", () => {
    const s = makeSpecimen({ pressStatus: "fresh" });
    const state = makeState([s], [makeSlot({ id: "柜A-01-01", slotSize: "large" })]);
    const res = shelve(state, [s.id], T);
    expect(res.ok).toBe(false);
    expect(res.state).toBe(state); // 拒绝时返回原状态
    expect(s.slotId).toBeNull();
    expect(state.slots[0].status).toBe("free");
  });

  it("鉴定非接受（存疑/退回/待鉴定）不能上柜", () => {
    for (const identification of ["doubtful", "returned", "pending"] as const) {
      const s = makeSpecimen({ id: `sp-${identification}`, identification });
      const state = makeState([s], [makeSlot({ id: `柜-${identification}`, slotSize: "large" })]);
      const res = shelve(state, [s.id], T);
      expect(res.ok).toBe(false);
      expect(state.slots[0].status).toBe("free");
    }
  });

  it("canOccupy 判定正确", () => {
    expect(canOccupy(makeSpecimen({ pressStatus: "pressed", identification: "accepted" }))).toBe(true);
    expect(canOccupy(makeSpecimen({ pressStatus: "sealed", identification: "accepted" }))).toBe(true);
    expect(canOccupy(makeSpecimen({ pressStatus: "fresh", identification: "accepted" }))).toBe(false);
    expect(canOccupy(makeSpecimen({ pressStatus: "pressed", identification: "doubtful" }))).toBe(false);
  });
});

// 规则 2：柜位按标本尺寸匹配
describe("尺寸匹配", () => {
  it("小格不能放大标本，大格可以放小标本", () => {
    expect(fits("small", "small")).toBe(true);
    expect(fits("small", "medium")).toBe(false);
    expect(fits("small", "large")).toBe(false);
    expect(fits("large", "small")).toBe(true);
  });

  it("只分配规格足够的空闲格位", () => {
    const big = makeSpecimen({ id: "sp-big", sizeClass: "large" });
    const state = makeState(
      [big],
      [
        makeSlot({ id: "柜A-01-01", slotSize: "small" }),
        makeSlot({ id: "柜A-01-02", slotSize: "medium" }),
        makeSlot({ id: "柜A-01-03", slotSize: "large" }),
      ],
    );
    const res = shelve(state, [big.id], T);
    expect(res.ok).toBe(true);
    expect(res.state.specimens[0].slotId).toBe("柜A-01-03");
  });

  it("占用格与待清理格都不能被分配", () => {
    const s = makeSpecimen({ sizeClass: "medium" });
    const state = makeState(
      [s],
      [
        makeSlot({ id: "柜A-01-02", slotSize: "medium", status: "occupied", specimenId: "other" }),
        makeSlot({ id: "柜B-01-02", slotSize: "medium", status: "cleanup", releasedAt: T }),
      ],
    );
    const res = shelve(state, [s.id], T);
    expect(res.ok).toBe(false);
  });
});

// 规则 3：容量不足时整次拒绝，不改变任何占用
describe("批量原子性", () => {
  it("批量中任一标本无柜位则整次拒绝，已分配的也不落库", () => {
    const s1 = makeSpecimen({ id: "sp-1", collectionNo: "HX-01", sizeClass: "medium" });
    const s2 = makeSpecimen({ id: "sp-2", collectionNo: "HX-02", sizeClass: "large" });
    const s3 = makeSpecimen({ id: "sp-3", collectionNo: "HX-03", sizeClass: "small" });
    const state = makeState(
      [s1, s2, s3],
      [
        makeSlot({ id: "柜A-01-02", slotSize: "medium" }),
        makeSlot({ id: "柜A-01-01", slotSize: "small" }),
        // 没有大号格
      ],
    );
    const res = shelve(state, [s1.id, s2.id, s3.id], T);
    expect(res.ok).toBe(false);
    expect(res.message).toContain("整次拒绝");
    expect(res.state).toBe(state);
    expect(s1.slotId).toBeNull();
    expect(s2.slotId).toBeNull();
    expect(s3.slotId).toBeNull();
    expect(state.slots.every((c) => c.status === "free" && c.specimenId === null)).toBe(true);
  });

  it("批量全部成功时一次性占用", () => {
    const s1 = makeSpecimen({ id: "sp-1", sizeClass: "small" });
    const s2 = makeSpecimen({ id: "sp-2", sizeClass: "large" });
    const state = makeState(
      [s1, s2],
      [
        makeSlot({ id: "柜A-01-01", slotSize: "small" }),
        makeSlot({ id: "柜A-01-03", slotSize: "large" }),
      ],
    );
    const res = shelve(state, [s1.id, s2.id], T);
    expect(res.ok).toBe(true);
    const occupied = res.state.slots.filter((c) => c.status === "occupied");
    expect(occupied).toHaveLength(2);
  });
});

// 规则 4：改判存疑/退回释放未封存柜位，但保留鉴定历史
describe("鉴定改判", () => {
  it("改判存疑释放未封存标本柜位并追加历史", () => {
    const s = makeSpecimen({ id: "sp-1", slotId: "柜A-01-02" });
    const slot = makeSlot({
      id: "柜A-01-02",
      slotSize: "medium",
      status: "occupied",
      specimenId: "sp-1",
    });
    const state = makeState([s], [slot]);
    const res = reidentify(state, s.id, "doubtful", "特征不符", T + 1000);
    expect(res.ok).toBe(true);
    const target = res.state.specimens[0];
    expect(target.identification).toBe("doubtful");
    expect(target.slotId).toBeNull();
    const freed = res.state.slots[0];
    expect(freed.status).toBe("free");
    expect(freed.specimenId).toBeNull();
    expect(res.state.history).toHaveLength(1);
    expect(res.state.history[0]).toMatchObject({ from: "accepted", to: "doubtful", note: "特征不符" });
    // 原状态不变（不可变更新）
    expect(state.specimens[0].slotId).toBe("柜A-01-02");
    expect(state.slots[0].status).toBe("occupied");
  });

  it("改判退回同样释放且保留历次历史", () => {
    const s = makeSpecimen({ id: "sp-1", slotId: "柜A-01-01", sizeClass: "small" });
    const slot = makeSlot({
      id: "柜A-01-01",
      slotSize: "small",
      status: "occupied",
      specimenId: "sp-1",
    });
    const state = makeState([s], [slot]);
    const r1 = reidentify(state, s.id, "doubtful", "第一次存疑", T);
    // 存疑后柜位已空，再退回不应报错
    const r2 = reidentify(r1.state, s.id, "returned", "材料不足退回", T + 2000);
    expect(r2.ok).toBe(true);
    expect(r2.state.history).toHaveLength(2);
    expect(r2.state.history.map((h) => h.to)).toEqual(["doubtful", "returned"]);
    expect(r2.state.slots[0].status).toBe("free");
  });

  it("改判为接受不释放柜位", () => {
    const s = makeSpecimen({ id: "sp-1", identification: "doubtful" });
    const state = makeState([s]);
    const res = reidentify(state, s.id, "accepted", "复查确认", T);
    expect(res.ok).toBe(true);
    expect(res.state.history).toHaveLength(1);
  });

  it("改判已封存标本为存疑/退回时不经过普通流程释放其柜位", () => {
    const s = makeSpecimen({
      id: "sp-1",
      slotId: "柜A-01-02",
      sealed: true,
      pressStatus: "sealed",
    });
    const slot = makeSlot({
      id: "柜A-01-02",
      status: "occupied",
      specimenId: "sp-1",
    });
    const state = makeState([s], [slot]);
    const res = reidentify(state, s.id, "doubtful", "误操作改判", T);
    expect(res.ok).toBe(true);
    // 已封存：普通改判只改鉴定结论，柜位占用保留
    expect(res.state.specimens[0].slotId).toBe("柜A-01-02");
    expect(res.state.slots[0].status).toBe("occupied");
    expect(res.state.history).toHaveLength(1);
  });
});

// 规则 5：已封存标本只能复核退回一次，退回后原柜位待清理
describe("封存与复核退回", () => {
  function sealedState(): AppState {
    const s = makeSpecimen({
      id: "sp-sealed",
      collectionNo: "HX-SEALED",
      slotId: "柜A-01-02",
      sealed: true,
      pressStatus: "sealed",
    });
    const slot = makeSlot({
      id: "柜A-01-02",
      slotSize: "medium",
      status: "occupied",
      specimenId: "sp-sealed",
    });
    return makeState([s], [slot]);
  }

  it("封存前置条件齐备才能封存", () => {
    const base = makeSpecimen({ slotId: "柜A-01-02" });
    expect(seal(makeState([base]), base.id).ok).toBe(true);

    const noSlot = makeSpecimen({ id: "sp-noslot" });
    expect(seal(makeState([noSlot]), noSlot.id).ok).toBe(false);

    const fresh = makeSpecimen({ id: "sp-fresh", pressStatus: "fresh" });
    expect(seal(makeState([fresh]), fresh.id).ok).toBe(false);

    const doubtful = makeSpecimen({ id: "sp-d", identification: "doubtful" });
    expect(seal(makeState([doubtful]), doubtful.id).ok).toBe(false);
  });

  it("复核退回释放柜位但标记待清理，不能立即复用", () => {
    const state = sealedState();
    const res = reviewReturn(state, "sp-sealed", "复核发现定名错误", T + 5000);
    expect(res.ok).toBe(true);
    const s = res.state.specimens[0];
    expect(s.identification).toBe("returned");
    expect(s.sealed).toBe(false);
    expect(s.reviewReturned).toBe(true);
    expect(s.slotId).toBeNull();
    const slot = res.state.slots[0];
    expect(slot.status).toBe("cleanup");
    expect(slot.specimenId).toBeNull();
    expect(slot.releasedAt).toBe(T + 5000);
    expect(res.state.history).toHaveLength(1);
    expect(res.state.history[0]).toMatchObject({ to: "returned", note: "复核发现定名错误" });

    // 待清理格位不能被新标本立即复用
    const other = makeSpecimen({ id: "sp-other", sizeClass: "medium" });
    const state2: AppState = {
      specimens: [...res.state.specimens, other],
      slots: res.state.slots,
      history: res.state.history,
    };
    const again = shelve(state2, ["sp-other"], T + 6000);
    expect(again.ok).toBe(false);
  });

  it("复核退回只能一次", () => {
    const state = sealedState();
    const r1 = reviewReturn(state, "sp-sealed", "", T);
    expect(r1.ok).toBe(true);
    // 标本重新获得柜位并再次封存（模拟流程），第二次复核退回仍应被拒绝
    const next = r1.state;
    next.slots[0].status = "free"; // 即使清理后重新占用
    const sp = next.specimens[0];
    sp.slotId = "柜A-01-02";
    next.slots[0].status = "occupied";
    next.slots[0].specimenId = sp.id;
    sp.sealed = true;
    sp.pressStatus = "sealed";
    const r2 = reviewReturn(next, "sp-sealed", "试图再次退回", T + 1000);
    expect(r2.ok).toBe(false);
    expect(r2.message).toContain("不能再次复核退回");
  });

  it("未封存标本不能走复核退回", () => {
    const s = makeSpecimen({ id: "sp-1", sealed: false, slotId: "柜A-01-02" });
    const state = makeState([s], [makeSlot({ id: "柜A-01-02", status: "occupied", specimenId: "sp-1" })]);
    expect(reviewReturn(state, "sp-1").ok).toBe(false);
  });

  it("待清理柜位清理后才能恢复空闲复用", () => {
    const state = sealedState();
    const returned = reviewReturn(state, "sp-sealed", "", T).state;
    expect(cleanSlot(returned, "柜A-01-02", T + 7000).state.slots[0].status).toBe("free");
    // 非待清理状态不可清理
    const freed = cleanSlot(returned, "柜A-01-02");
    expect(freed.ok).toBe(true);
    expect(cleanSlot(freed.state, "柜A-01-02").ok).toBe(false);
  });
});

// 规则 6：重复上柜幂等
describe("重复上柜", () => {
  it("已占用柜位的标本重复上柜不产生重复占用", () => {
    const s = makeSpecimen({ id: "sp-1", slotId: "柜A-01-01", sizeClass: "small" });
    const occupied = makeSlot({
      id: "柜A-01-01",
      slotSize: "small",
      status: "occupied",
      specimenId: "sp-1",
    });
    const state = makeState([s], [occupied]);
    const res = shelve(state, ["sp-1"], T);
    expect(res.ok).toBe(true);
    expect(res.state.slots.filter((c) => c.status === "occupied")).toHaveLength(1);
    expect(res.state.specimens[0].slotId).toBe("柜A-01-01");
  });

  it("批量中已占用者跳过、新到者正常分配", () => {
    const s1 = makeSpecimen({ id: "sp-1", slotId: "柜A-01-01", sizeClass: "small" });
    const s2 = makeSpecimen({ id: "sp-2", sizeClass: "small" });
    const state = makeState(
      [s1, s2],
      [
        makeSlot({ id: "柜A-01-01", slotSize: "small", status: "occupied", specimenId: "sp-1" }),
        makeSlot({ id: "柜B-01-01", slotSize: "small" }),
      ],
    );
    const res = shelve(state, ["sp-1", "sp-2"], T);
    expect(res.ok).toBe(true);
    expect(res.state.specimens.find((x) => x.id === "sp-2")!.slotId).toBe("柜B-01-01");
  });
});

// 录入
describe("标本录入", () => {
  it("采集号唯一且必填", () => {
    const state = makeState([makeSpecimen({ collectionNo: "HX-1" })]);
    expect(
      addSpecimen(state, {
        collectionNo: "HX-1",
        species: "",
        location: "",
        altitude: "",
        habitat: "",
        collector: "",
        pressStatus: "fresh",
        identification: "pending",
        sizeClass: "medium",
      }).ok,
    ).toBe(false);
    expect(
      addSpecimen(makeState([]), {
        collectionNo: "  ",
        species: "",
        location: "",
        altitude: "",
        habitat: "",
        collector: "",
        pressStatus: "fresh",
        identification: "pending",
        sizeClass: "medium",
      }).ok,
    ).toBe(false);
  });
});
