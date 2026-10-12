// ============================================================
// core/types.ts - 게임 로직 전체에서 쓰는 타입 정의
// 이 폴더(core)는 React/DOM을 절대 import하지 않는다.
// ============================================================

export type Side = 'player' | 'enemy';

/** 스킬 등급: 1스킬 / 2스킬 / 3스킬 */
export type SkillTier = 1 | 2 | 3;
export const SKILL_TIERS: readonly SkillTier[] = [1, 2, 3];

// ------------------------------------------------------------
// 난수
// ------------------------------------------------------------

/** 모든 난수는 이 인터페이스를 통해 주입받는다 (Math.random 직접 호출 금지) */
export interface Rng {
  /** [0, 1) 실수 */
  next(): number;
  /** [min, max] 정수 (양끝 포함) */
  int(min: number, max: number): number;
  /** 확률 p(0~1)로 true */
  chance(p: number): boolean;
  /** 새 배열을 셔플해서 반환 (원본 유지) */
  shuffle<T>(items: readonly T[]): T[];
}

// ------------------------------------------------------------
// 스킬 / 유닛 스탯
// ------------------------------------------------------------

/** 스킬 하나의 스펙 */
export interface SkillStats {
  basePower: number; // 기본 위력
  coinPower: number; // 코인 위력
  coinCount: number; // 코인 개수
}
export type SkillStatKey = keyof SkillStats;

/** 1/2/3스킬 세트 */
export type SkillSet = Record<SkillTier, SkillStats>;

/** 유닛의 "성장하는" 스펙 (보상으로 변하는 부분) */
export interface UnitStats {
  maxHp: number;
  initialSanity: number; // 기본 0 (고정 모드에서는 이 값으로 계속 유지)
  skills: SkillSet;
}

/** 전투 중 변하는 상태 */
export interface Combatant {
  stats: UnitStats;
  hp: number;
  sanity: number; // -45 ~ +45
  /** 이번 묶음에서 아직 쓰지 않은 스킬들 (앞에서부터 꺼냄). 비면 새 묶음으로 리셋 */
  deck: SkillTier[];
}

// ------------------------------------------------------------
// 코인
// ------------------------------------------------------------

/** true = 앞면, false = 뒷면 */
export type Coins = boolean[];

// ------------------------------------------------------------
// 보상
// ------------------------------------------------------------

/** 보상 티어: 높을수록 효과 크고 등장 확률 낮음 */
export type RewardTier = 1 | 2 | 3;

export interface Reward {
  id: string; // 예: "s2-coinPower-t3"
  skillTier: SkillTier; // 어느 스킬을 강화하는가
  stat: SkillStatKey; // 무엇을 강화하는가
  amount: number; // 증가량
  rewardTier: RewardTier;
}

// ------------------------------------------------------------
// 전투 이벤트 로그
// 로직이 전투를 끝까지 계산해 이벤트 배열을 만들고, UI는 그걸 재생한다.
// ------------------------------------------------------------

/** 합 한 라운드에서 한쪽의 결과 */
export interface ClashSide {
  coins: Coins; // 이번 라운드에 굴린 코인 (앞/뒷면)
  heads: number; // 앞면 개수
  power: number; // 최종 위력
  coinCountAfter: number; // 이번 라운드 이후 남은 코인 개수
}

/** 공격 한 번(코인 1개)의 결과 */
export interface AttackHit {
  coinIndex: number; // coins 배열에서 몇 번째 코인인가
  headsSoFar: number; // 이 타격까지 누적된 앞면 수
  power: number; // 이 타격의 최종 위력 = 데미지
  targetHpAfter: number;
}

export type BattleEvent =
  | { type: 'turnStart'; turn: number; playerTier: SkillTier; enemyTier: SkillTier }
  | {
      type: 'clashRound';
      round: number;
      player: ClashSide;
      enemy: ClashSide;
      result: Side | 'draw'; // 위력이 높은 쪽 (같으면 draw, 코인 감소 없음)
    }
  | { type: 'clashEnd'; winner: Side; remainingCoins: number }
  | { type: 'sanityChange'; side: Side; from: number; to: number }
  | {
      type: 'attack';
      attacker: Side;
      tier: SkillTier;
      coins: Coins; // 한 번에 굴린 전체 코인
      hits: AttackHit[]; // UI는 이걸 하나씩 공개
    }
  | { type: 'battleEnd'; winner: Side; turns: number };

export interface BattleResult {
  winner: Side;
  turns: number;
  events: BattleEvent[];
  /** 전투 후 상태 (정신력은 층 클리어 시 초기화되므로 hp만 의미 있음) */
  player: Combatant;
  enemy: Combatant;
}
