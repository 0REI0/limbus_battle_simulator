// ============================================================
// data/balance.ts - 밸런스 수치는 전부 여기서만 관리한다.
// [문서 확정] = 기획 문서에 있는 값 / [가정] = 문서에 없어서 임시로 넣은 값
// ============================================================

import type { RewardTier, SkillSet, SkillStatKey, SkillTier } from '../core/types';

// ------------------------------------------------------------
// 기본 스펙 [문서 확정]
// ------------------------------------------------------------

export const BASE_SKILLS: SkillSet = {
  1: { basePower: 4, coinPower: 7, coinCount: 1 },
  2: { basePower: 4, coinPower: 4, coinCount: 2 },
  3: { basePower: 5, coinPower: 3, coinCount: 3 },
};

export const BASE_INITIAL_SANITY = 0;

/** 층별 최대 체력: 100 + 층수 * 10 [문서 확정] */
export const maxHpForFloor = (floor: number): number => 100 + floor * 10;

// ------------------------------------------------------------
// 스킬 묶음 [문서 확정]: 1스킬 3개, 2스킬 2개, 3스킬 1개
// ------------------------------------------------------------

export const DECK_COMPOSITION: Record<SkillTier, number> = { 1: 3, 2: 2, 3: 1 };

// ------------------------------------------------------------
// 코인 / 정신력
// ------------------------------------------------------------

export const COIN = {
  /** 앞면 확률 = BASE_HEADS_PERCENT + 정신력 (%) [문서 확정] */
  baseHeadsPercent: 50,
  sanityMin: -45, // [문서 확정]
  sanityMax: 45, // [문서 확정]
  /**
   * 'dynamic': 합 승패에 따라 정신력 변동 / 'fixed': 항상 초기값 유지
   * (문서: 밸런스에 따라 고정할 수도 있음)
   */
  sanityMode: 'dynamic' as 'dynamic' | 'fixed',
  /** [가정] 합 승리 시 +, 패배 시 - 되는 양. 합 전체 기준인지 라운드 기준인지는 미정 */
  sanityOnClashWin: 5,
  sanityOnClashLose: -5,
};

// ------------------------------------------------------------
// 보상
// ------------------------------------------------------------

/**
 * 보상 증가량 표. 배열 인덱스 0/1/2 = 보상 티어 1/2/3.
 * null = 해당 티어에서는 등장하지 않음 (문서의 x) [문서 확정]
 */
export type RewardAmountTable = Record<
  SkillTier,
  Record<SkillStatKey, readonly (number | null)[]>
>;

export const REWARD_TABLE: RewardAmountTable = {
  1: {
    basePower: [1, 2, 3],
    coinPower: [null, 1, 2],
    coinCount: [null, null, 1],
  },
  2: {
    basePower: [2, 3, 4],
    coinPower: [null, 1, 2],
    coinCount: [null, null, 1],
  },
  3: {
    basePower: [3, 4, 5],
    coinPower: [null, 1, 2],
    coinCount: [null, 1, 2],
  },
};

/** [가정] 보상 티어 등장 가중치 (높은 티어일수록 낮음). 시뮬레이션으로 조정 */
export const REWARD_TIER_WEIGHTS: Record<RewardTier, number> = {
  1: 60,
  2: 30,
  3: 10,
};

export const REWARDS = {
  /** 층 시작 시 얻는 보상 횟수 n (기본 1, 템포를 높이려면 2~3) [문서 확정] */
  picksPerFloor: 1,
  /** [가정] 한 번에 제시되는 선택지 개수 */
  choicesPerPick: 3,
};

// ------------------------------------------------------------
// 적 생성
// ------------------------------------------------------------

export const ENEMY = {
  /**
   * [가정] 적이 받는 보상 횟수 = (floor + 랜덤(-jitter ~ +jitter)) * picksPerFloor.
   * 문서의 "랜덤한 층수*n개"를 이렇게 해석함. 0이면 플레이어와 같은 횟수.
   */
  rewardCountJitter: 1,
};

// ------------------------------------------------------------
// 안전장치
// ------------------------------------------------------------

/** 무한 루프 방지: 한 전투의 최대 턴 수 (이 이상이면 비정상으로 간주) */
export const MAX_TURNS_PER_BATTLE = 500;
