import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import {
  applyRandomRewards,
  applyReward,
  describeReward,
  generateChoices,
  getRewardPool,
  pickReward,
  rewardId,
  rollRewardTier,
} from '../src/core/rewards';
import type { Reward } from '../src/core/types';
import {
  BASE_SKILLS,
  REWARD_TABLE,
  REWARD_TIERS,
  REWARD_TIER_WEIGHTS,
  REWARDS,
} from '../src/data/balance';
import { fixedRng } from './helpers';

const reward = (effects: Reward['effects']): Reward => ({
  id: rewardId(1, effects),
  rewardTier: 1,
  effects,
});

describe('보상 풀', () => {
  it('보상 티어는 5개이고 각 티어에 보상이 있다', () => {
    expect(REWARD_TIERS).toHaveLength(5);
    for (const tier of REWARD_TIERS) expect(getRewardPool(tier).length).toBeGreaterThan(0);
  });

  it('풀의 크기와 순서는 REWARD_TABLE을 그대로 따른다', () => {
    for (const tier of REWARD_TIERS) {
      const pool = getRewardPool(tier);
      expect(pool).toHaveLength(REWARD_TABLE[tier].length);
      pool.forEach((r, i) => {
        expect(r.rewardTier).toBe(tier);
        expect(r.effects).toEqual(REWARD_TABLE[tier][i]);
      });
    }
  });

  it('모든 보상은 효과가 1개 이상이고 id가 서로 다르다', () => {
    const all = REWARD_TIERS.flatMap((t) => getRewardPool(t));
    expect(all.every((r) => r.effects.length >= 1)).toBe(true);
    expect(new Set(all.map((r) => r.id)).size).toBe(all.length);
  });

  it('id와 설명 문자열 형식', () => {
    const effects = [
      { skillTier: 1, stat: 'coinCount', amount: 1 },
      { skillTier: 1, stat: 'coinPower', amount: -1 },
    ] as const;
    expect(rewardId(3, effects)).toBe('t3:1.coinCount+1,1.coinPower-1');
    expect(describeReward(reward([...effects]))).toBe('1스킬 코인 개수 +1 / 1스킬 코인 위력 -1');
  });
});

describe('티어 추첨', () => {
  const total = REWARD_TIERS.reduce((s, t) => s + REWARD_TIER_WEIGHTS[t], 0);

  it('각 티어 구간의 한가운데 난수는 해당 티어가 나온다', () => {
    let acc = 0;
    for (const tier of REWARD_TIERS) {
      const w = REWARD_TIER_WEIGHTS[tier];
      if (w > 0) expect(rollRewardTier(fixedRng([(acc + w / 2) / total]))).toBe(tier);
      acc += w;
    }
  });

  it('많이 뽑으면 티어 비율이 가중치에 가깝다', () => {
    const rng = createRng(11);
    const n = 30000;
    const counts = new Map<number, number>();
    for (let i = 0; i < n; i++) {
      const tier = pickReward(rng)!.rewardTier;
      counts.set(tier, (counts.get(tier) ?? 0) + 1);
    }
    for (const tier of REWARD_TIERS) {
      const expected = REWARD_TIER_WEIGHTS[tier] / total;
      expect(Math.abs((counts.get(tier) ?? 0) / n - expected)).toBeLessThan(0.02);
    }
  });
});

describe('generateChoices', () => {
  it('기본 선택지 개수만큼 만들고 중복이 없다', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const choices = generateChoices(createRng(seed));
      expect(choices).toHaveLength(REWARDS.choicesPerPick);
      expect(new Set(choices.map((c) => c.id)).size).toBe(choices.length);
    }
  });

  it('같은 시드면 같은 선택지가 나온다', () => {
    expect(generateChoices(createRng(5))).toEqual(generateChoices(createRng(5)));
  });

  it('뽑힌 티어의 후보가 소진되면 남은 티어에서 뽑는다', () => {
    // 난수 0.0 → 항상 가장 낮은 티어(1티어)를 뽑으려 함
    const n1 = getRewardPool(1).length;
    const choices = generateChoices(fixedRng([0.0]), n1 + 1);
    expect(choices.map((c) => c.rewardTier)).toEqual([...Array(n1).fill(1), 2]);
    expect(new Set(choices.map((c) => c.id)).size).toBe(n1 + 1);
  });

  it('가능한 보상 종류보다 많이 요청하면 가능한 만큼만 반환한다', () => {
    const total = REWARD_TIERS.reduce((n, t) => n + getRewardPool(t).length, 0);
    const choices = generateChoices(createRng(1), total + 10);
    expect(choices).toHaveLength(total);
    expect(new Set(choices.map((c) => c.id)).size).toBe(total);
  });
});

describe('applyReward', () => {
  const BASE = { ...BASE_SKILLS }; // 비교용 (원본 변경 여부 확인)

  it('효과가 여러 개인 보상은 모두 적용된다', () => {
    const r = reward([
      { skillTier: 1, stat: 'coinCount', amount: 1 },
      { skillTier: 1, stat: 'coinPower', amount: -1 },
      { skillTier: 3, stat: 'basePower', amount: 2 },
    ]);
    const result = applyReward(BASE_SKILLS, r);

    expect(result[1].coinCount).toBe(BASE_SKILLS[1].coinCount + 1);
    expect(result[1].coinPower).toBe(BASE_SKILLS[1].coinPower - 1);
    expect(result[1].basePower).toBe(BASE_SKILLS[1].basePower);
    expect(result[3].basePower).toBe(BASE_SKILLS[3].basePower + 2);
    expect(result[2]).toEqual(BASE_SKILLS[2]);
  });

  it('원본은 변경하지 않는다', () => {
    applyReward(BASE_SKILLS, reward([{ skillTier: 2, stat: 'basePower', amount: 5 }]));
    expect(BASE_SKILLS).toEqual(BASE);
  });

  it('감소 효과는 한계 밑으로 내려가지 않는다 (기본/코인 위력 0, 코인 개수 1)', () => {
    const result = applyReward(
      BASE_SKILLS,
      reward([
        { skillTier: 1, stat: 'coinPower', amount: -100 },
        { skillTier: 1, stat: 'basePower', amount: -100 },
        { skillTier: 1, stat: 'coinCount', amount: -100 },
      ]),
    );
    expect(result[1]).toEqual({ basePower: 0, coinPower: 0, coinCount: 1 });
  });
});

describe('applyRandomRewards (적 생성용)', () => {
  it('0번 적용하면 스펙이 그대로다', () => {
    expect(applyRandomRewards(BASE_SKILLS, 0, createRng(1))).toEqual(BASE_SKILLS);
  });

  it('적용하면 스펙이 달라지고 원본은 변하지 않는다', () => {
    const before = JSON.stringify(BASE_SKILLS);
    const result = applyRandomRewards(BASE_SKILLS, 5, createRng(3));
    expect(result).not.toEqual(BASE_SKILLS);
    expect(JSON.stringify(BASE_SKILLS)).toBe(before);
  });

  it('같은 시드면 같은 결과다', () => {
    expect(applyRandomRewards(BASE_SKILLS, 8, createRng(9))).toEqual(
      applyRandomRewards(BASE_SKILLS, 8, createRng(9)),
    );
  });
});
