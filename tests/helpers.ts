import type { Combatant, Rng, SanityRules, SkillSet, SkillStats, SkillTier, UnitSpec } from '../src/core/types';
import { baseSanityRules } from '../src/data/balance';

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

/** 스킬 스탯 입력: 사용 시 정신력(sanityOnUse)은 생략하면 0 */
export type SkillInput = Omit<SkillStats, 'sanityOnUse'> & { sanityOnUse?: number };

export const skillStats = (input: SkillInput): SkillStats => ({ ...input, sanityOnUse: input.sanityOnUse ?? 0 });

/** 세 스킬이 모두 같은 스펙인 SkillSet */
export function uniformSkills(stats: SkillInput): SkillSet {
  return { 1: skillStats(stats), 2: skillStats(stats), 3: skillStats(stats) };
}

/** 스킬별로 스펙을 지정한 SkillSet (sanityOnUse 생략 가능) */
export function skillSet(sets: Record<SkillTier, SkillInput>): SkillSet {
  return { 1: skillStats(sets[1]), 2: skillStats(sets[2]), 3: skillStats(sets[3]) };
}

/** 스킬 + 정신력 규칙으로 UnitSpec 만들기. 규칙은 기본값(합 승리 +5, 패배 0)에서 일부만 바꿀 수 있다 */
export function specOf(skills: SkillSet, sanity: Partial<SanityRules> = {}): UnitSpec {
  return { skills, sanity: { ...baseSanityRules(), ...sanity } };
}

/** 테스트용 Combatant (덱 순서를 직접 지정, 난수 소비 없음) */
export function makeCombatant(
  skills: SkillSet,
  hp: number,
  deck: SkillTier[] = [1, 1, 1, 2, 2, 3],
  sanity: Partial<SanityRules> = {},
): Combatant {
  return { skills, sanityRules: { ...baseSanityRules(), ...sanity }, maxHp: hp, hp, sanity: 0, deck };
}
