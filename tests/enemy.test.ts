import { afterEach, describe, expect, it } from 'vitest';
import { createEnemySkills, pickEnemyReward } from '../src/core/enemy';
import { skillSetValue } from '../src/core/evaluate';
import { applyRandomRewards, applyReward, generateChoices } from '../src/core/rewards';
import { createRng } from '../src/core/rng';
import { expectedDamage } from '../sim/policies';
import { BASE_SKILLS, ENEMY, rewardCountForFloor } from '../src/data/balance';

// 이 파일의 테스트가 ENEMY 설정을 바꿔도 다른 테스트에 영향을 주지 않도록 복원
const originalEnemy = { ...ENEMY };
afterEach(() => {
  Object.assign(ENEMY, originalEnemy);
});

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

describe('적의 보상 획득 방식', () => {
  it("'random' 모드는 기존 방식(applyRandomRewards)과 정확히 같은 결과를 낸다", () => {
    ENEMY.pickMode = 'random';
    for (let floor = 1; floor <= 8; floor++) {
      expect(createEnemySkills(floor, createRng(floor * 3))).toEqual(
        applyRandomRewards(BASE_SKILLS, rewardCountForFloor(floor), createRng(floor * 3)),
      );
    }
  });

  describe('pickEnemyReward', () => {
    const valueOf = (reward: Parameters<typeof applyReward>[1]) =>
      skillSetValue(applyReward(BASE_SKILLS, reward));

    it('가치가 높은 순으로 정렬했을 때 rank번째 선택지를 고른다', () => {
      for (let seed = 1; seed <= 40; seed++) {
        const choices = generateChoices(createRng(seed));
        const sortedValues = choices.map(valueOf).sort((a, b) => b - a);
        for (const rank of [1, 2, 3]) {
          expect(valueOf(pickEnemyReward(BASE_SKILLS, choices, rank))).toBeCloseTo(sortedValues[rank - 1]);
        }
      }
    });

    it('rank 1이 가장 좋고 rank 3이 가장 나쁘다 (선택지 3개일 때)', () => {
      const choices = generateChoices(createRng(11));
      const best = valueOf(pickEnemyReward(BASE_SKILLS, choices, 1));
      const middle = valueOf(pickEnemyReward(BASE_SKILLS, choices, 2));
      const worst = valueOf(pickEnemyReward(BASE_SKILLS, choices, 3));
      expect(best).toBeGreaterThanOrEqual(middle);
      expect(middle).toBeGreaterThanOrEqual(worst);
    });

    it('범위를 벗어난 순위는 가장 가까운 끝으로 맞춘다', () => {
      const choices = generateChoices(createRng(4));
      expect(pickEnemyReward(BASE_SKILLS, choices, 99)).toBe(pickEnemyReward(BASE_SKILLS, choices, 3));
      expect(pickEnemyReward(BASE_SKILLS, choices, 0)).toBe(pickEnemyReward(BASE_SKILLS, choices, 1));
      expect(pickEnemyReward(BASE_SKILLS, choices, -5)).toBe(pickEnemyReward(BASE_SKILLS, choices, 1));
    });

    it('선택지가 하나뿐이면 순위와 상관없이 그것을 고른다', () => {
      const [only] = generateChoices(createRng(2), 1);
      expect(pickEnemyReward(BASE_SKILLS, [only], 2)).toBe(only);
    });

    it('선택지가 비어 있으면 에러', () => {
      expect(() => pickEnemyReward(BASE_SKILLS, [], 1)).toThrow();
    });

    it('이미 강화된 스펙을 기준으로 평가한다 (입력 스펙은 변하지 않는다)', () => {
      const before = JSON.stringify(BASE_SKILLS);
      pickEnemyReward(BASE_SKILLS, generateChoices(createRng(9)), 2);
      expect(JSON.stringify(BASE_SKILLS)).toBe(before);
    });
  });

  describe("'rank' 모드", () => {
    it('같은 시드면 같은 적이 나오고, 기본 스펙과 달라진다', () => {
      ENEMY.pickMode = 'rank';
      for (let floor = 1; floor <= 6; floor++) {
        const a = createEnemySkills(floor, createRng(floor));
        expect(a).toEqual(createEnemySkills(floor, createRng(floor)));
        expect(a).not.toEqual(BASE_SKILLS);
      }
    });

    it('rank가 낮을수록(더 좋은 선택을 할수록) 적이 평균적으로 더 강하다', () => {
      ENEMY.pickMode = 'rank';
      const averageValue = (rank: number) => {
        ENEMY.pickRank = rank;
        let total = 0;
        const seeds = 60;
        for (let seed = 1; seed <= seeds; seed++) {
          total += skillSetValue(createEnemySkills(5, createRng(seed)));
        }
        return total / seeds;
      };
      const r1 = averageValue(1);
      const r2 = averageValue(2);
      const r3 = averageValue(3);
      expect(r1).toBeGreaterThan(r2);
      expect(r2).toBeGreaterThan(r3);
    });

    it('rank 3(가장 나쁜 선택)도 기본 스펙보다는 강해진다 (보상은 대체로 이득이므로)', () => {
      ENEMY.pickMode = 'rank';
      ENEMY.pickRank = 3;
      let total = 0;
      for (let seed = 1; seed <= 40; seed++) total += skillSetValue(createEnemySkills(5, createRng(seed)));
      expect(total / 40).toBeGreaterThan(0);
    });
  });
});
