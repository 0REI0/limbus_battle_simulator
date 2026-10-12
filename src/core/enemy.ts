// ============================================================
// core/enemy.ts - 층수 기반 적 생성
// 적은 기본 스펙에 "층수 * n"번의 랜덤 보상을 적용한 상태가 된다.
// (플레이어는 같은 횟수를 선택해서 받지만, 적은 선택 없이 랜덤이라 스펙이 한쪽으로 치우칠 수 있음)
// ============================================================

import { BASE_SKILLS, rewardCountForFloor } from '../data/balance';
import { applyRandomRewards } from './rewards';
import type { Rng, SkillSet } from './types';

export function createEnemySkills(floor: number, rng: Rng): SkillSet {
  return applyRandomRewards(BASE_SKILLS, rewardCountForFloor(floor), rng);
}
