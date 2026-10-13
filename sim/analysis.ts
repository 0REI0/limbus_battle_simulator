// ============================================================
// sim/analysis.ts - 합 확률 / 기대 데미지 계산 (몬테카를로 아님, 정확한 확률 계산)
// matchup.ts, rewardValues.ts, policies.ts가 공유한다.
// ============================================================

import type { SkillSet, SkillStats, SkillTier } from '../src/core/types';
import { COIN, DECK_COMPOSITION } from '../src/data/balance';

export const TIERS: readonly SkillTier[] = [1, 2, 3];

// ---- 이항분포 ----
function binomialPmf(n: number, p: number): number[] {
  const pmf: number[] = [];
  let c = 1; // C(n, k)
  for (let k = 0; k <= n; k++) {
    pmf.push(c * p ** k * (1 - p) ** (n - k));
    c = (c * (n - k)) / (k + 1);
  }
  return pmf;
}

/** 한 라운드에서 A가 이길 확률 / B가 이길 확률 (같으면 무승부) */
function roundOdds(sa: SkillStats, a: number, sb: SkillStats, b: number, p: number) {
  const pa = binomialPmf(a, p);
  const pb = binomialPmf(b, p);
  let aWin = 0;
  let bWin = 0;
  for (let ha = 0; ha <= a; ha++) {
    const powA = sa.basePower + sa.coinPower * ha;
    for (let hb = 0; hb <= b; hb++) {
      const powB = sb.basePower + sb.coinPower * hb;
      if (powA > powB) aWin += pa[ha] * pb[hb];
      else if (powA < powB) bWin += pa[ha] * pb[hb];
    }
  }
  return { aWin, bWin };
}

export interface ClashDist {
  /** A가 이기며 r개 남을 확률 (index = r) */
  a: number[];
  /** B가 이기며 r개 남을 확률 */
  b: number[];
}

/** 합 결과 분포: 누가 이기고, 몇 개가 남는가. 합 상태 (a, b) = 양측 남은 코인 개수 */
export function clashDistribution(sa: SkillStats, sb: SkillStats, p: number): ClashDist {
  const memo = new Map<string, ClashDist>();
  const size = Math.max(sa.coinCount, sb.coinCount) + 1;

  const solve = (a: number, b: number): ClashDist => {
    const key = `${a},${b}`;
    const cached = memo.get(key);
    if (cached) return cached;

    const dist: ClashDist = { a: new Array(size).fill(0), b: new Array(size).fill(0) };
    if (b === 0) dist.a[a] = 1;
    else if (a === 0) dist.b[b] = 1;
    else {
      const { aWin, bWin } = roundOdds(sa, a, sb, b, p);
      const decisive = aWin + bWin;
      if (decisive === 0) throw new Error('항상 무승부인 매치업 (합이 끝나지 않음)');
      const pa = aWin / decisive; // 무승부는 다시 굴리므로 제외하고 정규화
      const pb = bWin / decisive;
      const afterAWin = solve(a, b - 1); // A가 이기면 B 코인 -1
      const afterBWin = solve(a - 1, b);
      for (let r = 0; r < size; r++) {
        dist.a[r] = pa * afterAWin.a[r] + pb * afterBWin.a[r];
        dist.b[r] = pa * afterAWin.b[r] + pb * afterBWin.b[r];
      }
    }
    memo.set(key, dist);
    return dist;
  };

  return solve(sa.coinCount, sb.coinCount);
}

export const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

/** 합 승자가 공격할 때의 앞면 확률 (합 승리 정신력 보정 반영) */
export function winnerHeadsProb(): number {
  const bonus = COIN.sanityMode === 'dynamic' ? COIN.sanityOnClashWin : 0;
  const sanity = Math.min(COIN.sanityMax, Math.max(COIN.sanityMin, COIN.initialSanity + bonus));
  return (COIN.baseHeadsPercent + sanity) / 100;
}

/** 코인 r개로 공격할 때의 기대 데미지 (처치로 인한 중단 무시) */
export function expectedAttackDamage(skill: SkillStats, r: number, headsProb: number): number {
  return r * skill.basePower + skill.coinPower * headsProb * ((r * (r + 1)) / 2);
}

export interface Matchup {
  winRate: number; // 행(row) 스킬이 합에서 이길 확률
  dmgRow: number; // 행 스킬 측이 입히는 기대 데미지 (이겼을 때만 공격)
  dmgCol: number; // 열 스킬 측이 입히는 기대 데미지
  avgRemainWin: number; // 행이 이겼을 때 남는 코인 평균
}

export function computeMatchup(
  rowTier: SkillTier,
  colTier: SkillTier,
  rowSkills: SkillSet,
  colSkills: SkillSet,
): Matchup {
  const sr = rowSkills[rowTier];
  const sc = colSkills[colTier];
  const p0 = (COIN.baseHeadsPercent + COIN.initialSanity) / 100;
  const dist = clashDistribution(sr, sc, p0);
  const pw = winnerHeadsProb();

  const winRate = sum(dist.a);
  let dmgRow = 0;
  let dmgCol = 0;
  let remainSum = 0;
  dist.a.forEach((prob, r) => {
    if (r === 0) return;
    dmgRow += prob * expectedAttackDamage(sr, r, pw);
    remainSum += prob * r;
  });
  dist.b.forEach((prob, r) => {
    if (r === 0) return;
    dmgCol += prob * expectedAttackDamage(sc, r, pw);
  });
  return {
    winRate,
    dmgRow,
    dmgCol,
    avgRemainWin: winRate > 0 ? remainSum / winRate : 0,
  };
}

/** 비교 단위: 스킬 6번 사용 = 묶음 한 사이클 (보상 가치를 "한 묶음 기준"으로 보여줄 때 곱한다) */
export const DECK_SIZE = TIERS.reduce((s, t) => s + DECK_COMPOSITION[t], 0);

/**
 * 양측 스킬이 묶음 구성 비율(1스킬 3 : 2스킬 2 : 3스킬 1)대로 무작위로 나온다고 보고 계산한 한 턴 평균.
 */
export function turnExpectation(player: SkillSet, enemy: SkillSet) {
  let dealt = 0;
  let taken = 0;
  for (const r of TIERS) {
    for (const c of TIERS) {
      const w = (DECK_COMPOSITION[r] * DECK_COMPOSITION[c]) / (DECK_SIZE * DECK_SIZE);
      const m = computeMatchup(r, c, player, enemy);
      dealt += w * m.dmgRow;
      taken += w * m.dmgCol;
    }
  }
  return { dealt, taken, net: dealt - taken };
}
