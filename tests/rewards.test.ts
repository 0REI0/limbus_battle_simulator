import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import {
  applyRandomRewards,
  applyReward,
  generateChoices,
  getRewardPool,
  pickReward,
  rollRewardTier,
} from '../src/core/rewards';
import type { SkillSet } from '../src/core/types';
import { BASE_SKILLS, REWARDS } from '../src/data/balance';
import { fixedRng } from './helpers';

const sumStats = (s: SkillSet) =>
  ([1, 2, 3] as const).reduce(
    (t, k) => t + s[k].basePower + s[k].coinPower + s[k].coinCount,
    0,
  );

describe('getRewardPool', () => {
  it('티어별 후보 개수: 1티어 3개, 2티어 6개, 3티어 6개', () => {
    expect(getRewardPool(1)).toHaveLength(3);
    expect(getRewardPool(2)).toHaveLength(6);
    expect(getRewardPool(3)).toHaveLength(6);
  });

  it('1티어는 기본 위력 증가뿐이고 증가량은 스킬별 1/2/3', () => {
    expect(getRewardPool(1).map((r) => [r.skillTier, r.stat, r.amount])).toEqual([
      [1, 'basePower', 1],
      [2, 'basePower', 2],
      [3, 'basePower', 3],
    ]);
  });

  it('3티어에는 기본 위력 증가가 없다', () => {
    expect(getRewardPool(3).some((r) => r.stat === 'basePower')).toBe(false);
  });

  it('보상 id는 모두 서로 다르다', () => {
    const ids = [1, 2, 3].flatMap((t) => getRewardPool(t as 1 | 2 | 3).map((r) => r.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('티어 추첨 (가중치 60/30/10)', () => {
  it('경계값에서 올바른 티어가 나온다', () => {
    const tierAt = (v: number) => rollRewardTier(fixedRng([v]));
    expect(tierAt(0.0)).toBe(1);
    expect(tierAt(0.59)).toBe(1);
    expect(tierAt(0.6)).toBe(2);
    expect(tierAt(0.89)).toBe(2);
    expect(tierAt(0.9)).toBe(3);
    expect(tierAt(0.99)).toBe(3);
  });

  it('많이 뽑으면 비율이 가중치에 가깝다', () => {
    const rng = createRng(11);
    const counts = { 1: 0, 2: 0, 3: 0 };
    const n = 20000;
    for (let i = 0; i < n; i++) counts[pickReward(rng)!.rewardTier]++;
    expect(counts[1] / n).toBeGreaterThan(0.57);
    expect(counts[1] / n).toBeLessThan(0.63);
    expect(counts[2] / n).toBeGreaterThan(0.27);
    expect(counts[2] / n).toBeLessThan(0.33);
    expect(counts[3] / n).toBeGreaterThan(0.08);
    expect(counts[3] / n).toBeLessThan(0.12);
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
    // 난수 0.0 → 항상 가장 낮은 티어(1티어)를 뽑으려 함. 1티어 후보는 3개뿐
    const choices = generateChoices(fixedRng([0.0]), 4);
    expect(choices.map((c) => c.rewardTier)).toEqual([1, 1, 1, 2]);
    expect(new Set(choices.map((c) => c.id)).size).toBe(4);
  });

  it('가능한 보상 종류보다 많이 요청하면 가능한 만큼만 반환한다', () => {
    const total = [1, 2, 3].reduce((n, t) => n + getRewardPool(t as 1 | 2 | 3).length, 0);
    const choices = generateChoices(createRng(1), total + 10);
    expect(choices).toHaveLength(total);
    expect(new Set(choices.map((c) => c.id)).size).toBe(total);
  });
});

describe('applyReward', () => {
  it('해당 스킬의 해당 수치만 증가하고 원본은 유지된다', () => {
    const reward = getRewardPool(2).find((r) => r.skillTier === 3 && r.stat === 'coinPower')!;
    const result = applyReward(BASE_SKILLS, reward);

    expect(result[3].coinPower).toBe(BASE_SKILLS[3].coinPower + reward.amount);
    expect(result[3].basePower).toBe(BASE_SKILLS[3].basePower);
    expect(result[1]).toEqual(BASE_SKILLS[1]);
    expect(result[2]).toEqual(BASE_SKILLS[2]);
    expect(BASE_SKILLS[3].coinPower).toBe(3); // 원본 불변
  });
});

describe('applyRandomRewards (적 생성용)', () => {
  it('0번 적용하면 스펙이 그대로다', () => {
    expect(applyRandomRewards(BASE_SKILLS, 0, createRng(1))).toEqual(BASE_SKILLS);
  });

  it('적용할수록 스펙 총합이 늘고 원본은 변하지 않는다', () => {
    const result = applyRandomRewards(BASE_SKILLS, 5, createRng(3));
    expect(sumStats(result)).toBeGreaterThanOrEqual(sumStats(BASE_SKILLS) + 5);
    expect(BASE_SKILLS[1]).toEqual({ basePower: 4, coinPower: 7, coinCount: 1 });
  });

  it('같은 시드면 같은 결과다', () => {
    expect(applyRandomRewards(BASE_SKILLS, 8, createRng(9))).toEqual(
      applyRandomRewards(BASE_SKILLS, 8, createRng(9)),
    );
  });
});
