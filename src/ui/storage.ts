// ============================================================
// ui/storage.ts - localStorage에 최고 기록 저장 (브라우저 저장소를 못 쓰는 환경에서도 에러 없이 동작)
// ============================================================

const BEST_KEY = 'limbus_battle_simulator:best-floors';

/** 지금까지의 최고 클리어 층 수 (없으면 0) */
export function loadBest(): number {
  try {
    const value = Number(localStorage.getItem(BEST_KEY));
    return Number.isInteger(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

/** 기존 기록보다 높을 때만 저장한다 */
export function recordBest(floors: number): void {
  if (floors <= loadBest()) return;
  try {
    localStorage.setItem(BEST_KEY, String(floors));
  } catch {
    // 시크릿 모드 등 저장소를 쓸 수 없으면 기록만 포기한다
  }
}
