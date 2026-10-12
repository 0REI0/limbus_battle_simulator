import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import { createDeck, drawSkill } from '../src/core/skillDeck';
import type { SkillTier } from '../src/core/types';

const countTier = (deck: SkillTier[], tier: SkillTier) =>
  deck.filter((t) => t === tier).length;

describe('createDeck', () => {
  it('1스킬 3개, 2스킬 2개, 3스킬 1개로 구성된다', () => {
    const deck = createDeck(createRng(1));
    expect(deck).toHaveLength(6);
    expect(countTier(deck, 1)).toBe(3);
    expect(countTier(deck, 2)).toBe(2);
    expect(countTier(deck, 3)).toBe(1);
  });

  it('같은 시드면 같은 순서다', () => {
    expect(createDeck(createRng(77))).toEqual(createDeck(createRng(77)));
  });
});

describe('drawSkill', () => {
  it('한 묶음 6번 동안 구성이 정확히 소진된다', () => {
    const rng = createRng(3);
    let deck = createDeck(rng);
    const drawn: SkillTier[] = [];
    for (let i = 0; i < 6; i++) {
      const result = drawSkill(deck, rng);
      drawn.push(result.tier);
      deck = result.deck;
    }
    expect(deck).toHaveLength(0);
    expect(countTier(drawn, 1)).toBe(3);
    expect(countTier(drawn, 2)).toBe(2);
    expect(countTier(drawn, 3)).toBe(1);
  });

  it('묶음이 비면 새 묶음으로 리셋된다', () => {
    const rng = createRng(3);
    const result = drawSkill([], rng);
    expect([1, 2, 3]).toContain(result.tier);
    expect(result.deck).toHaveLength(5);
  });

  it('원본 덱을 변경하지 않는다', () => {
    const deck: SkillTier[] = [1, 2, 3];
    drawSkill(deck, createRng(1));
    expect(deck).toEqual([1, 2, 3]);
  });
});
