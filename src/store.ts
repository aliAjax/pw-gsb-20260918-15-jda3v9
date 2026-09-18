import { useCallback, useEffect, useRef, useState } from "react";
import type { AppState, OpResult } from "./types";
import { STATE_KEY, createInitialState } from "./domain";

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (Array.isArray(parsed.specimens) && Array.isArray(parsed.slots)) {
        return parsed;
      }
    }
  } catch {
    /* 数据损坏时回落到演示数据 */
  }
  return createInitialState();
}

export interface Toast extends OpResult {
  key: number;
}

/**
 * 领域事务统一入口：
 * 先在草稿副本上执行，失败直接丢弃（保证「整次拒绝不改变任何占用」），
 * 成功后提交并持久化（刷新后状态仍在）。
 */
export function useHerbarium() {
  const [state, setState] = useState<AppState>(loadState);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastSeq = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch {
      /* 存储空间受限时静默，不阻断业务 */
    }
  }, [state]);

  const act = useCallback(
    (fn: (draft: AppState) => OpResult): OpResult => {
      let result: OpResult = { ok: false, text: "未执行" };
      setState((prev) => {
        const draft: AppState = structuredClone(prev);
        result = fn(draft);
        // 失败：原样返回，React 按引用判定无变化，不产生任何提交
        return result.ok ? draft : prev;
      });
      toastSeq.current += 1;
      const key = toastSeq.current;
      setToast({ ...result, key });
      return result;
    },
    []
  );

  const reset = useCallback(() => {
    const fresh = createInitialState();
    setState(fresh);
    toastSeq.current += 1;
    setToast({ ok: true, text: "已重置为演示数据", key: toastSeq.current });
  }, []);

  return { state, act, reset, toast };
}
