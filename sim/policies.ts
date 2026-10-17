// ============================================================
// sim/policies.ts - 시뮬레이션용 "플레이어 보상 선택 전략"
// 전략이 다양하게 존재해야 보상표가 의미 있는 선택을 만드는지 확인할 수 있다.
//  - random 대비 다른 전략이 확실히 더 멀리 가면 → 선택이 의미 있음
//  - 특정 전략이 압도적이면 → 그 보상이 너무 강한 것 (밸런스 조정 대상)
// ============================================================

import { applyReward, resolveAmount } from '../src/core/rewards';
import type { RunState } from '../src/core/run';
import {
  isSanityRuleEffect,
  type Reward,
  type RewardEffect,
  type Rng,
  type SkillSet,
  type SkillStatKey,
  type SkillTier,
  type UnitSpec,
} from '../src/core/types';
import { DECK_COMPOSITION, baseSpec } from '../src/data/balance';
import { expectedAttackDamage, turnExpectation } from '../src/core/evaluate';

export interface Policy {
  name: string;
  description: string;
  /** 현재 선택지 중 고를 보상의 id를 반환 */
  pick(state: RunState, rng: Rng): string;
}

/** 점수가 가장 높은 선택지를 고른다 (동점이면 랜덤) */
function pickBest(choices: readonly Reward[], score: (r: Reward) => number, rng: Rng): string {
  let best = -Infinity;
  let ties: Reward[] = [];
  for (const reward of choices) {
    const s = score(reward);
    if (s > best) {
      best = s;
      ties = [reward];
    } else if (s === best) {
      ties.push(reward);
    }
  }
  return ties[rng.int(0, ties.length - 1)].id;
}

/**
 * 스킬 6번 사용(= 묶음 한 사이클) 동안의 기대 데미지 합계 (정신력 0, 앞면 확률 50% 가정).
 * 마이너스 코인으로 위력이 0에서 잘리는 경우까지 반영한다 (core/evaluate.ts의 expectedAttackDamage).
 * 합에서의 유불리는 고려하지 않는 단순 지표 (합 반영 지표는 core/evaluate.ts의 turnExpectation).
 */
export function expectedDamage(skills: SkillSet): number {
  let total = 0;
  for (const tier of [1, 2, 3] as const) {
    total += DECK_COMPOSITION[tier] * expectedAttackDamage(skills[tier], skills[tier].coinCount, 0.5);
  }
  return total;
}

const STAT_RANK: Record<SkillStatKey, number> = { basePower: 0, coinPower: 1, coinCount: 2, sanityOnUse: 0 };

/** 효과의 실제 증감값 (스탯 참조 식은 현재 스펙의 스탯으로 계산) */
const effectAmount = (e: RewardEffect, spec: UnitSpec): number =>
  isSanityRuleEffect(e) ? e.amount : resolveAmount(e.amount, spec.skills[e.skillTier]);

const touches = (r: Reward, tier: SkillTier) =>
  r.effects.some((e) => !isSanityRuleEffect(e) && e.skillTier === tier);
/** 증가시키는 수치들의 합 (감소 효과는 제외) */
const gainSum = (r: Reward, spec: UnitSpec) =>
  r.effects.reduce((sum, e) => sum + Math.max(0, effectAmount(e, spec)), 0);
/** 증가시키는 스킬 스탯 중 가장 "높은" 종류 (코인 개수 > 코인 위력 > 기본 위력). 정신력 규칙 효과는 제외 */
const topStatRank = (r: Reward, spec: UnitSpec) =>
  Math.max(
    -1,
    ...r.effects
      .filter((e) => !isSanityRuleEffect(e) && effectAmount(e, spec) > 0)
      .map((e) => (isSanityRuleEffect(e) ? -1 : STAT_RANK[e.stat])),
  );

export const POLICIES: Policy[] = [
  {
    name: 'random',
    description: '선택지 중 무작위 (기준선)',
    pick: (state, rng) => pickBest(state.choices, () => 0, rng),
  },
  {
    name: 'highTier',
    description: '보상 티어가 높은 것 우선 (같은 티어끼리는 무작위)',
    pick: (state, rng) => pickBest(state.choices, (r) => r.rewardTier, rng),
  },
  {
    name: 'skill1',
    description: '1스킬 강화 우선',
    pick: (state, rng) =>
      pickBest(state.choices, (r) => (touches(r, 1) ? 1000 : 0) + gainSum(r, state.player), rng),
  },
  {
    name: 'skill3',
    description: '3스킬 강화 우선',
    pick: (state, rng) =>
      pickBest(state.choices, (r) => (touches(r, 3) ? 1000 : 0) + gainSum(r, state.player), rng),
  },
  {
    name: 'coinCount',
    description: '코인 개수 > 코인 위력 > 기본 위력 순으로 우선',
    pick: (state, rng) =>
      pickBest(state.choices, (r) => topStatRank(r, state.player) * 1000 + gainSum(r, state.player), rng),
  },
  {
    name: 'greedyDmg',
    description: '기대 데미지가 가장 많이 오르는 보상',
    pick: (state, rng) =>
      pickBest(
        state.choices,
        (r) => expectedDamage(applyReward(state.player, r).skills) - expectedDamage(state.player.skills),
        rng,
      ),
  },
  {
    name: 'greedyNet',
    description: '합 승률 변화까지 반영한 순이득(net)이 가장 많이 오르는 보상',
    pick: (state, rng) =>
      pickBest(
        state.choices,
        (r) => turnExpectation(applyReward(state.player, r), baseSpec()).net,
        rng,
      ),
  },
];
