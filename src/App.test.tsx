// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, beforeEach } from "vitest";
import App from "./App";
import { createSeedState } from "./seed";

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="root"></div>';
});

function render(): HTMLElement {
  const container = document.getElementById("root")!;
  act(() => {
    createRoot(container).render(<App />);
  });
  return container;
}

describe("App 闭环冒烟", () => {
  it("页面渲染核心区块", () => {
    const c = render();
    expect(c.textContent).toContain("压制标本入库");
    expect(c.textContent).toContain("标本工作台");
    expect(c.textContent).toContain("柜位图");
  });

  it("完整闭环：上柜 → 封存 → 复核退回 → 柜位待清理", () => {
    const c = render();

    // 种子中 HX-240615-08 为 已压制 + 接受 + 小号，找到它的行并上柜
    const row = [...c.querySelectorAll(".queue-row")].find((r) =>
      r.textContent?.includes("HX-240615-08"),
    )!;
    const shelveBtn = [...row.querySelectorAll("button")].find(
      (b) => b.textContent === "上柜" && !b.disabled,
    ) as HTMLButtonElement;
    act(() => shelveBtn.click());
    expect(c.textContent).toContain("上柜完成");

    // 封存
    const sealBtn = [...row.querySelectorAll("button")].find(
      (b) => b.textContent === "封存",
    ) as HTMLButtonElement;
    act(() => sealBtn.click());
    expect(row.textContent).toContain("已封存");

    // 复核退回
    const reviewBtn = [...row.querySelectorAll("button")].find(
      (b) => b.textContent === "复核退回",
    ) as HTMLButtonElement;
    act(() => reviewBtn.click());
    expect(c.textContent).toContain("复核退回");
    // 原柜位进入待清理
    expect(c.textContent).toContain("待清理");

    // 刷新（localStorage 持久化仍在）
    const persisted = localStorage.getItem("hxyfront-62007-state-v1")!;
    const parsed = JSON.parse(persisted);
    const sp = parsed.specimens.find((x: { collectionNo: string }) =>
      x.collectionNo === "HX-240615-08",
    );
    expect(sp.identification).toBe("returned");
    expect(sp.reviewReturned).toBe(true);
    expect(sp.slotId).toBeNull();
    const cleanupCount = parsed.slots.filter(
      (x: { status: string }) => x.status === "cleanup",
    ).length;
    expect(cleanupCount).toBe(2); // 种子自带 1 个 + 本次 1 个

    // 重新渲染：状态仍在，复核退回按钮不可再点
    document.body.innerHTML = '<div id="root2"></div>';
    const c2 = document.getElementById("root2")!;
    act(() => {
      createRoot(c2).render(<App />);
    });
    const row2 = [...c2.querySelectorAll(".queue-row")].find((r) =>
      r.textContent?.includes("HX-240615-08"),
    )!;
    // 退回后标本不再封存，没有“复核退回”按钮；终身一次的标记持久化显示
    const reviewBtnAfter = [...row2.querySelectorAll("button")].find(
      (b) => b.textContent === "复核退回",
    );
    expect(reviewBtnAfter).toBeUndefined();
    expect(row2.textContent).toContain("已用复核退回");
  });

  it("批量上柜容量不足时整次拒绝，toast 报错且不改变任何占用", () => {
    // 预置：两份已压制+接受的大号标本，大号格只剩 1 个
    const seed = createSeedState();
    const now = Date.now();
    seed.specimens = seed.specimens.filter(
      (s) => s.collectionNo !== "HX-240615-08" && s.id !== "sp-seed-03",
    );
    for (const no of ["HX-CAP-01", "HX-CAP-02"]) {
      seed.specimens.push({
        id: `sp-${no}`,
        collectionNo: no,
        species: "大容量测试种",
        location: "测试地点",
        altitude: "2000m",
        habitat: "草甸",
        collector: "测试员",
        pressStatus: "pressed",
        identification: "accepted",
        sizeClass: "large",
        slotId: null,
        sealed: false,
        reviewReturned: false,
        createdAt: now,
      });
    }
    // 大号格共 3 个：只留 柜C-02-03 空闲，其余占用
    seed.slots = seed.slots.map((s) =>
      s.slotSize === "large" && s.id !== "柜C-02-03"
        ? { ...s, status: "occupied" as const, specimenId: "placeholder" }
        : s.slotSize === "large"
          ? { ...s, status: "free" as const, specimenId: null }
          : s,
    );
    localStorage.setItem("hxyfront-62007-state-v1", JSON.stringify(seed));

    const c = render();
    const checkAll = c.querySelector(".check-all input") as HTMLInputElement;
    act(() => checkAll.click());
    const batchBtn = [...c.querySelectorAll("button")].find((b) =>
      b.textContent?.startsWith("批量上柜"),
    ) as HTMLButtonElement;
    act(() => batchBtn.click());

    const toast = c.querySelector(".toast")!;
    expect(toast.textContent).toContain("整次拒绝");
    const persisted = JSON.parse(localStorage.getItem("hxyfront-62007-state-v1")!);
    const picked = persisted.specimens.filter(
      (s: { collectionNo: string }) =>
        s.collectionNo === "HX-CAP-01" || s.collectionNo === "HX-CAP-02",
    );
    expect(picked.every((s: { slotId: null }) => s.slotId === null)).toBe(true);
    const freeLarge = persisted.slots.filter(
      (s: { slotSize: string; status: string }) =>
        s.slotSize === "large" && s.status === "free",
    ).length;
    expect(freeLarge).toBe(1); // 剩余的 1 个空闲格没有被占用
  });
});