import { describe, expect, it } from 'vitest';
import { createEnemySkills } from '../src/core/enemy';
import { createRng } from '../src/core/rng';
import type { SkillSet } from '../src/core/types';
import { BASE_SKILLS, rewardCountForFloor } from '../src/data/balance';

const sumStats = (s: SkillSet) =>
  ([1, 2, 3] as const).reduce(
    (t, k) => t + s[k].basePower + s[k].coinPower + s[k].coinCount,
    0,
  );

describe('createEnemySkills', () => {
  it('층이 높을수록 평균적으로 더 강해진다', () => {
    const avg = (floor: number) => {
      let total = 0;
      for (let seed = 1; seed <= 200; seed++) {
        total += sumStats(createEnemySkills(floor, createRng(seed)));
      }
      return total / 200;
    };
    expect(avg(5)).toBeGreaterThan(avg(1));
    expect(avg(10)).toBeGreaterThan(avg(5));
  });

  it('보상 횟수(층수 * n)만큼은 반드시 강해진다', () => {
    for (let floor = 1; floor <= 10; floor++) {
      const enemy = createEnemySkills(floor, createRng(floor));
      expect(sumStats(enemy)).toBeGreaterThanOrEqual(
        sumStats(BASE_SKILLS) + rewardCountForFloor(floor),
      );
    }
  });

  it('같은 시드면 같은 적이 나오고, 기본 스펙은 변하지 않는다', () => {
    expect(createEnemySkills(4, createRng(8))).toEqual(createEnemySkills(4, createRng(8)));
    expect(BASE_SKILLS[1]).toEqual({ basePower: 4, coinPower: 7, coinCount: 1 });
  });
});
