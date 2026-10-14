// ============================================================
// core/enemy.ts - 층수 기반 적 생성
//
// 적은 기본 스펙에서 시작해 "층수 * n"번의 보상을 받은 상태가 된다 (rewardCountForFloor).
// 보상을 받는 방식은 balance.ts의 ENEMY.pickMode로 정한다.
//   'random': 보상 풀에서 무작위로 하나씩 받는다.
//   'rank'  : 플레이어와 같이 선택지를 받고, 기대 순이득이 높은 순으로 정렬한 뒤
//             ENEMY.rankWeights의 확률로 순위(1 = 가장 좋은 것, 2 = 두 번째 ...)를 정해 그 선택지를 고른다.
//             예: [60, 30, 10]이면 60%는 가장 좋은 선택지, 30%는 두 번째, 10%는 세 번째.
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

/**
 * rankWeights에 따라 순위(1부터)를 확률적으로 정한다. 난수는 정확히 1개만 사용한다
 * (가중치를 바꿔도 이후 난수열이 어긋나지 않아, 같은 시드로 설정만 바꿔 비교할 수 있다).
 *  - choiceCount보다 긴 가중치는 무시하고, 남은 순위끼리 비율을 다시 계산한다.
 *  - 남은 순위의 가중치가 모두 0이면 가장 낮은 순위(마지막)를 고른다.
 */
export function chooseEnemyRank(weights: readonly number[], choiceCount: number, rng: Rng): number {
  if (weights.length === 0 || weights.some((w) => !Number.isFinite(w) || w < 0)) {
    throw new Error('ENEMY.rankWeights는 0 이상의 숫자가 1개 이상 있어야 함');
  }
  const usable = weights.slice(0, Math.max(1, choiceCount));
  const total = usable.reduce((sum, w) => sum + w, 0);
  const roll = rng.next(); // 가중치와 상관없이 항상 1개 소비
  if (total <= 0) return usable.length;

  let r = roll * total;
  let lastPositive = usable.length;
  for (let i = 0; i < usable.length; i++) {
    if (usable[i] <= 0) continue;
    lastPositive = i + 1;
    r -= usable[i];
    if (r < 0) return i + 1;
  }
  return lastPositive; // 부동소수점 오차 대비
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
    const rank = chooseEnemyRank(ENEMY.rankWeights, choices.length, rng);
    skills = applyReward(skills, pickEnemyReward(skills, choices, rank));
  }
  return skills;
}
