import { afterEach, describe, expect, it } from 'vitest';
import { chooseEnemyRank, createEnemySpec, pickEnemyReward } from '../src/core/enemy';
import { specValue } from '../src/core/evaluate';
import { applyRandomRewards, applyReward, generateChoices, rewardId } from '../src/core/rewards';
import type { Reward, RewardEffect } from '../src/core/types';
import { createRng } from '../src/core/rng';
import { fixedRng } from './helpers';
import { expectedDamage } from '../sim/policies';
import { ENEMY, REWARD_TABLE, REWARD_TIERS, base, baseSpec, lose, ref, rewardCountForFloor, onUse, win } from '../src/data/balance';

// 이 파일의 테스트가 ENEMY 설정을 바꿔도 다른 테스트에 영향을 주지 않도록 복원
const originalEnemy = { ...ENEMY };
afterEach(() => {
  Object.assign(ENEMY, originalEnemy);
});

describe('createEnemySpec', () => {
  it('층이 높을수록 평균적으로 더 강해진다 (기대 데미지 기준)', () => {
    const avg = (floor: number) => {
      let total = 0;
      for (let seed = 1; seed <= 200; seed++) {
        total += expectedDamage(createEnemySpec(floor, createRng(seed)).skills);
      }
      return total / 200;
    };
    expect(avg(1)).toBeGreaterThan(expectedDamage(baseSpec().skills));
    expect(avg(5)).toBeGreaterThan(avg(1));
    expect(avg(10)).toBeGreaterThan(avg(5));
  });

  it('1층 이상의 적은 항상 기본 스펙과 다르다', () => {
    for (let floor = 1; floor <= 10; floor++) {
      for (let seed = 1; seed <= 30; seed++) {
        expect(createEnemySpec(floor, createRng(seed))).not.toEqual(baseSpec());
      }
    }
  });

  it('같은 시드면 같은 적이 나오고, 기본 스펙은 변하지 않는다', () => {
    const before = JSON.stringify(baseSpec());
    expect(createEnemySpec(4, createRng(8))).toEqual(createEnemySpec(4, createRng(8)));
    expect(JSON.stringify(baseSpec())).toBe(before);
  });
});

