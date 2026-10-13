import { describe, expect, it } from 'vitest';
import { createEnemySkills } from '../src/core/enemy';
import { createRng } from '../src/core/rng';
import { expectedDamage } from '../sim/policies';
import { BASE_SKILLS } from '../src/data/balance';

describe('createEnemySkills', () => {
  it('층이 높을수록 평균적으로 더 강해진다 (기대 데미지 기준)', () => {
    const avg = (floor: number) => {
      let total = 0;
      for (let seed = 1; seed <= 200; seed++) {
        total += expectedDamage(createEnemySkills(floor, createRng(seed)));
      }
      return total / 200;
    };
    expect(avg(1)).toBeGreaterThan(expectedDamage(BASE_SKILLS));
    expect(avg(5)).toBeGreaterThan(avg(1));
    expect(avg(10)).toBeGreaterThan(avg(5));
  });

  it('1층 이상의 적은 항상 기본 스펙과 다르다', () => {
    for (let floor = 1; floor <= 10; floor++) {
      for (let seed = 1; seed <= 30; seed++) {
        expect(createEnemySkills(floor, createRng(seed))).not.toEqual(BASE_SKILLS);
      }
    }
  });

  it('같은 시드면 같은 적이 나오고, 기본 스펙은 변하지 않는다', () => {
    const before = JSON.stringify(BASE_SKILLS);
    expect(createEnemySkills(4, createRng(8))).toEqual(createEnemySkills(4, createRng(8)));
    expect(JSON.stringify(BASE_SKILLS)).toBe(before);
  });
});
