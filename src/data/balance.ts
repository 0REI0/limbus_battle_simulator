// ============================================================
// data/balance.ts - 밸런스 수치는 전부 여기서만 관리한다.
// ============================================================

import type { RewardTier, SkillSet, SkillStatKey, SkillTier } from '../core/types';

// ------------------------------------------------------------
// 기본 스펙
// ------------------------------------------------------------

export const BASE_SKILLS: SkillSet = {
  1: { basePower: 4, coinPower: 7, coinCount: 1 },
  2: { basePower: 4, coinPower: 4, coinCount: 2 },
  3: { basePower: 5, coinPower: 3, coinCount: 3 },
};

/** 층별 최대 체력: 100 + 층수 * 10. 플레이어/적 공통, 보상으로 변하지 않음 */
export const maxHpForFloor = (floor: number): number => 100 + floor * 10;

// ------------------------------------------------------------
// 스킬 묶음: 1스킬 3개, 2스킬 2개, 3스킬 1개
// ------------------------------------------------------------

export const DECK_COMPOSITION: Record<SkillTier, number> = { 1: 3, 2: 2, 3: 1 };

// ------------------------------------------------------------
// 코인 / 정신력
// ------------------------------------------------------------

export const COIN = {
  /** 앞면 확률(%) = baseHeadsPercent + 정신력 */
  baseHeadsPercent: 50,
  /** 전투 시작(= 매 층 시작) 시 정신력 */
  initialSanity: 0,
  sanityMin: -45,
  sanityMax: 45,
  /**
   * 'dynamic': 합 결과에 따라 정신력 변동 / 'fixed': 항상 initialSanity 유지
   * (밸런스에 따라 고정으로 전환 가능)
   */
  sanityMode: 'dynamic' as 'dynamic' | 'fixed',
  /** 합에서 이겼을 때 정신력 변화량 */
  sanityOnClashWin: 5,
  /** 합에서 졌을 때 정신력 변화량 (현재는 변동 없음) */
  sanityOnClashLose: 0,
  // 정신력 변동 규칙: 스킬 하나의 합 전체가 끝난 시점(한쪽 코인이 0)에 승자/패자 각각 1회만 변동.
  // 합 도중 라운드에서는 변하지 않고, 변동은 공격 코인을 굴리기 전에 적용된다.
};

// ------------------------------------------------------------
// 보상
// ------------------------------------------------------------

/**
 * 보상 증가량 표. 배열 인덱스 0/1/2 = 보상 티어 1/2/3.
 * null = 해당 티어에서는 등장하지 않음
 */
export type RewardAmountTable = Record<
  SkillTier,
  Record<SkillStatKey, readonly (number | null)[]>
>;

export const REWARD_TABLE: RewardAmountTable = {
  1: {
    basePower: [1, 2, null],
    coinPower: [null, null, 1],
    coinCount: [null, null, 1],
  },
  2: {
    basePower: [2, 3, null],
    coinPower: [null, 1, 2],
    coinCount: [null, null, 1],
  },
  3: {
    basePower: [3, 4, null],
    coinPower: [null, 1, 2],
    coinCount: [null, 1, 1],
  },
};

/** 보상 티어 등장 가중치 (높은 티어일수록 낮음). 시뮬레이션으로 조정 */
export const REWARD_TIER_WEIGHTS: Record<RewardTier, number> = {
  1: 60,
  2: 30,
  3: 10,
};

export const REWARDS = {
  /** 층 시작 시 얻는 보상 횟수 n (기본 1, 템포를 높이려면 2~3) */
  picksPerFloor: 1,
  /** 한 번에 제시되는 선택지 개수 */
  choicesPerPick: 3,
};

/**
 * 층 진입 시점까지 받은 보상 횟수 (플레이어는 선택, 적은 랜덤으로 적용)
 * 플레이어는 층 시작마다 받으므로 floor 층에서는 floor * n 회.
 */
export const rewardCountForFloor = (floor: number): number =>
  floor * REWARDS.picksPerFloor;

// ------------------------------------------------------------
// 안전장치
// ------------------------------------------------------------

/** 무한 루프 방지: 한 전투의 최대 턴 수 (이 이상이면 비정상으로 간주) */
export const MAX_TURNS_PER_BATTLE = 500;
