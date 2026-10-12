// ============================================================
// core/skillDeck.ts - 스킬 묶음 (6개 셔플, 다 쓰면 리셋)
// 불변 방식: 덱 배열을 직접 바꾸지 않고 새 배열을 반환한다.
// ============================================================

import { DECK_COMPOSITION } from '../data/balance';
import { SKILL_TIERS, type Rng, type SkillTier } from './types';

/** 새 묶음 생성: 구성(1스킬 3, 2스킬 2, 3스킬 1)을 셔플 */
export function createDeck(rng: Rng): SkillTier[] {
  const cards: SkillTier[] = [];
  for (const tier of SKILL_TIERS) {
    for (let i = 0; i < DECK_COMPOSITION[tier]; i++) cards.push(tier);
  }
  return rng.shuffle(cards);
}

/**
 * 묶음에서 스킬 하나를 뽑는다. 묶음이 비어 있으면 새 묶음으로 리셋한 뒤 뽑는다.
 * 반환: 뽑힌 스킬과, 남은 묶음
 */
export function drawSkill(
  deck: readonly SkillTier[],
  rng: Rng,
): { tier: SkillTier; deck: SkillTier[] } {
  const source = deck.length > 0 ? deck : createDeck(rng);
  const [tier, ...rest] = source;
  return { tier, deck: rest };
}