describe('적의 보상 획득 방식', () => {
  it("'random' 모드는 기존 방식(applyRandomRewards)과 정확히 같은 결과를 낸다", () => {
    ENEMY.pickMode = 'random';
    for (let floor = 1; floor <= 8; floor++) {
      expect(createEnemySpec(floor, createRng(floor * 3))).toEqual(
        applyRandomRewards(baseSpec(), rewardCountForFloor(floor), createRng(floor * 3)),
      );
    }
  });

  describe('pickEnemyReward', () => {
    const valueOf = (reward: Parameters<typeof applyReward>[1]) =>
      specValue(applyReward(baseSpec(), reward));

    it('가치가 높은 순으로 정렬했을 때 rank번째 선택지를 고른다', () => {
      for (let seed = 1; seed <= 40; seed++) {
        const choices = generateChoices(createRng(seed));
        const sortedValues = choices.map(valueOf).sort((a, b) => b - a);
        for (const rank of [1, 2, 3]) {
          expect(valueOf(pickEnemyReward(baseSpec(), choices, rank))).toBeCloseTo(sortedValues[rank - 1]);
        }
      }
    });

    it('rank 1이 가장 좋고 rank 3이 가장 나쁘다 (선택지 3개일 때)', () => {
      const choices = generateChoices(createRng(11));
      const best = valueOf(pickEnemyReward(baseSpec(), choices, 1));
      const middle = valueOf(pickEnemyReward(baseSpec(), choices, 2));
      const worst = valueOf(pickEnemyReward(baseSpec(), choices, 3));
      expect(best).toBeGreaterThanOrEqual(middle);
      expect(middle).toBeGreaterThanOrEqual(worst);
    });

    it('범위를 벗어난 순위는 가장 가까운 끝으로 맞춘다', () => {
      const choices = generateChoices(createRng(4));
      expect(pickEnemyReward(baseSpec(), choices, 99)).toBe(pickEnemyReward(baseSpec(), choices, 3));
      expect(pickEnemyReward(baseSpec(), choices, 0)).toBe(pickEnemyReward(baseSpec(), choices, 1));
      expect(pickEnemyReward(baseSpec(), choices, -5)).toBe(pickEnemyReward(baseSpec(), choices, 1));
    });

    it('선택지가 하나뿐이면 순위와 상관없이 그것을 고른다', () => {
      const [only] = generateChoices(createRng(2), 1);
      expect(pickEnemyReward(baseSpec(), [only], 2)).toBe(only);
    });

    it('선택지가 비어 있으면 에러', () => {
      expect(() => pickEnemyReward(baseSpec(), [], 1)).toThrow();
    });

    it('이미 강화된 스펙을 기준으로 평가한다 (입력 스펙은 변하지 않는다)', () => {
      const before = JSON.stringify(baseSpec());
      pickEnemyReward(baseSpec(), generateChoices(createRng(9)), 2);
      expect(JSON.stringify(baseSpec())).toBe(before);
    });
  });

  describe('chooseEnemyRank (순위 확률 선택)', () => {
    it('난수 구간에 따라 순위가 정해진다 (60/30/10)', () => {
      const rankAt = (v: number, n = 3) => chooseEnemyRank([60, 30, 10], n, fixedRng([v]));
      expect(rankAt(0.0)).toBe(1);
      expect(rankAt(0.3)).toBe(1);
      expect(rankAt(0.75)).toBe(2);
      expect(rankAt(0.95)).toBe(3);
    });

    it('많이 뽑으면 비율이 가중치에 가깝다', () => {
      const rng = createRng(5);
      const n = 30000;
      const counts = [0, 0, 0, 0];
      for (let i = 0; i < n; i++) counts[chooseEnemyRank([60, 30, 10], 3, rng)]++;
      expect(Math.abs(counts[1] / n - 0.6)).toBeLessThan(0.015);
      expect(Math.abs(counts[2] / n - 0.3)).toBeLessThan(0.015);
      expect(Math.abs(counts[3] / n - 0.1)).toBeLessThan(0.015);
    });

    it('선택지가 가중치보다 적으면 남은 순위끼리 비율을 다시 계산한다', () => {
      const rng = createRng(8);
      const n = 20000;
      const counts = [0, 0, 0, 0];
      for (let i = 0; i < n; i++) counts[chooseEnemyRank([60, 30, 10], 2, rng)]++;
      expect(counts[3]).toBe(0); // 선택지가 2개면 3순위는 나올 수 없다
      expect(Math.abs(counts[1] / n - 60 / 90)).toBeLessThan(0.015);
    });

    it('순위는 항상 1 이상, 선택지 수 이하다', () => {
      const rng = createRng(2);
      for (let choiceCount = 1; choiceCount <= 5; choiceCount++) {
        for (let i = 0; i < 200; i++) {
          const rank = chooseEnemyRank([5, 4, 3, 2, 1], choiceCount, rng);
          expect(rank).toBeGreaterThanOrEqual(1);
          expect(rank).toBeLessThanOrEqual(choiceCount);
        }
      }
    });

    it('가중치가 0인 순위는 나오지 않고, 남은 순위가 모두 0이면 가장 낮은 순위를 고른다', () => {
      const rng = createRng(3);
      for (let i = 0; i < 300; i++) expect(chooseEnemyRank([0, 1], 3, rng)).toBe(2);
      expect(chooseEnemyRank([0, 0, 0, 1], 3, createRng(1))).toBe(3);
    });

    it('가중치와 상관없이 난수를 정확히 1개만 소비한다', () => {
      for (const weights of [[100], [60, 30, 10], [0, 0, 5], [0, 0, 0]]) {
        const base = createRng(4);
        let calls = 0;
        const counting = {
          ...base,
          next: () => {
            calls++;
            return base.next();
          },
        };
        chooseEnemyRank(weights, 3, counting);
        expect(calls).toBe(1);
      }
    });

    it('잘못된 가중치는 에러', () => {
      const rng = createRng(1);
      expect(() => chooseEnemyRank([], 3, rng)).toThrow();
      expect(() => chooseEnemyRank([-1, 2], 3, rng)).toThrow();
      expect(() => chooseEnemyRank([Number.NaN], 3, rng)).toThrow();
    });
  });

  describe("'rank' 모드", () => {
    const averageValue = (weights: number[], seeds = 60, floor = 5) => {
      ENEMY.pickMode = 'rank';
      ENEMY.rankWeights = weights;
      let total = 0;
      for (let seed = 1; seed <= seeds; seed++) {
        total += specValue(createEnemySpec(floor, createRng(seed)));
      }
      return total / seeds;
    };

    it('같은 시드면 같은 적이 나오고, 기본 스펙과 달라진다', () => {
      ENEMY.pickMode = 'rank';
      ENEMY.rankWeights = [60, 30, 10];
      for (let floor = 1; floor <= 6; floor++) {
        const a = createEnemySpec(floor, createRng(floor));
        expect(a).toEqual(createEnemySpec(floor, createRng(floor)));
        expect(a).not.toEqual(baseSpec());
      }
    });

    it('항상 1순위를 고르면 항상 3순위를 고르는 것보다 적이 훨씬 강하고, 섞으면 그 사이다', () => {
      const best = averageValue([100]);
      const mixed = averageValue([60, 30, 10]);
      const worst = averageValue([0, 0, 100]);
      expect(best).toBeGreaterThan(mixed);
      expect(mixed).toBeGreaterThan(worst);
    });

    it('1순위 비중이 높을수록 적이 평균적으로 강하다', () => {
      expect(averageValue([80, 15, 5])).toBeGreaterThan(averageValue([30, 40, 30]));
    });

    it('3순위만 골라도 기본 스펙보다는 강해진다 (보상은 대체로 이득이므로)', () => {
      expect(averageValue([0, 0, 100], 40)).toBeGreaterThan(0);
    });

    it('가중치만 바꿔도 나머지 난수열이 어긋나지 않는다 (같은 시드의 선택지 후보가 같다)', () => {
      // 층 1: 선택지 생성 후 순위 난수 1개만 소비하므로, 가중치가 달라도 다음 난수는 같은 지점에서 이어진다
      const probe = (weights: number[]) => {
        ENEMY.pickMode = 'rank';
        ENEMY.rankWeights = weights;
        const rng = createRng(123);
        createEnemySpec(1, rng);
        return rng.next();
      };
      expect(probe([100])).toBe(probe([0, 0, 100]));
      expect(probe([60, 30, 10])).toBe(probe([100]));
    });
  });
});

