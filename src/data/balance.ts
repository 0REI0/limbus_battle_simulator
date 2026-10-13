// ============================================================
// data/balance.ts - 밸런스 수치는 전부 여기서만 관리한다.
// ============================================================

import type { RewardEffect, RewardTier, SkillSet, SkillTier } from '../core/types';

// ------------------------------------------------------------
// 기본 스펙
// ------------------------------------------------------------

export const BASE_SKILLS: SkillSet = {
  1: { basePower: 4, coinPower: 7, coinCount: 1 },
  2: { basePower: 4, coinPower: 5, coinCount: 2 },
  3: { basePower: 4, coinPower: 3, coinCount: 3 },
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
//
// 보상 티어(1~5)마다 보상 목록을 가진다. 보상 하나 = 효과(RewardEffect) 목록.
// 효과 하나 = (스킬 종류, 스탯 종류, 변동 수치). 변동 수치는 음수도 가능.
// 감소 효과로 스탯이 아래 한계(기본/코인 위력 0, 코인 개수 1)보다 내려가면 한계로 맞춘다.
// ------------------------------------------------------------

export const REWARD_TIERS: readonly RewardTier[] = [1, 2, 3, 4, 5];

// 표를 읽기 쉽게 만드는 도우미
const base = (skill: SkillTier, amount: number): RewardEffect => ({ skillTier: skill, stat: 'basePower', amount });
const power = (skill: SkillTier, amount: number): RewardEffect => ({ skillTier: skill, stat: 'coinPower', amount });
const count = (skill: SkillTier, amount: number): RewardEffect => ({ skillTier: skill, stat: 'coinCount', amount });

/**
 * 티어별 보상 목록. 보상 하나 = 효과들의 배열.
 * [초안] 보상 가치를 계산하는 도구(npm run sim:rewards)의 "net"(합 승률 변화까지 반영한 순이득)을
 * 참고해 비슷한 보상끼리 한 티어로 묶은 것이다. 기본 스펙/규칙을 바꾸면 가치가 달라지므로
 * 그때마다 도구를 다시 돌려 티어를 조정한다. 값은 기본 스펙 기준이라, 강화가 쌓이면 실제 가치는 달라진다.
 */
export const REWARD_TABLE: Record<RewardTier, RewardEffect[][]> = {
  1: [
    [power(1, 1)],
    [power(2, 1)],
    [power(3, 1)],
    [base(1, 1), power(1, -1)],
    [base(2, 1), power(2, -1)],
    [base(3, 2), power(3, -1)],
  ],
  2: [
    [base(1, 1)],
    [base(2, 1)],
    [base(3, 2)],
    [base(1, 2), power(1, -1)],
    [base(2, 2), power(2, -1)],
    [base(3, 3), power(3, -1)],
  ],
  3: [
    [power(1, 2)],
    [power(2, 2)],
    [power(3, 2)],
    [base(1, 2)],
    [base(2, 2)],
    [base(3, 3)],
  ],
  4: [
    [count(1, 1), power(1, -2)],
    [count(2, 1), power(2, -1)],
    [count(3, 1), power(3, 1)]
  ],
  5: [
    [count(1, 1), power(1, -1)],
    [count(2, 1)],
    [count(3, 1), power(3, 2)],
  ],
};

/** 보상 티어 등장 가중치 (높은 티어일수록 낮음). 시뮬레이션으로 조정 */
export const REWARD_TIER_WEIGHTS: Record<RewardTier, number> = {
  1: 35,
  2: 30,
  3: 20,
  4: 10,
  5: 5,
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
// 전투 제한
// ------------------------------------------------------------

/**
 * 목표 턴 제한: 이 턴 수 안에 적을 처치하지 못하면 플레이어 패배.
 * (정확히 이 턴에 처치하면 승리)
 */
export const MAX_TURNS_PER_BATTLE = 100;

/**
 * 한 번의 합에서 허용하는 최대 라운드 수.
 * 이 라운드까지 승부가 나지 않으면 합을 중단하고 무승부로 처리한다
 * (양측 모두 공격하지 않고, 정신력 변동도 없이 다음 턴으로 넘어감).
 */
export const MAX_CLASH_ROUNDS = 100;
