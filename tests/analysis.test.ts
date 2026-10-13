import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import { runBattle } from '../src/core/battle';
import type { SkillSet, SkillStats, SkillTier } from '../src/core/types';
import { clashDistribution, computeMatchup, sum, turnExpectation } from '../sim/analysis';
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
