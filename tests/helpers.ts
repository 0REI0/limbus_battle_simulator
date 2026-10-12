import type { Rng } from '../src/core/types';

/** 정해진 값을 순서대로 돌려주는 가짜 Rng (값이 끝나면 마지막 값 반복) */
export function fixedRng(values: number[]): Rng {
  let i = 0;
  const next = () => values[Math.min(i++, values.length - 1)];
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    shuffle: (items) => [...items],
  };
}
