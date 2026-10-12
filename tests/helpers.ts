import type { Rng } from '../src/core/types';

/** 정해진 값을 순서대로 돌려주는 가짜 Rng (값이 끝나면 마지막 값 반복) */
export function fixedRng(values: number[]): Rng {
  let i = 0;
  const next = () => values[Math.min(i++, values.length - 1)];
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    shuffle: (items) => [...items],
  };
}

import type { Combatant, SkillSet, SkillStats, SkillTier } from '../src/core/types';

/** 세 스킬이 모두 같은 스펙인 SkillSet */
export function uniformSkills(stats: SkillStats): SkillSet {
  return { 1: { ...stats }, 2: { ...stats }, 3: { ...stats } };
}

/** 테스트용 Combatant (덱 순서를 직접 지정, 난수 소비 없음) */
export function makeCombatant(
  skills: SkillSet,
  hp: number,
  deck: SkillTier[] = [1, 1, 1, 2, 2, 3],
): Combatant {
  return { skills, maxHp: hp, hp, sanity: 0, deck };
}
