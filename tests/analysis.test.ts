import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import { COIN } from '../src/data/balance';
import { runBattle } from '../src/core/battle';
import type { SkillSet, SkillStats, SkillTier } from '../src/core/types';
import { clashDistribution, computeMatchup, skillSetValue, sum, turnExpectation } from '../src/core/evaluate';
import { makeCombatant } from './helpers';

const stat = (basePower: number, coinPower: number, coinCount: number): SkillStats => ({
  basePower,
  coinPower,
  coinCount,
});

describe('clashDistribution (정확한 합 확률)', () => {
  it('항상 이기는 쪽이 남은 코인과 함께 이긴다', () => {
    // A 위력 10 고정(코인 1개), B 위력 1 고정(코인 2개): B가 2번 져서 코인 0, A는 1개 남음
    const dist = clashDistribution(stat(10, 0, 1), stat(1, 0, 2), 0.5);
    expect(dist.a[1]).toBeCloseTo(1);
    expect(sum(dist.b)).toBeCloseTo(0);
  });

  it('무승부는 제외하고 다시 굴린 것으로 계산한다', () => {
    // A: 앞면이면 2, 뒷면이면 0 / B: 앞면이면 1, 뒷면이면 0
    // A승 0.5, B승 0.25, 무승부 0.25 → 무승부 제외하면 A 2/3, B 1/3
    const dist = clashDistribution(stat(0, 2, 1), stat(0, 1, 1), 0.5);
    expect(sum(dist.a)).toBeCloseTo(2 / 3);
    expect(sum(dist.b)).toBeCloseTo(1 / 3);
  });

  it('모든 경우의 확률 합은 1이다', () => {
    const dist = clashDistribution(stat(4, 5, 2), stat(6, 4, 2), 0.5);
    expect(sum(dist.a) + sum(dist.b)).toBeCloseTo(1);
  });
});

describe('turnExpectation', () => {
  const spec: SkillSet = { 1: stat(4, 7, 1), 2: stat(4, 5, 2), 3: stat(6, 4, 2) };

  it('같은 스펙끼리는 순이득이 0이다', () => {
    const t = turnExpectation(spec, spec);
    expect(t.net).toBeCloseTo(0);
    expect(t.dealt).toBeCloseTo(t.taken);
  });

  it('스펙이 더 좋으면 순이득이 양수다', () => {
    const better: SkillSet = { ...spec, 3: stat(9, 4, 2) };
    expect(turnExpectation(better, spec).net).toBeGreaterThan(0);
    expect(turnExpectation(spec, better).net).toBeLessThan(0);
  });
});

describe('computeMatchup 캐시', () => {
  const spec: SkillSet = { 1: stat(4, 7, 1), 2: stat(4, 5, 2), 3: stat(4, 3, 3) };

  it('같은 입력이면 같은 결과를 돌려준다', () => {
    const first = computeMatchup(2, 3, spec, spec);
    const second = computeMatchup(2, 3, spec, spec);
    expect(second).toEqual(first);
  });

  it('캐시에서 꺼낸 값이 새로 계산한 값과 같다 (스펙이 바뀌면 다른 값이 나온다)', () => {
    const before = computeMatchup(1, 2, spec, spec);
    const changed: SkillSet = { ...spec, 1: stat(9, 7, 1) };
    const after = computeMatchup(1, 2, changed, spec);
    expect(after.winRate).toBeGreaterThan(before.winRate);
    // 원래 스펙으로 다시 계산해도 처음과 같다
    expect(computeMatchup(1, 2, spec, spec)).toEqual(before);
  });

  it('정신력 설정이 바뀌면 캐시가 무효화되어 새 설정으로 계산된다', () => {
    const original = COIN.sanityOnClashWin;
    try {
      const before = computeMatchup(3, 2, spec, spec); // 승자 정신력 +5 가정
      COIN.sanityOnClashWin = 30; // 승자의 공격 코인 앞면 확률이 크게 올라 기대 데미지가 커진다
      const after = computeMatchup(3, 2, spec, spec);
      expect(after.dmgRow).toBeGreaterThan(before.dmgRow);
      expect(after.winRate).toBeCloseTo(before.winRate); // 합 승률은 정신력 보상과 무관
    } finally {
      COIN.sanityOnClashWin = original;
    }
  });
});

describe('skillSetValue', () => {
  const spec: SkillSet = { 1: stat(4, 7, 1), 2: stat(4, 5, 2), 3: stat(4, 3, 3) };

  it('기준 스펙과 같으면 0, 더 강하면 양수, 더 약하면 음수다', () => {
    expect(skillSetValue(spec, spec)).toBeCloseTo(0);
    expect(skillSetValue({ ...spec, 2: stat(6, 5, 2) }, spec)).toBeGreaterThan(0);
    expect(skillSetValue({ ...spec, 2: stat(2, 5, 2) }, spec)).toBeLessThan(0);
  });

  it('turnExpectation의 순이득과 같은 값이다', () => {
    const better: SkillSet = { ...spec, 1: stat(4, 7, 2) };
    expect(skillSetValue(better, spec)).toBeCloseTo(turnExpectation(better, spec).net);
  });
});

describe('실제 battle.ts와의 일치 (회귀 검증)', () => {
  const spec: SkillSet = { 1: stat(4, 7, 1), 2: stat(4, 5, 2), 3: stat(6, 4, 2) };

  it('2스킬 vs 3스킬 합 승률이 계산값과 같다', () => {
    const n = 20000;
    let wins = 0;
    for (let seed = 1; seed <= n; seed++) {
      const mk = (tier: SkillTier) => makeCombatant(spec, 1, [tier]); // 체력 1: 첫 공격에서 종료
      const result = runBattle(mk(2), mk(3), createRng(seed));
      const end = result.events.find((e) => e.type === 'clashEnd');
      if (end?.type === 'clashEnd' && end.winner === 'player') wins++;
    }
    const expected = computeMatchup(2, 3, spec, spec).winRate;
    expect(Math.abs(wins / n - expected)).toBeLessThan(0.015);
  });
});
