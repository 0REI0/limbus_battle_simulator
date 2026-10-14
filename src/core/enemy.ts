// ============================================================
// core/enemy.ts - 층수 기반 적 생성
//
// 적은 기본 스펙에서 시작해 "층수 * n"번의 보상을 받은 상태가 된다 (rewardCountForFloor).
// 보상을 받는 방식은 balance.ts의 ENEMY.pickMode로 정한다.
//   'random': 보상 풀에서 무작위로 하나씩 받는다.
//   'rank'  : 플레이어와 같이 선택지를 받고, 기대 순이득이 높은 순으로 정렬해 pickRank번째를 고른다.
//             (1 = 가장 좋은 것, 2 = 두 번째로 좋은 것 ...)
// ============================================================

import { BASE_SKILLS, ENEMY, rewardCountForFloor } from '../data/balance';
import { skillSetValue } from './evaluate';
import { applyRandomRewards, applyReward, generateChoices } from './rewards';
import type { Reward, Rng, SkillSet } from './types';

/**
 * 선택지를 "그 보상을 받은 뒤의 스킬 가치"(skillSetValue)가 높은 순으로 정렬했을 때 rank번째 보상을 고른다.
 * rank는 1부터 시작하고, 범위를 벗어나면 가장 가까운 끝(가장 좋은 것/가장 낮은 것)으로 맞춘다.
 * 가치가 같으면 선택지 순서를 유지한다.
 */
export function pickEnemyReward(skills: SkillSet, choices: readonly Reward[], rank: number): Reward {
  if (choices.length === 0) throw new Error('보상 선택지가 비어 있음');

  const ranked = choices
    .map((reward, index) => ({
      reward,
      index,
      value: skillSetValue(applyReward(skills, reward)),
    }))
    .sort((a, b) => b.value - a.value || a.index - b.index);

  const position = Math.min(Math.max(Math.round(rank), 1), ranked.length) - 1;
  return ranked[position].reward;
}

export function createEnemySkills(floor: number, rng: Rng): SkillSet {
  const count = rewardCountForFloor(floor);

  if (ENEMY.pickMode === 'random') {
    return applyRandomRewards(BASE_SKILLS, count, rng);
  }

  let skills = BASE_SKILLS;
  for (let i = 0; i < count; i++) {
    const choices = generateChoices(rng);
    if (choices.length === 0) break;
    skills = applyReward(skills, pickEnemyReward(skills, choices, ENEMY.pickRank));
  }
  return skills;
}
