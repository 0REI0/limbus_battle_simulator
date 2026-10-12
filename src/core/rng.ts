// ============================================================
// core/rng.ts - 시드 기반 난수 생성기 (mulberry32)
// 같은 시드 → 같은 난수열. 버그 재현, 테스트, 시뮬레이션에 사용.
// ============================================================

import type { Rng } from './types';

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    shuffle: <T>(items: readonly T[]): T[] => {
      const arr = [...items];
      // Fisher-Yates
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
}

/**
 * 시드와 salt로 새 시드를 파생한다 (해시 섞기). 같은 입력 → 같은 출력.
 * 난수 생성기 객체를 상태에 넣지 않고, "시드 + 용도"로 필요할 때마다 생성기를 만들 때 사용한다.
 */
export function deriveSeed(seed: number, salt: number): number {
  let h = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * 새 게임용 시드 생성. 프로젝트에서 Math.random을 직접 쓰는 유일한 곳.
 * (UI/진입점에서 한 번만 호출하고, 나온 시드를 createRng에 넘긴다)
 */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0x100000000);
}
