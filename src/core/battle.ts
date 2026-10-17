// ============================================================
// core/battle.ts - 전투 1회 전체를 계산해 이벤트 로그로 반환
//
// 한 턴의 흐름:
//   1) 양쪽이 묶음에서 스킬을 하나씩 뽑는다
//   2) 스킬 사용 정신력: 뽑은 스킬의 sanityOnUse만큼 사용한 쪽의 정신력이 변한다 (합 직전)
//   3) 합: 양쪽 코인을 한 번에 굴려 위력 비교 → 낮은 쪽 코인 -1 (같으면 변화 없음)
//          한쪽 코인이 0이 될 때까지 반복 (정신력은 합 도중 변하지 않음)
//          MAX_CLASH_ROUNDS까지 끝나지 않으면 무승부: 공격/정신력 변동 없이 다음 턴
//   4) 합 결과 정신력: 승자는 자기 sanityOnClashWin, 패자는 자기 sanityOnClashLose만큼 변한다
//      (공격 코인을 굴리기 전에 적용)
//   5) 합에서 이긴 쪽만 공격: 남은 코인을 한 번에 굴려 타격별 데미지 계산
//   6) 상대 체력이 0이 되면 전투 종료, 아니면 다음 턴
//      MAX_TURNS_PER_BATTLE 안에 끝나지 않으면 플레이어 패배 (목표 턴 제한)
// ============================================================

import { COIN, MAX_CLASH_ROUNDS, MAX_TURNS_PER_BATTLE, maxHpForFloor } from '../data/balance';
import { clampSanity, computeHits, countHeads, finalPower, rollCoins } from './coins';
import { createDeck, drawSkill } from './skillDeck';
import type {
  AttackHit,
  BattleEvent,
  BattleResult,
  ClashSide,
  Combatant,
  Rng,
  SanityCause,
  Side,
  SkillTier,
  UnitSpec,
} from './types';

const opponent = (side: Side): Side => (side === 'player' ? 'enemy' : 'player');

/** 층 시작 시 전투용 상태 생성 (체력 최대, 정신력 초기화, 새 스킬 묶음) */
export function createCombatant(spec: UnitSpec, floor: number, rng: Rng): Combatant {
  const maxHp = maxHpForFloor(floor);
  return {
    skills: spec.skills,
    sanityRules: { ...spec.sanity },
    maxHp,
    hp: maxHp,
    sanity: COIN.initialSanity,
    deck: createDeck(rng),
  };
}

/**
 * 전투를 끝까지 계산한다. 입력 상태는 변경하지 않는다.
 * 플레이어가 먼저 스킬을 뽑고 코인도 먼저 굴린다 (난수 소비 순서 고정 → 재현 가능).
 */
export function runBattle(playerInit: Combatant, enemyInit: Combatant, rng: Rng): BattleResult {
  const units: Record<Side, Combatant> = {
    player: { ...playerInit, deck: [...playerInit.deck] },
    enemy: { ...enemyInit, deck: [...enemyInit.deck] },
  };
  const events: BattleEvent[] = [];

  /** 정신력을 delta만큼 바꾼다 (범위 제한, 고정 모드에서는 변하지 않음). 실제로 바뀐 경우에만 이벤트를 남긴다 */
  const applySanity = (side: Side, delta: number, cause: SanityCause) => {
    if (COIN.sanityMode !== 'dynamic') return;
    const from = units[side].sanity;
    const to = clampSanity(from + delta);
    if (to === from) return;
    units[side].sanity = to;
    events.push({ type: 'sanityChange', side, from, to, cause });
  };

  for (let turn = 1; turn <= MAX_TURNS_PER_BATTLE; turn++) {
    // 1) 스킬 선택
    const tiers = {} as Record<Side, SkillTier>;
    for (const side of ['player', 'enemy'] as const) {
      const drawn = drawSkill(units[side].deck, rng);
      units[side].deck = drawn.deck;
      tiers[side] = drawn.tier;
    }
    events.push({ type: 'turnStart', turn, playerTier: tiers.player, enemyTier: tiers.enemy });

    // 2) 스킬 사용 정신력: 합이 시작되기 직전에 적용 (이 정신력으로 합의 코인을 굴린다)
    for (const side of ['player', 'enemy'] as const) {
      applySanity(side, units[side].skills[tiers[side]].sanityOnUse, 'skillUse');
    }

    // 3) 합
    const counts: Record<Side, number> = {
      player: units.player.skills[tiers.player].coinCount,
      enemy: units.enemy.skills[tiers.enemy].coinCount,
    };

    let round = 0;
    let stalemate = false;
    while (counts.player > 0 && counts.enemy > 0) {
      if (round >= MAX_CLASH_ROUNDS) {
        stalemate = true;
        break;
      }
      round++;

      const roll = (side: Side) => {
        const coins = rollCoins(counts[side], units[side].sanity, rng);
        const heads = countHeads(coins);
        const power = finalPower(units[side].skills[tiers[side]], heads);
        return { coins, heads, power };
      };
      const p = roll('player');
      const e = roll('enemy');

      const result: Side | 'draw' =
        p.power > e.power ? 'player' : p.power < e.power ? 'enemy' : 'draw';
      if (result !== 'draw') counts[opponent(result)]--;

      const side = (r: typeof p, side: Side): ClashSide => ({
        ...r,
        coinCountAfter: counts[side],
      });
      events.push({
        type: 'clashRound',
        round,
        player: side(p, 'player'),
        enemy: side(e, 'enemy'),
        result,
      });
    }

    if (stalemate) {
      // 무승부: 양측 공격 없음, 정신력 변동 없음
      events.push({ type: 'clashStalemate', rounds: round });
      continue;
    }

    const winner: Side = counts.player > 0 ? 'player' : 'enemy';
    const loser = opponent(winner);
    const remainingCoins = counts[winner];
    events.push({ type: 'clashEnd', winner, remainingCoins });

    // 4) 합 결과 정신력: 승자/패자 각자의 규칙대로 1회 (공격 코인을 굴리기 전에 적용)
    applySanity(winner, units[winner].sanityRules.sanityOnClashWin, 'clashWin');
    applySanity(loser, units[loser].sanityRules.sanityOnClashLose, 'clashLose');

    // 5) 공격 (합에서 이긴 쪽만)
    const attacker = units[winner];
    const target = units[loser];
    const skill = attacker.skills[tiers[winner]];
    const coins = rollCoins(remainingCoins, attacker.sanity, rng);

    // 상대 체력이 0이 되면 남은 타격은 생략한다 (coins에는 굴린 코인 전체가 남음)
    const hits: AttackHit[] = [];
    for (const hit of computeHits(skill, coins)) {
      target.hp = Math.max(0, target.hp - hit.power);
      hits.push({ ...hit, targetHpAfter: target.hp });
      if (target.hp === 0) break;
    }
    events.push({ type: 'attack', attacker: winner, tier: tiers[winner], coins, hits });

    // 6) 종료 판정
    if (target.hp === 0) {
      events.push({ type: 'battleEnd', winner, turns: turn, reason: 'kill' });
      return { winner, reason: 'kill', turns: turn, events };
    }
  }

  // 제한 턴 안에 처치하지 못함 → 플레이어 패배
  events.push({
    type: 'battleEnd',
    winner: 'enemy',
    turns: MAX_TURNS_PER_BATTLE,
    reason: 'turnLimit',
  });
  return { winner: 'enemy', reason: 'turnLimit', turns: MAX_TURNS_PER_BATTLE, events };
}
