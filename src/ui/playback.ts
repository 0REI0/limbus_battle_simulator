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
import { COIN, DECK_COMPOSITION } from '../data/balance';

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
  /** 양측의 스킬 묶음에 아직 남은 스킬 수 (이번 턴에 뽑은 스킬은 이미 빠진 상태) */
  deck: Record<Side, Record<SkillTier, number>>;
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
const subject = (side: Side) => (side === 'player' ? '플레이어가' : '적이');
const owner = (side: Side) => (side === 'player' ? '플레이어' : '적');

export function initialView(maxHp: number, initialSanity: number = COIN.initialSanity): BattleView {
  return {
    stage: 'ready',
    turn: 0,
    hp: { player: maxHp, enemy: maxHp },
    maxHp,
    sanity: { player: initialSanity, enemy: initialSanity },
    tiers: { player: null, enemy: null },
    deck: { player: { ...DECK_COMPOSITION }, enemy: { ...DECK_COMPOSITION } },
    coinsLeft: { player: null, enemy: null },
    clash: null,
    clashWinner: null,
    attack: null,
    end: null,
  };
}

/**
 * 이번 턴에 tier를 뽑은 뒤 묶음에 남은 스킬 수.
 * 묶음이 비어 있었다면 새 묶음(DECK_COMPOSITION)에서 뽑은 것으로 본다 (battle.ts의 drawSkill과 같은 규칙).
 */
function drawFromDeck(deck: Record<SkillTier, number>, tier: SkillTier): Record<SkillTier, number> {
  const source = deck[1] + deck[2] + deck[3] === 0 ? DECK_COMPOSITION : deck;
  return { ...source, [tier]: Math.max(0, source[tier] - 1) };
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
            deck: {
              player: drawFromDeck(view.deck.player, e.playerTier),
              enemy: drawFromDeck(view.deck.enemy, e.enemyTier),
            },
            coinsLeft: { player: null, enemy: null },
            clash: null,
            clashWinner: null,
            attack: null,
          },
          `${e.turn}턴: 플레이어 ${e.playerTier}스킬, 적 ${e.enemyTier}스킬`,
          DELAY.skills,
        );
        break;

      case 'clashRound': {
        const verdict =
          e.result === 'draw' ? '무승부' : `${subject(e.result)} 우세`;
        push(
          {
            ...view,
            stage: 'clash',
            coinsLeft: { player: e.player.coinCountAfter, enemy: e.enemy.coinCountAfter },
            clash: { round: e.round, player: e.player, enemy: e.enemy, result: e.result },
          },
          `${e.round}합: 플레이어 위력 ${e.player.power}(앞면 ${e.player.heads}/${e.player.coins.length}), ` +
            `적 위력 ${e.enemy.power}(앞면 ${e.enemy.heads}/${e.enemy.coins.length}). ${verdict}`,
          DELAY.clashRound,
        );
        break;
      }

      case 'clashStalemate':
        push(
          { ...view, stage: 'stalemate' },
          `합 종료: 합 제한 초과, 무승부`,
          DELAY.stalemate,
        );
        break;

      case 'clashEnd':
        push(
          { ...view, stage: 'clashEnd', clashWinner: e.winner },
          `합 종료: ${subject(e.winner)} 승리, 남은 코인 ${e.remainingCoins}개`,
          DELAY.clashEnd,
        );
        break;

      case 'sanityChange': {
        const cause =
          e.cause === 'skillUse' ? '스킬 사용' : e.cause === 'clashWin' ? '합 승리' : '합 패배';
        push(
          { ...view, sanity: { ...view.sanity, [e.side]: e.to } },
          `${owner(e.side)} 정신력 ${e.from} → ${e.to} (${cause}, 앞면 확률 ${COIN.baseHeadsPercent + e.to}%)`,
          DELAY.sanity,
        );
        break;
      }

      case 'attack': {
        const target = opposite(e.attacker);
        const coins = e.coins.slice(0, e.hits.length);
        const base: AttackView = { attacker: e.attacker, tier: e.tier, coins, shown: 0, lastHit: null };
        push(
          { ...view, stage: 'attack', attack: base },
          `${owner(e.attacker)} ${e.tier}스킬 공격: 코인 ${coins.length}개`,
          DELAY.attackStart,
        );
        // 공격 로그는 타격이 모두 공개된 마지막 프레임에 한 줄로 남긴다.
        // 예: "데미지 : 20 (4+4+4+8) (처치)"
        const powers = e.hits.map((hit) => hit.power);
        const killed = e.hits[e.hits.length - 1]?.targetHpAfter === 0;
        const summary =
          `데미지 : ${powers.reduce((sum, p) => sum + p, 0)} (${powers.join('+')})` +
          (killed ? ' (처치)' : '');
        e.hits.forEach((hit, i) => {
          push(
            {
              ...view,
              hp: { ...view.hp, [target]: hit.targetHpAfter },
              attack: { ...base, shown: i + 1, lastHit: hit },
            },
            i === e.hits.length - 1 ? summary : null,
            DELAY.hit,
          );
        });
        break;
      }

      case 'battleEnd': {
        const log =
          e.reason === 'turnLimit'
            ? `OVER CLOCK`
            : e.winner === 'player'
              ? '전투 승리'
              : '전투 패배';
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
