// ============================================================
// core/rewards.ts - 보상 풀, 티어 추첨, 선택지 생성, 보상 적용
//
// 보상 한 개를 뽑는 방법:
//   1) 보상 티어를 가중치(REWARD_TIER_WEIGHTS)로 뽑는다
//   2) 그 티어의 보상 목록(REWARD_TABLE[티어]) 중 균등 랜덤으로 고른다
// 선택지 여러 개는 위 과정을 선택지마다 따로 수행하고, 같은 보상은 중복해서 내지 않는다.
//
// 보상 하나 = 효과 목록. 효과는 두 종류다.
//   - 스킬 효과: (스킬 종류, 스탯 종류, 수치). 수치는 숫자이거나 그 스킬의 현재 스탯을 참조하는 식
//   - 정신력 규칙 효과: 플레이어/적 본체의 합 승리/패배 시 정신력 증감을 바꾼다
// ============================================================

import { REWARDS, REWARD_TABLE, REWARD_TIERS, REWARD_TIER_WEIGHTS } from '../data/balance';
import {
  isSanityRuleEffect,
  type AmountFormula,
  type Reward,
  type RewardAmount,
  type RewardEffect,
  type RewardTier,
  type Rng,
  type SanityRuleKey,
  type SkillSet,
  type SkillStatKey,
  type SkillStats,
  type UnitSpec,
} from './types';

/**
 * 스탯이 내려갈 수 있는 한계 (감소 효과로 이보다 낮아지면 한계값으로 맞춘다).
 * 코인 위력과 사용 시 정신력은 하한이 없다 (마이너스 코인 가능. 단, 최종 위력은 0 미만이 되지 않는다: coins.ts).
 */
const STAT_MIN: Record<SkillStatKey, number> = {
  basePower: 0,
  coinPower: Number.NEGATIVE_INFINITY,
  coinCount: 1,
  sanityOnUse: Number.NEGATIVE_INFINITY,
};

export const STAT_LABEL: Record<SkillStatKey, string> = {
  basePower: '기본 위력',
  coinPower: '코인 위력',
  coinCount: '코인 개수',
  sanityOnUse: '사용시 정신력',
};

export const RULE_LABEL: Record<SanityRuleKey, string> = {
  sanityOnClashWin: '합 승리시 정신력',
  sanityOnClashLose: '합 패배시 정신력',
};

// ------------------------------------------------------------
// 수치 계산 / 표기
// ------------------------------------------------------------

/**
 * 수치를 실제 증감값으로 바꾼다. 스탯 참조 식이면 skill(보상 적용 전 그 스킬의 스탯)로 계산한다.
 * 식의 결과는 계수 * (스탯들의 곱)이고, 소수가 나오면 0에서 먼 쪽이 아니라 가장 가까운 정수로 반올림한다.
 */
export function resolveAmount(amount: RewardAmount, skill: SkillStats): number {
  if (typeof amount === 'number') return amount;
  const value = amount.factor * amount.of.reduce((product, key) => product * skill[key], 1);
  return Math.sign(value) * Math.round(Math.abs(value)) + 0; // 반올림은 부호 대칭, + 0은 -0 방지
}

/** 식을 사람이 읽는 형태로: "코인 개수×코인 위력", "코인 위력×2" */
export function formulaText(amount: AmountFormula): string {
  const parts: string[] = amount.of.map((key) => STAT_LABEL[key]);
  if (Math.abs(amount.factor) !== 1 || parts.length === 0) parts.push(String(Math.abs(amount.factor)));
  return parts.join('×');
}

/** 수치 표기: 숫자는 "+3", "-1" / 식은 "+(코인 개수)", "-(코인 위력×2)". minus로 마이너스 기호를 바꿀 수 있다 */
export function amountText(amount: RewardAmount, minus = '-'): string {
  if (typeof amount === 'number') return amount >= 0 ? `+${amount}` : `${minus}${Math.abs(amount)}`;
  return `${amount.factor < 0 ? minus : '+'}(${formulaText(amount)})`;
}

/** 보상 id 조각: 식도 내용으로 구분되도록 (예: "+coinCount*coinPower", "-coinPower*2") */
function amountKey(amount: RewardAmount): string {
  if (typeof amount === 'number') return amount >= 0 ? `+${amount}` : `${amount}`;
  const parts: string[] = [...amount.of];
  if (Math.abs(amount.factor) !== 1 || parts.length === 0) parts.push(String(Math.abs(amount.factor)));
  return `${amount.factor < 0 ? '-' : '+'}${parts.join('*')}`;
}

function effectKey(effect: RewardEffect): string {
  return isSanityRuleEffect(effect)
    ? `${effect.rule}${amountKey(effect.amount)}`
    : `${effect.skillTier}.${effect.stat}${amountKey(effect.amount)}`;
}

