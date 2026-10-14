import { describe, expect, it } from 'vitest';
import {
  clampSanity,
  computeHits,
  countHeads,
  finalPower,
  headsProbability,
  rollCoins,
} from '../src/core/coins';
import { createRng } from '../src/core/rng';
import { fixedRng } from './helpers';

describe('정신력과 앞면 확률', () => {
  it('정신력 0이면 50%', () => {
    expect(headsProbability(0)).toBeCloseTo(0.5);
  });
  it('정신력 +45면 95%, -45면 5%', () => {
    expect(headsProbability(45)).toBeCloseTo(0.95);
    expect(headsProbability(-45)).toBeCloseTo(0.05);
  });
  it('범위를 넘는 정신력은 제한된다', () => {
    expect(clampSanity(100)).toBe(45);
    expect(clampSanity(-100)).toBe(-45);
    expect(headsProbability(100)).toBeCloseTo(0.95);
  });
});

describe('rollCoins', () => {
  it('요청한 개수만큼 굴린다 (0개 포함)', () => {
    const rng = createRng(1);
    expect(rollCoins(0, 0, rng)).toEqual([]);
    expect(rollCoins(3, 0, rng)).toHaveLength(3);
  });

  it('난수 < 앞면 확률이면 앞면이다', () => {
    // 확률 0.5: 0.49 → 앞면, 0.5 → 뒷면, 0.9 → 뒷면
    expect(rollCoins(3, 0, fixedRng([0.49, 0.5, 0.9]))).toEqual([true, false, false]);
  });

  it('정신력이 높으면 앞면이 더 자주 나온다', () => {
    const rng = createRng(42);
    const high = countHeads(rollCoins(5000, 45, rng));
    const low = countHeads(rollCoins(5000, -45, rng));
    expect(high).toBeGreaterThan(4500);
    expect(low).toBeLessThan(500);
  });
});

describe('최종 위력', () => {
  const single = { basePower: 4, coinPower: 7, coinCount: 1 };
  const triple = { basePower: 5, coinPower: 3, coinCount: 3 };

  it('기본 위력 + 코인 위력 * 앞면 수', () => {
    expect(finalPower(single, 0)).toBe(4);
    expect(finalPower(single, 1)).toBe(11);
    expect(finalPower(triple, 3)).toBe(14);
  });
});

describe('마이너스 코인 위력', () => {
  const negative = { basePower: 3, coinPower: -2, coinCount: 3 };

  it('앞면이 나올수록 위력이 줄고, 0 아래로는 내려가지 않는다', () => {
    expect(finalPower(negative, 0)).toBe(3);
    expect(finalPower(negative, 1)).toBe(1);
    expect(finalPower(negative, 2)).toBe(0); // 3 - 4 = -1 → 0
    expect(finalPower(negative, 3)).toBe(0); // 3 - 6 = -3 → 0
  });

  it('타격 위력도 0 아래로 내려가지 않는다 (음수 데미지로 회복하지 않는다)', () => {
    const hits = computeHits(negative, [true, true, true]);
    expect(hits.map((h) => h.power)).toEqual([1, 0, 0]);
    expect(hits.every((h) => h.power >= 0)).toBe(true);
  });
});

describe('computeHits', () => {
  it('타격마다 누적 앞면 수로 위력을 계산한다', () => {
    // 기본 4, 코인 위력 4
    const hits = computeHits({ basePower: 4, coinPower: 4, coinCount: 3 }, [true, false, true]);
    expect(hits.map((h) => h.headsSoFar)).toEqual([1, 1, 2]);
    expect(hits.map((h) => h.power)).toEqual([8, 8, 12]);
    expect(hits.map((h) => h.coinIndex)).toEqual([0, 1, 2]);
  });

  it('코인이 없으면 타격도 없다', () => {
    expect(computeHits({ basePower: 4, coinPower: 7, coinCount: 1 }, [])).toEqual([]);
  });
});
