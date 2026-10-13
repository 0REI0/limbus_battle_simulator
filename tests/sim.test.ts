import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import { startRun } from '../src/core/run';
import { expectedDamage, POLICIES } from '../sim/policies';
import { simulate } from '../sim/simulate';
import type { SkillSet } from '../src/core/types';

// 기본 스펙이 바뀌어도 손계산이 깨지지 않도록 고정된 스펙을 쓴다
const SPEC: SkillSet = {
  1: { basePower: 4, coinPower: 7, coinCount: 1 },
  2: { basePower: 4, coinPower: 5, coinCount: 2 },
  3: { basePower: 6, coinPower: 4, coinCount: 2 },
};

describe('policies', () => {
  it('모든 정책은 현재 선택지 안의 보상 id를 반환한다', () => {
    for (const policy of POLICIES) {
      for (let seed = 1; seed <= 50; seed++) {
        const state = startRun(seed);
        const id = policy.pick(state, createRng(seed));
        expect(state.choices.map((c) => c.id)).toContain(id);
      }
    }
  });

  it('기대 데미지가 손계산과 일치한다', () => {
    // 1스킬: 1*4 + 0.5*7*1 = 7.5 (x3) / 2스킬: 2*4 + 0.5*5*3 = 15.5 (x2) / 3스킬: 2*6 + 0.5*4*3 = 18 (x1)
    expect(expectedDamage(SPEC)).toBeCloseTo(7.5 * 3 + 15.5 * 2 + 18);
  });
});

describe('simulate', () => {
  const opts = { runs: 60, seed: 3, maxFloor: 30 };

  it('같은 옵션이면 같은 결과다', () => {
    expect(simulate(POLICIES[0], opts)).toEqual(simulate(POLICIES[0], opts));
  });

  it('통계가 서로 모순되지 않는다', () => {
    for (const policy of POLICIES) {
      const s = simulate(policy, opts);
      expect(s.cleared).toHaveLength(opts.runs);
      expect(s.floorAttempts[1]).toBe(opts.runs); // 모든 판은 1층 전투를 치른다
      for (let f = 1; f <= opts.maxFloor; f++) {
        expect(s.floorWins[f]).toBeLessThanOrEqual(s.floorAttempts[f]);
      }
      expect(s.median).toBeLessThanOrEqual(s.p90);
      expect(s.p90).toBeLessThanOrEqual(s.max);
      expect(s.shareAtLeast10).toBeLessThanOrEqual(s.shareAtLeast5);
    }
  });

  it('maxFloor에 도달하면 중단된다', () => {
    const s = simulate(POLICIES[0], { runs: 5, seed: 1, maxFloor: 1 });
    expect(Math.max(...s.cleared)).toBeLessThanOrEqual(1);
  });
});