/** 보상 id: 티어와 효과 내용으로 만든 고유 문자열 (예: "t3:1.coinCount+1,1.coinPower-1") */
export function rewardId(rewardTier: RewardTier, effects: readonly RewardEffect[]): string {
  return `t${rewardTier}:${effects.map(effectKey).join(',')}`;
}

/** 효과 한 줄 설명 (예: "1스킬 기본 위력 +(코인 개수)", "합 승리시 정신력 +2") */
export function describeEffect(effect: RewardEffect): string {
  return isSanityRuleEffect(effect)
    ? `${RULE_LABEL[effect.rule]} ${amountText(effect.amount)}`
    : `${effect.skillTier}스킬 ${STAT_LABEL[effect.stat]} ${amountText(effect.amount)}`;
}

/** 사람이 읽는 설명 (예: "1스킬 코인 개수 +1 / 1스킬 코인 위력 -1") */
export function describeReward(reward: Reward): string {
  return reward.effects.map(describeEffect).join(' / ');
}

// ------------------------------------------------------------
// 보상 풀
// ------------------------------------------------------------

// 보상표(REWARD_TABLE)는 게임 중에 바뀌지 않으므로, 티어별 보상 목록을 한 번만 만들어 재사용한다.
// (보상을 뽑을 때마다 id 문자열과 객체를 새로 만들면 시뮬레이션에서 가장 큰 비용이 된다)
// 표의 배열 객체를 키로 쓰기 때문에, 표를 통째로 교체하면 자동으로 다시 만든다.
const poolCache = new WeakMap<RewardEffect[][], readonly Reward[]>();

/** 공유되는 효과 객체를 수정할 수 없게 얼린다 (스탯 참조 식 안쪽까지) */
function freezeEffect(effect: RewardEffect): RewardEffect {
  if (isSanityRuleEffect(effect) || typeof effect.amount === 'number') return Object.freeze({ ...effect });
  const amount: AmountFormula = Object.freeze({
    factor: effect.amount.factor,
    of: Object.freeze([...effect.amount.of]),
  });
  return Object.freeze({ ...effect, amount });
}

/** 캐시된 보상 목록. 반환된 보상 객체는 공유되므로 수정할 수 없게 얼려 둔다 */
function cachedPool(rewardTier: RewardTier): readonly Reward[] {
  const entries = REWARD_TABLE[rewardTier];
  let pool = poolCache.get(entries);
  if (pool === undefined) {
    pool = entries.map((effects) =>
      Object.freeze({
        id: rewardId(rewardTier, effects),
        rewardTier,
        effects: Object.freeze(effects.map(freezeEffect)) as RewardEffect[],
      }),
    );
    poolCache.set(entries, pool);
  }
  return pool;
}

/** 해당 보상 티어에서 나올 수 있는 모든 보상 (REWARD_TABLE 순서 그대로) */
export function getRewardPool(rewardTier: RewardTier): Reward[] {
  return [...cachedPool(rewardTier)];
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
  const candidatesByTier = new Map<RewardTier, readonly Reward[]>();
  for (const tier of REWARD_TIERS) {
    const pool = cachedPool(tier);
    const candidates = exclude.size === 0 ? pool : pool.filter((r) => !exclude.has(r.id));
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

// ------------------------------------------------------------
// 보상 적용
// ------------------------------------------------------------

/**
 * 보상의 모든 효과를 적용한 새 UnitSpec을 반환 (원본은 변경하지 않음).
 * 스탯 참조 식은 모두 "보상을 적용하기 전"의 스탯으로 계산하므로 효과 순서와 상관없이 결과가 같다.
 * 예) [기본 위력 +(코인 개수), 코인 개수 +1] → 기본 위력 증가량은 코인 개수가 늘어나기 전 값
 */
export function applyReward(spec: UnitSpec, reward: Reward): UnitSpec {
  const skills: SkillSet = {
    1: { ...spec.skills[1] },
    2: { ...spec.skills[2] },
    3: { ...spec.skills[3] },
  };
  const sanity = { ...spec.sanity };

  for (const effect of reward.effects) {
    if (isSanityRuleEffect(effect)) {
      sanity[effect.rule] += effect.amount;
      continue;
    }
    const delta = resolveAmount(effect.amount, spec.skills[effect.skillTier]); // 적용 전 스탯 기준
    const stats = skills[effect.skillTier];
    stats[effect.stat] = Math.max(STAT_MIN[effect.stat], stats[effect.stat] + delta);
  }
  return { skills, sanity };
}

/** 랜덤 보상을 count번 적용 (적 생성용: 선택 없이 매번 랜덤으로 하나씩 받음) */
export function applyRandomRewards(spec: UnitSpec, count: number, rng: Rng): UnitSpec {
  let result = spec;
  for (let i = 0; i < count; i++) {
    const reward = pickReward(rng);
    if (reward === null) break;
    result = applyReward(result, reward);
  }
  return result;
}
