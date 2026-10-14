// ============================================================
// ui/playback.ts - 전투 이벤트 로그를 "재생용 프레임"으로 바꾼다 (순수 함수, React 무관)
//
// core의 runBattle은 전투를 끝까지 계산해 이벤트 배열을 돌려준다.
// UI는 그걸 한 번에 보여주지 않고 프레임 단위로 재생한다.
// 프레임 = 그 시점의 화면 상태(view) + 로그 한 줄 + 다음 프레임까지 기다릴 시간(delay).
// ============================================================

import type {
  AttackHit,
  BattleEndReason,
  BattleEvent,
  ClashSide,
  Side,
  SkillTier,
} from '../core/types';
import { COIN, MAX_TURNS_PER_BATTLE } from '../data/balance';

/** ready: 전투 시작 전 / skills: 스킬 공개 / clash: 합 진행 / clashEnd: 합 결과 / stalemate: 합 무승부 / attack: 공격 / end: 종료 */
export type Stage = 'ready' | 'skills' | 'clash' | 'clashEnd' | 'stalemate' | 'attack' | 'end';

export interface ClashView {
  round: number;
  player: ClashSide;
  enemy: ClashSide;
  result: Side | 'draw';
}

export interface AttackView {
  attacker: Side;
  tier: SkillTier;
  /** 처치로 생략된 타격을 뺀, 실제로 보여줄 코인들 */
  coins: boolean[];
  /** 지금까지 공개된 코인 개수 */
  shown: number;
  lastHit: AttackHit | null;
}

export interface BattleView {
  stage: Stage;
  turn: number;
  hp: Record<Side, number>;
  maxHp: number;
  sanity: Record<Side, number>;
  /** 이번 턴에 양측이 쓰는 스킬 */
  tiers: Record<Side, SkillTier | null>;
  /** 합 도중/직후 남은 코인 개수 */
  coinsLeft: Record<Side, number | null>;
  clash: ClashView | null;
  clashWinner: Side | null;
  attack: AttackView | null;
  end: { winner: Side; reason: BattleEndReason; turns: number } | null;
}

export interface Frame {
  view: BattleView;
  log: string | null;
  /** 이 프레임을 보여주는 시간 (배속 1 기준, ms) */
  delay: number;
}

/** 프레임 종류별 표시 시간 (ms, 배속 1 기준) */
export const DELAY = {
  ready: 600,
  skills: 800,
  clashRound: 850,
  clashEnd: 700,
  sanity: 500,
  stalemate: 1100,
  attackStart: 450,
  hit: 520,
  end: 600,
} as const;

export const opposite = (side: Side): Side => (side === 'player' ? 'enemy' : 'player');
const subject = (side: Side) => (side === 'player' ? '내가' : '적이');
const owner = (side: Side) => (side === 'player' ? '내' : '적');

export function initialView(maxHp: number, initialSanity: number = COIN.initialSanity): BattleView {
  return {
    stage: 'ready',
    turn: 0,
    hp: { player: maxHp, enemy: maxHp },
    maxHp,
    sanity: { player: initialSanity, enemy: initialSanity },
    tiers: { player: null, enemy: null },
    coinsLeft: { player: null, enemy: null },
    clash: null,
    clashWinner: null,
    attack: null,
    end: null,
  };
}

/** 이벤트 배열 → 프레임 배열. 첫 프레임은 아무 일도 일어나기 전의 초기 화면이다. */
export function buildFrames(events: readonly BattleEvent[], maxHp: number): Frame[] {
  let view = initialView(maxHp);
  const frames: Frame[] = [{ view, log: null, delay: DELAY.ready }];
  const push = (next: BattleView, log: string | null, delay: number) => {
    view = next;
    frames.push({ view: next, log, delay });
  };

  for (const e of events) {
    switch (e.type) {
      case 'turnStart':
        push(
          {
            ...view,
            stage: 'skills',
            turn: e.turn,
            tiers: { player: e.playerTier, enemy: e.enemyTier },
            coinsLeft: { player: null, enemy: null },
            clash: null,
            clashWinner: null,
            attack: null,
          },
          `${e.turn}턴: 내 ${e.playerTier}스킬, 적 ${e.enemyTier}스킬`,
          DELAY.skills,
        );
        break;

      case 'clashRound': {
        const verdict =
          e.result === 'draw' ? '무승부라 코인은 그대로입니다.' : `${subject(e.result)} 우세해서 상대 코인이 1개 줄었습니다.`;
        push(
          {
            ...view,
            stage: 'clash',
            coinsLeft: { player: e.player.coinCountAfter, enemy: e.enemy.coinCountAfter },
            clash: { round: e.round, player: e.player, enemy: e.enemy, result: e.result },
          },
          `합 ${e.round}라운드: 나 위력 ${e.player.power}(앞면 ${e.player.heads}/${e.player.coins.length}), ` +
            `적 위력 ${e.enemy.power}(앞면 ${e.enemy.heads}/${e.enemy.coins.length}). ${verdict}`,
          DELAY.clashRound,
        );
        break;
      }

      case 'clashStalemate':
        push(
          { ...view, stage: 'stalemate' },
          `합이 ${e.rounds}라운드까지 끝나지 않아 무승부로 처리합니다. 이번 턴은 공격 없이 넘어갑니다.`,
          DELAY.stalemate,
        );
        break;

      case 'clashEnd':
        push(
          { ...view, stage: 'clashEnd', clashWinner: e.winner },
          `합 종료: ${subject(e.winner)} 이겼습니다. 코인 ${e.remainingCoins}개가 남았습니다.`,
          DELAY.clashEnd,
        );
        break;

      case 'sanityChange':
        push(
          { ...view, sanity: { ...view.sanity, [e.side]: e.to } },
          `${owner(e.side)} 정신력 ${e.from} → ${e.to} (앞면 확률 ${COIN.baseHeadsPercent + e.to}%)`,
          DELAY.sanity,
        );
        break;

      case 'attack': {
        const target = opposite(e.attacker);
        const coins = e.coins.slice(0, e.hits.length);
        const base: AttackView = { attacker: e.attacker, tier: e.tier, coins, shown: 0, lastHit: null };
        push(
          { ...view, stage: 'attack', attack: base },
          `${owner(e.attacker)} ${e.tier}스킬 공격: 코인 ${coins.length}개`,
          DELAY.attackStart,
        );
        e.hits.forEach((hit, i) => {
          push(
            {
              ...view,
              hp: { ...view.hp, [target]: hit.targetHpAfter },
              attack: { ...base, shown: i + 1, lastHit: hit },
            },
            `${i + 1}번째 타격: 위력 ${hit.power}${hit.targetHpAfter === 0 ? '. 쓰러뜨렸습니다.' : ''}`,
            DELAY.hit,
          );
        });
        break;
      }

      case 'battleEnd': {
        const log =
          e.reason === 'turnLimit'
            ? `제한 턴(${MAX_TURNS_PER_BATTLE}턴) 안에 처치하지 못해 패배했습니다.`
            : e.winner === 'player'
              ? '전투에서 승리했습니다.'
              : '쓰러졌습니다.';
        push(
          { ...view, stage: 'end', end: { winner: e.winner, reason: e.reason, turns: e.turns } },
          log,
          DELAY.end,
        );
        break;
      }
    }
  }
  return frames;
}