describe('적이 새 종류의 보상(정신력, 스탯 참조 식)을 받을 때', () => {
  // 보상표를 통째로 바꿔서 확인한다 (테스트가 끝나면 원래 표로 되돌린다)
  const originalTable = { ...REWARD_TABLE };
  const originalWeights = [...ENEMY.rankWeights];
  const originalMode = ENEMY.pickMode;
  afterEach(() => {
    for (const tier of REWARD_TIERS) REWARD_TABLE[tier] = originalTable[tier];
    ENEMY.rankWeights = [...originalWeights];
    ENEMY.pickMode = originalMode;
  });

  /** 모든 티어의 보상표를 같은 한 가지 보상으로 채운다 */
  const onlyReward = (...effects: RewardEffect[]) => {
    for (const tier of REWARD_TIERS) REWARD_TABLE[tier] = [effects];
  };

  it('합 승리 정신력 보상을 받으면 적의 규칙이 보상 횟수만큼 바뀐다 (두 모드 모두)', () => {
    onlyReward(win(2));
    for (const mode of ['random', 'rank'] as const) {
      ENEMY.pickMode = mode;
      for (const floor of [1, 3, 6]) {
        const enemy = createEnemySpec(floor, createRng(floor));
        const expected = baseSpec().sanity.sanityOnClashWin + 2 * rewardCountForFloor(floor);
        expect(enemy.sanity.sanityOnClashWin).toBe(expected);
        expect(enemy.sanity.sanityOnClashLose).toBe(baseSpec().sanity.sanityOnClashLose);
        expect(enemy.skills).toEqual(baseSpec().skills); // 스킬은 그대로
      }
    }
  });

  it('스킬 사용 정신력 보상은 해당 스킬에만 쌓인다', () => {
    onlyReward(onUse(2, 3));
    for (const mode of ['random', 'rank'] as const) {
      ENEMY.pickMode = mode;
      const enemy = createEnemySpec(4, createRng(1));
      expect(enemy.skills[2].sanityOnUse).toBe(3 * rewardCountForFloor(4));
      expect(enemy.skills[1].sanityOnUse).toBe(0);
      expect(enemy.skills[3].sanityOnUse).toBe(0);
    }
  });

  it('스탯 참조 식 보상도 적에게 정상 적용된다 (1스킬 기본 위력 +(코인 개수), 코인 개수는 1이라 +1씩)', () => {
    onlyReward(base(1, ref('coinCount')));
    for (const mode of ['random', 'rank'] as const) {
      ENEMY.pickMode = mode;
      const enemy = createEnemySpec(5, createRng(2));
      expect(enemy.skills[1].basePower).toBe(baseSpec().skills[1].basePower + rewardCountForFloor(5));
    }
  });

  describe("'rank' 모드: 적은 정신력 보상도 가치를 평가해서 고른다", () => {
    const best = onUse(2, 15);
    const worst = onUse(2, -15);
    const neutral = base(1, 0);

    const setUp = (weights: number[]) => {
      // 1티어에 보상 3개만 두고 나머지 티어는 비운다 → 선택지는 항상 이 3개
      for (const tier of REWARD_TIERS) REWARD_TABLE[tier] = [];
      REWARD_TABLE[1] = [[worst], [neutral], [best]];
      ENEMY.pickMode = 'rank';
      ENEMY.rankWeights = weights;
    };

    it('항상 1순위를 고르면 사용 시 정신력 +15를, 항상 3순위를 고르면 -15를 받는다', () => {
      for (let seed = 1; seed <= 30; seed++) {
        setUp([100]);
        expect(createEnemySpec(1, createRng(seed)).skills[2].sanityOnUse).toBe(15);
        setUp([0, 0, 100]);
        expect(createEnemySpec(1, createRng(seed)).skills[2].sanityOnUse).toBe(-15);
        setUp([0, 100]);
        expect(createEnemySpec(1, createRng(seed)).skills[2].sanityOnUse).toBe(0); // 2순위 = 중립
      }
    });

    it('pickEnemyReward: 합 승리 정신력 + 보상이 합 패배 정신력 보상보다 높게 평가된다', () => {
      const mk = (effects: RewardEffect[]): Reward => ({ id: rewardId(1, effects), rewardTier: 1, effects });
      const winReward = mk([win(10)]);
      const loseReward = mk([lose(10)]); // 합 패배 시 정신력은 한 턴 모델에서 가치 0
      const noop = mk([base(1, 0)]);
      expect(pickEnemyReward(baseSpec(), [noop, loseReward, winReward], 1)).toBe(winReward);
      // 가치가 같은 보상끼리는 선택지 순서가 유지된다 (loseReward, noop 모두 0)
      expect(pickEnemyReward(baseSpec(), [noop, loseReward, winReward], 2)).toBe(noop);
      expect(pickEnemyReward(baseSpec(), [loseReward, noop, winReward], 2)).toBe(loseReward);
    });
  });

  it('새 종류의 보상이 섞인 보상표로도 높은 층까지 적 생성이 에러 없이 끝난다', () => {
    const table: RewardEffect[][] = [
      [base(1, ref('coinCount')), { skillTier: 1, stat: 'coinPower', amount: -1 }],
      [onUse(2, 2), win(1)],
      [lose(-1)],
      [onUse(3, -1), { skillTier: 3, stat: 'coinCount', amount: 1 }],
    ];
    for (const tier of REWARD_TIERS) REWARD_TABLE[tier] = table.map((effects) => [...effects]);
    for (const mode of ['random', 'rank'] as const) {
      ENEMY.pickMode = mode;
      for (let floor = 1; floor <= 25; floor += 8) {
        const enemy = createEnemySpec(floor, createRng(floor));
        for (const tier of [1, 2, 3] as const) {
          const stats = enemy.skills[tier];
          expect(Number.isFinite(stats.basePower)).toBe(true);
          expect(Number.isFinite(stats.coinPower)).toBe(true);
          expect(Number.isFinite(stats.sanityOnUse)).toBe(true);
          expect(stats.basePower).toBeGreaterThanOrEqual(0);
          expect(stats.coinCount).toBeGreaterThanOrEqual(1);
        }
        expect(Number.isFinite(enemy.sanity.sanityOnClashWin)).toBe(true);
        expect(Number.isFinite(enemy.sanity.sanityOnClashLose)).toBe(true);
      }
    }
  });
});
