// ============================================================
// core/rewards.ts - 보상 풀, 티어 추첨, 선택지 생성, 보상 적용
//
// 보상 한 개를 뽑는 방법:
//   1) 보상 티어를 가중치(REWARD_TIER_WEIGHTS)로 뽑는다
//   2) 그 티어에서 나올 수 있는 보상(REWARD_TABLE에서 null이 아닌 것) 중 균등 랜덤으로 고른다
// 선택지 여러 개는 위 과정을 선택지마다 따로 수행하고, 같은 보상은 중복해서 내지 않는다.
// ============================================================

import { REWARDS, REWARD_TABLE, REWARD_TIER_WEIGHTS } from '../data/balance';
import {
  SKILL_TIERS,
  type Reward,
  type RewardTier,
  type Rng,
  type SkillSet,
  type SkillStatKey,
} from './types';

const REWARD_TIERS: readonly RewardTier[] = [1, 2, 3];
const STAT_KEYS: readonly SkillStatKey[] = ['basePower', 'coinPower', 'coinCount'];

/** 해당 보상 티어에서 나올 수 있는 모든 보상 (순서 고정: 스킬 1→3, 기본 위력→코인 위력→코인 개수) */
export function getRewardPool(rewardTier: RewardTier): Reward[] {
  const pool: Reward[] = [];
  for (const skillTier of SKILL_TIERS) {
    for (const stat of STAT_KEYS) {
      const amount = REWARD_TABLE[skillTier][stat][rewardTier - 1];
      if (amount === null || amount === undefined) continue;
      pool.push({
        id: `s${skillTier}-${stat}-t${rewardTier}`,
        skillTier,
        stat,
        amount,
        rewardTier,
      });
    }
  }
  return pool;
}

/** 주어진 티어들 중에서 가중치대로 하나를 뽑는다 */
function pickTier(tiers: readonly RewardTier[], rng: Rng): RewardTier {
  const total = tiers.reduce((sum, t) => sum + REWARD_TIER_WEIGHTS[t], 0);
  let r = rng.next() * total;
  for (const tier of tiers) {
    r -= REWARD_TIER_WEIGHTS[tier];
    if (r < 0) return tier;
  }
  return tiers[tiers.length - 1];
}

/** 보상 티어 추첨 (전체 티어 대상) */
export function rollRewardTier(rng: Rng): RewardTier {
  return pickTier(REWARD_TIERS, rng);
}

/**
 * 보상 하나를 뽑는다. exclude에 있는 id는 나오지 않는다.
 * 뽑힌 티어에서 후보가 모두 제외된 경우, 후보가 남은 티어들 안에서 가중치대로 다시 뽑는다.
 * 후보가 하나도 없으면 null.
 */
export function pickReward(rng: Rng, exclude: ReadonlySet<string> = new Set()): Reward | null {
  const candidatesByTier = new Map<RewardTier, Reward[]>();
  for (const tier of REWARD_TIERS) {
    const candidates = getRewardPool(tier).filter((r) => !exclude.has(r.id));
    if (candidates.length > 0) candidatesByTier.set(tier, candidates);
  }
  const available = REWARD_TIERS.filter((t) => candidatesByTier.has(t));
  if (available.length === 0) return null;

  const tier = pickTier(available, rng);
  const candidates = candidatesByTier.get(tier)!;
  return candidates[rng.int(0, candidates.length - 1)];
}

/**
 * 보상 선택지 생성. 선택지마다 티어를 따로 뽑고, 같은 보상은 중복되지 않는다.
 * (가능한 보상 종류보다 count가 크면 가능한 만큼만 반환)
 */
export function generateChoices(rng: Rng, count: number = REWARDS.choicesPerPick): Reward[] {
  const choices: Reward[] = [];
  const used = new Set<string>();
  for (let i = 0; i < count; i++) {
    const reward = pickReward(rng, used);
    if (reward === null) break;
    choices.push(reward);
    used.add(reward.id);
  }
  return choices;
}

/** 보상을 적용한 새 SkillSet을 반환 (원본은 변경하지 않음) */
export function applyReward(skills: SkillSet, reward: Reward): SkillSet {
  return {
    ...skills,
    [reward.skillTier]: {
      ...skills[reward.skillTier],
      [reward.stat]: skills[reward.skillTier][reward.stat] + reward.amount,
    },
  };
}

/** 랜덤 보상을 count번 적용 (적 생성용: 선택 없이 매번 랜덤으로 하나씩 받음) */
export function applyRandomRewards(skills: SkillSet, count: number, rng: Rng): SkillSet {
  let result = skills;
  for (let i = 0; i < count; i++) {
    const reward = pickReward(rng);
    if (reward === null) break;
    result = applyReward(result, reward);
  }
  return result;
}
