// ============================================================
// core/coins.ts - 코인 굴리기와 최종 위력 계산 (합/공격 공용)
// ============================================================

import { COIN } from '../data/balance';
import type { AttackHit, Coins, Rng, SkillStats } from './types';

/** 정신력을 허용 범위(-45 ~ +45)로 제한 */
export function clampSanity(sanity: number): number {
  return Math.min(COIN.sanityMax, Math.max(COIN.sanityMin, sanity));
}

/** 앞면 확률 (0~1) = (50 + 정신력)% */
export function headsProbability(sanity: number): number {
  return (COIN.baseHeadsPercent + clampSanity(sanity)) / 100;
}

/** 코인 count개를 한 번에 굴린다. true = 앞면 */
export function rollCoins(count: number, sanity: number, rng: Rng): Coins {
  const p = headsProbability(sanity);
  const coins: Coins = [];
  for (let i = 0; i < count; i++) {
    coins.push(rng.chance(p));
  }
  return coins;
}

export function countHeads(coins: Coins): number {
  return coins.filter(Boolean).length;
}

/**
 * 최종 위력 = 기본 위력 + 코인 위력 * 앞면 개수.
 * 코인 위력이 음수(마이너스 코인)여도 위력이 0 아래로 내려가지는 않는다 (음수 데미지로 회복되는 것을 막는다).
 */
export function finalPower(skill: SkillStats, heads: number): number {
  return Math.max(0, skill.basePower + skill.coinPower * heads);
}

/**
 * 공격용: 굴려둔 코인 배열에서 타격별 결과를 계산한다.
 * i번째 타격의 위력 = 기본 위력 + 코인 위력 * (0~i번째 코인 중 앞면 수)
 * 코인을 하나씩 누적해서 굴리는 것과 확률적으로 동일하다.
 * (targetHpAfter는 battle.ts에서 채운다)
 */
export function computeHits(
  skill: SkillStats,
  coins: Coins,
): Omit<AttackHit, 'targetHpAfter'>[] {
  let headsSoFar = 0;
  return coins.map((isHeads, coinIndex) => {
    if (isHeads) headsSoFar++;
    return { coinIndex, headsSoFar, power: finalPower(skill, headsSoFar) };
  });
}
