// ============================================================
// sim/rewardValues.ts - 보상별 "기대 추가 데미지" 출력 (보상 티어를 짤 때 참고)
//
// 사용법:
//   npx tsx sim/rewardValues.ts               현재 REWARD_TABLE을 티어별로 출력
//   npx tsx sim/rewardValues.ts --candidates  후보 보상 전체를 가치순으로 출력 (표를 새로 짤 때)
// 수치를 바꿔 비교하는 옵션(--picks 등)은 sim/overrides.ts 참고.
//
// 두 가지 값을 보여준다 (둘 다 기본 스펙 대비 증가량, 한 묶음 = 스킬 6번 사용 기준):
//   dmg  : 기대 데미지 증가 = greedyDmg 정책이 보는 값 (합 승패는 무시한 단순 지표)
//   net  : 순이득 증가 = (내가 입히는 기대 데미지 - 내가 받는 기대 데미지) 의 증가량.
//          합 승률 변화(특히 코인 개수)가 반영된다. 기본 스펙 상대로 계산.
// ============================================================

import { applyReward, describeReward, getRewardPool, rewardId } from '../src/core/rewards';
import type { Reward, RewardEffect, RewardTier, SkillTier } from '../src/core/types';
import {
  BASE_SKILLS,
  REWARD_TABLE,
  REWARD_TIERS,
  REWARD_TIER_WEIGHTS,
} from '../src/data/balance';
import { DECK_SIZE, turnExpectation } from './analysis';
import { applyOverrides } from './overrides';
import { expectedDamage } from './policies';

const overrides = applyOverrides();
if (overrides.length > 0) console.log(`\n[덮어쓴 값: ${overrides.join(', ')}]`);

interface Evaluated {
  reward: Reward;
  dmg: number;
  net: number;
}

const baseDmg = expectedDamage(BASE_SKILLS);

function evaluate(reward: Reward): Evaluated {
  const skills = applyReward(BASE_SKILLS, reward);
  return {
    reward,
    dmg: expectedDamage(skills) - baseDmg,
    net: turnExpectation(skills, BASE_SKILLS).net * DECK_SIZE,
  };
}

const signed = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(1)}`;
const row = (e: Evaluated) =>
  `  ${signed(e.dmg).padStart(7)}  ${signed(e.net).padStart(7)}  ${describeReward(e.reward)}`;
const HEADER = `  ${'dmg'.padStart(7)}  ${'net'.padStart(7)}  보상`;

console.log(`\n기본 스펙 기준 (한 묶음 = 스킬 6번 사용): 기대 데미지 합계 ${baseDmg.toFixed(1)}, 상대 대비 순이득 0`);
console.log('dmg = 기대 데미지 증가 (greedyDmg 기준) / net = 합 승률 변화까지 반영한 순이득 증가\n');

if (process.argv.includes('--candidates')) {
  // ---- 후보 전체: 새 표를 짤 때 가치를 훑어보는 용도 ----
  const candidates: Reward[] = [];
  const add = (effects: RewardEffect[]) => {
    candidates.push({ id: rewardId(1, effects), rewardTier: 1, effects });
  };
  for (const skill of [1, 2, 3] as SkillTier[]) {
    for (let n = 1; n <= 6; n++) add([{ skillTier: skill, stat: 'basePower', amount: n }]);
    for (let n = 1; n <= 4; n++) add([{ skillTier: skill, stat: 'coinPower', amount: n }]);
    add([
      { skillTier: skill, stat: 'coinCount', amount: 1 },
      { skillTier: skill, stat: 'coinPower', amount: -1 },
    ]);
    add([
      { skillTier: skill, stat: 'coinCount', amount: 1 },
      { skillTier: skill, stat: 'coinPower', amount: -2 },
    ]);
    add([
      { skillTier: skill, stat: 'coinCount', amount: 1 },
      { skillTier: skill, stat: 'basePower', amount: 1 },
      { skillTier: skill, stat: 'coinPower', amount: -2 },
    ]);
  }
  const evaluated = candidates.map(evaluate).sort((a, b) => a.net - b.net);
  console.log(`[후보 ${evaluated.length}개: net 오름차순]`);
  console.log(HEADER);
  for (const e of evaluated) console.log(row(e));
} else {
  // ---- 현재 표를 티어별로 ----
  const totalWeight = REWARD_TIERS.reduce((s, t) => s + REWARD_TIER_WEIGHTS[t], 0);
  const summary: string[] = [];
  for (const tier of REWARD_TIERS as readonly RewardTier[]) {
    const pool = getRewardPool(tier);
    const weight = REWARD_TIER_WEIGHTS[tier];
    console.log(`[${tier}티어] 등장 가중치 ${weight} (${((weight / totalWeight) * 100).toFixed(1)}%), 보상 ${REWARD_TABLE[tier].length}개`);
    if (pool.length === 0) {
      console.log('  (비어 있음)\n');
      continue;
    }
    console.log(HEADER);
    const evaluated = pool.map(evaluate);
    for (const e of evaluated) console.log(row(e));
    const avg = (f: (e: Evaluated) => number) => evaluated.reduce((s, e) => s + f(e), 0) / evaluated.length;
    const nets = evaluated.map((e) => e.net);
    const minNet = Math.min(...nets);
    const maxNet = Math.max(...nets);
    console.log(`  → 평균 dmg ${signed(avg((e) => e.dmg))}, net ${signed(avg((e) => e.net))} / net 범위 ${signed(minNet)} ~ ${signed(maxNet)} (폭 ${(maxNet - minNet).toFixed(1)})\n`);
    summary.push(
      `${tier}티어: 평균 net ${signed(avg((e) => e.net))}, 폭 ${(maxNet - minNet).toFixed(1)}`,
    );
  }
  console.log('[티어 요약] ' + summary.join(' | ') + '\n');
}
