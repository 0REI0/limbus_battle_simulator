// ============================================================
// core/evaluate.ts - 합 확률 / 기대 데미지 계산 (몬테카를로 아님, 정확한 확률 계산)
//
// 스킬 스펙이 얼마나 강한지 숫자로 평가한다. 쓰는 곳:
//  - core/enemy.ts: 적이 보상 선택지를 평가해 고를 때
//  - sim/: 밸런스 분석 도구와 시뮬레이션 정책
// ============================================================

import { BASE_SKILLS, COIN, DECK_COMPOSITION } from '../data/balance';
import type { SkillSet, SkillStats, SkillTier } from './types';

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
    const powA = Math.max(0, sa.basePower + sa.coinPower * ha); // 최종 위력은 0 미만이 되지 않는다 (coins.ts의 finalPower와 같은 규칙)
    for (let hb = 0; hb <= b; hb++) {
      const powB = Math.max(0, sb.basePower + sb.coinPower * hb);
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

/**
 * 코인 r개로 공격할 때의 기대 데미지 (처치로 인한 중단 무시).
 * i번째 타격 위력 = max(0, 기본 + 코인 위력 * (처음 i개 코인 중 앞면 수)). 앞면 수는 이항분포를 따른다.
 * 위력이 0에서 잘리는 경우(마이너스 코인)까지 정확히 계산하려고 앞면 수별 확률을 모두 더한다.
 */
export function expectedAttackDamage(skill: SkillStats, r: number, headsProb: number): number {
  let total = 0;
  for (let i = 1; i <= r; i++) {
    const pmf = binomialPmf(i, headsProb);
    for (let heads = 0; heads <= i; heads++) {
      total += pmf[heads] * Math.max(0, skill.basePower + skill.coinPower * heads);
    }
  }
  return total;
}

export interface Matchup {
  winRate: number; // 행(row) 스킬이 합에서 이길 확률
  dmgRow: number; // 행 스킬 측이 입히는 기대 데미지 (이겼을 때만 공격)
  dmgCol: number; // 열 스킬 측이 입히는 기대 데미지
  avgRemainWin: number; // 행이 이겼을 때 남는 코인 평균
}

function computeMatchupUncached(
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

// ---- 결과 캐시 ----
// 합 확률 계산(clashDistribution)은 비싸지만 입력(두 스킬의 기본/코인 위력/코인 개수 + 정신력 설정)이 같으면
// 결과도 항상 같다. 보상 선택지를 평가할 때는 스킬 하나만 바뀐 스펙을 반복해서 평가하므로
// 나머지 매치업은 거의 항상 캐시에서 나온다. (적이 보상을 고르는 시뮬레이션이 약 10배 이상 빨라짐)
const matchupCache = new Map<string, Matchup>();
const MAX_CACHE_ENTRIES = 200_000;

const statKey = (s: SkillStats) => `${s.basePower},${s.coinPower},${s.coinCount}`;

/** 결과에 영향을 주는 정신력 관련 설정. 이 값이 바뀌면 캐시를 비운다 */
interface CoinSettings {
  baseHeadsPercent: number;
  initialSanity: number;
  sanityMode: string;
  sanityOnClashWin: number;
  sanityMin: number;
  sanityMax: number;
}
let cachedSettings: CoinSettings | null = null;

function syncCacheWithSettings(): void {
  const c = cachedSettings;
  if (
    c !== null &&
    c.baseHeadsPercent === COIN.baseHeadsPercent &&
    c.initialSanity === COIN.initialSanity &&
    c.sanityMode === COIN.sanityMode &&
    c.sanityOnClashWin === COIN.sanityOnClashWin &&
    c.sanityMin === COIN.sanityMin &&
    c.sanityMax === COIN.sanityMax
  ) {
    return;
  }
  matchupCache.clear();
  cachedSettings = {
    baseHeadsPercent: COIN.baseHeadsPercent,
    initialSanity: COIN.initialSanity,
    sanityMode: COIN.sanityMode,
    sanityOnClashWin: COIN.sanityOnClashWin,
    sanityMin: COIN.sanityMin,
    sanityMax: COIN.sanityMax,
  };
}

/** 반환된 객체는 캐시와 공유되므로 수정하지 말 것 */
export function computeMatchup(
  rowTier: SkillTier,
  colTier: SkillTier,
  rowSkills: SkillSet,
  colSkills: SkillSet,
): Matchup {
  syncCacheWithSettings();
  const key = `${statKey(rowSkills[rowTier])}|${statKey(colSkills[colTier])}`;
  const cached = matchupCache.get(key);
  if (cached !== undefined) return cached;

  const result = computeMatchupUncached(rowTier, colTier, rowSkills, colSkills);
  if (matchupCache.size >= MAX_CACHE_ENTRIES) matchupCache.clear(); // 메모리 무한 증가 방지
  matchupCache.set(key, result);
  return result;
}

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

/**
 * 스킬 세트의 가치 = reference(기본: 기본 스펙) 상대로 한 턴에 얻는 기대 순이득
 * (내가 입히는 기대 데미지 - 내가 받는 기대 데미지). 합 승률 변화까지 반영된다.
 * 값이 클수록 강하다. 보상 선택지를 비교할 때 쓴다.
 */
export function skillSetValue(skills: SkillSet, reference: SkillSet = BASE_SKILLS): number {
  return turnExpectation(skills, reference).net;
}
