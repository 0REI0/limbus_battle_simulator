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
// 스킬 스펙 (보상으로 성장하는 유일한 값)
// ------------------------------------------------------------

/** 스킬 하나의 스펙 */
export interface SkillStats {
  basePower: number; // 기본 위력
  coinPower: number; // 코인 위력 (음수 가능: 마이너스 코인)
  coinCount: number; // 코인 개수
  /**
   * 이 스킬을 사용할 때 사용한 쪽의 정신력이 변하는 양 (음수 가능).
   * 스킬이 정해진 직후, 합이 시작되기 직전에 적용된다.
   */
  sanityOnUse: number;
}
export type SkillStatKey = keyof SkillStats;

/** 1/2/3스킬 세트 */
export type SkillSet = Record<SkillTier, SkillStats>;

/**
 * 플레이어/적 "본체"에 적용되는 정신력 증감 규칙. 스킬과 무관하게 합의 결과에 따라 적용된다.
 * (스킬을 쓸 때의 증감은 스킬 스탯 sanityOnUse)
 */
export interface SanityRules {
  /** 합에서 이겼을 때 정신력 변화량 */
  sanityOnClashWin: number;
  /** 합에서 졌을 때 정신력 변화량 */
  sanityOnClashLose: number;
}
export type SanityRuleKey = keyof SanityRules;

/** 플레이어/적의 "성장하는 스펙" 전체: 스킬 + 정신력 규칙. 보상은 이것을 바꾼다. */
export interface UnitSpec {
  skills: SkillSet;
  sanity: SanityRules;
}

// ------------------------------------------------------------
// 전투 상태
// 최대 체력은 층수로만 결정되고, 체력/정신력은 층마다 초기화되므로
// 전투 상태는 매 전투 시작 시 새로 만든다.
// ------------------------------------------------------------

export interface Combatant {
  skills: SkillSet;
  sanityRules: SanityRules;
  maxHp: number; // maxHpForFloor(floor)로 결정
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
export type RewardTier = 1 | 2 | 3 | 4 | 5;

/**
 * 보상 수치 식: 계수 * (그 스킬의 현재 스탯들의 곱). 소수가 나오면 반올림한다.
 *   +(코인 개수)            → { factor: 1, of: ['coinCount'] }
 *   +(코인 개수 * 코인 위력) → { factor: 1, of: ['coinCount', 'coinPower'] }
 *   -(코인 위력 * 2)         → { factor: -2, of: ['coinPower'] }
 * 한 보상 안의 모든 효과는 보상을 적용하기 "전"의 스탯으로 계산한다 (효과 순서와 무관).
 */
export interface AmountFormula {
  factor: number;
  of: readonly SkillStatKey[];
}

/** 숫자 그대로이거나, 스킬의 현재 스탯을 참조하는 식 */
export type RewardAmount = number | AmountFormula;

/** 스킬 스탯 하나를 바꾸는 효과. 수치는 음수도, 스탯 참조 식도 가능 */
export interface SkillEffect {
  skillTier: SkillTier; // 어느 스킬의
  stat: SkillStatKey; // 어느 수치를
  amount: RewardAmount; // 얼마나 바꾸는가
}

/** 플레이어/적 본체의 정신력 규칙(합 승리/패배 시 증감)을 바꾸는 효과 */
export interface SanityRuleEffect {
  rule: SanityRuleKey;
  amount: number;
}

/** 보상이 일으키는 변화 하나 */
export type RewardEffect = SkillEffect | SanityRuleEffect;

export const isSanityRuleEffect = (effect: RewardEffect): effect is SanityRuleEffect =>
  'rule' in effect;

/** 하나의 보상 = 효과 1개 이상 (예: 코인 개수 +1 과 코인 위력 -1 을 동시에) */
export interface Reward {
  id: string; // 티어와 효과 내용에서 만든 고유 문자열
  rewardTier: RewardTier;
  effects: RewardEffect[];
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

/** 정신력이 변한 원인: 스킬 사용(합 직전) / 합 승리 / 합 패배 */
export type SanityCause = 'skillUse' | 'clashWin' | 'clashLose';

/** kill: 체력이 0이 되어 종료 / turnLimit: 제한 턴 초과로 플레이어 패배 */
export type BattleEndReason = 'kill' | 'turnLimit';

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
  /** 합이 MAX_CLASH_ROUNDS까지 끝나지 않음: 무승부 처리, 양측 공격 없음, 정신력 변동 없음 */
  | { type: 'clashStalemate'; rounds: number }
  | { type: 'sanityChange'; side: Side; from: number; to: number; cause: SanityCause }
  | {
      type: 'attack';
      attacker: Side;
      tier: SkillTier;
      coins: Coins; // 한 번에 굴린 전체 코인
      hits: AttackHit[]; // UI는 이걸 하나씩 공개
    }
  | { type: 'battleEnd'; winner: Side; turns: number; reason: BattleEndReason };

/** 전투 결과. 전투 후 상태는 다음 층에서 초기화되므로 담지 않는다. */
export interface BattleResult {
  winner: Side;
  reason: BattleEndReason;
  turns: number;
  events: BattleEvent[];
}
