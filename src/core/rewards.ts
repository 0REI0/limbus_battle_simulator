// ============================================================
// core/rewards.ts - 보상 풀, 티어 추첨, 선택지 생성, 보상 적용
//
// 보상 한 개를 뽑는 방법:
//   1) 보상 티어를 가중치(REWARD_TIER_WEIGHTS)로 뽑는다
//   2) 그 티어의 보상 목록(REWARD_TABLE[티어]) 중 균등 랜덤으로 고른다
// 선택지 여러 개는 위 과정을 선택지마다 따로 수행하고, 같은 보상은 중복해서 내지 않는다.
// ============================================================

import { REWARDS, REWARD_TABLE, REWARD_TIERS, REWARD_TIER_WEIGHTS } from '../data/balance';
import type {
  Reward,
  RewardEffect,
  RewardTier,
  Rng,
  SkillSet,
  SkillStatKey,
} from './types';

/** 스탯이 내려갈 수 있는 한계 (감소 효과로 이보다 낮아지면 한계값으로 맞춘다) */
const STAT_MIN: Record<SkillStatKey, number> = { basePower: 0, coinPower: 0, coinCount: 1 };

export const STAT_LABEL: Record<SkillStatKey, string> = {
  basePower: '기본 위력',
  coinPower: '코인 위력',
  coinCount: '코인 개수',
};

/** 보상 id: 티어와 효과 내용으로 만든 고유 문자열 (예: "t3:1.coinCount+1,1.coinPower-1") */
export function rewardId(rewardTier: RewardTier, effects: readonly RewardEffect[]): string {
  const parts = effects.map(
    (e) => `${e.skillTier}.${e.stat}${e.amount >= 0 ? '+' : ''}${e.amount}`,
  );
  return `t${rewardTier}:${parts.join(',')}`;
}

/** 사람이 읽는 설명 (예: "1스킬 코인 개수 +1 / 1스킬 코인 위력 -1") */
export function describeReward(reward: Reward): string {
  return reward.effects
    .map((e) => `${e.skillTier}스킬 ${STAT_LABEL[e.stat]} ${e.amount >= 0 ? '+' : ''}${e.amount}`)
    .join(' / ');
}

/** 해당 보상 티어에서 나올 수 있는 모든 보상 (REWARD_TABLE 순서 그대로) */
export function getRewardPool(rewardTier: RewardTier): Reward[] {
  return REWARD_TABLE[rewardTier].map((effects) => ({
    id: rewardId(rewardTier, effects),
    rewardTier,
    effects: effects.map((e) => ({ ...e })),
  }));
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

/** 보상의 모든 효과를 적용한 새 SkillSet을 반환 (원본은 변경하지 않음) */
export function applyReward(skills: SkillSet, reward: Reward): SkillSet {
  const result: SkillSet = {
    1: { ...skills[1] },
    2: { ...skills[2] },
    3: { ...skills[3] },
  };
  for (const effect of reward.effects) {
    const stats = result[effect.skillTier];
    stats[effect.stat] = Math.max(STAT_MIN[effect.stat], stats[effect.stat] + effect.amount);
  }
  return result;
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
