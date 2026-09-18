import type { AppState } from "./types";
import { createSeedState } from "./seed";

const KEY = "hxyfront-62007-state-v1";

/** 刷新后状态仍在：读取本地持久化状态 */
export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const seed = createSeedState();
      localStorage.setItem(KEY, JSON.stringify(seed));
      return seed;
    }
    const parsed = JSON.parse(raw) as AppState;
    if (!Array.isArray(parsed.specimens) || !Array.isArray(parsed.slots)) {
      return createSeedState();
    }
    return parsed;
  } catch {
    return createSeedState();
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // 存储不可用时静默降级为内存态
  }
}

export function resetState(): AppState {
  const seed = createSeedState();
  saveState(seed);
  return seed;
}
