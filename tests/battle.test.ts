import { describe, expect, it } from 'vitest';
import { createCombatant, runBattle } from '../src/core/battle';
import { createRng } from '../src/core/rng';
import type { BattleEvent } from '../src/core/types';
import {
  BASE_SKILLS,
  COIN,
  MAX_CLASH_ROUNDS,
  MAX_TURNS_PER_BATTLE,
} from '../src/data/balance';
import { fixedRng, makeCombatant, uniformSkills } from './helpers';

const types = (events: BattleEvent[]) => events.map((e) => e.type);

describe('한 턴의 흐름', () => {
  // 모든 스킬: 기본 5, 코인 위력 5, 코인 1개
  const skills = uniformSkills({ basePower: 5, coinPower: 5, coinCount: 1 });

  it('합 → 정신력 변동 → 공격 순서로 진행되고, 정신력은 공격 코인에 반영된다', () => {
    // 난수: 플레이어 코인 0.1(앞), 적 코인 0.9(뒤), 공격 코인 0.54
    // 정신력 0이면 앞면 확률 50%라 0.54는 뒷면이지만, 합 승리로 +5 → 55%이므로 앞면이어야 함
    const rng = fixedRng([0.1, 0.9, 0.54]);
    const result = runBattle(makeCombatant(skills, 100), makeCombatant(skills, 10), rng);

    expect(types(result.events)).toEqual([
      'turnStart',
      'clashRound',
      'clashEnd',
      'sanityChange',
      'attack',
      'battleEnd',
    ]);

    const round = result.events[1];
    expect(round).toMatchObject({
      type: 'clashRound',
      result: 'player',
      player: { coins: [true], power: 10, coinCountAfter: 1 },
      enemy: { coins: [false], power: 5, coinCountAfter: 0 },
    });
    expect(result.events[3]).toEqual({ type: 'sanityChange', side: 'player', from: 0, to: 5 });
    expect(result.events[4]).toMatchObject({
      type: 'attack',
      attacker: 'player',
      hits: [{ coinIndex: 0, headsSoFar: 1, power: 10, targetHpAfter: 0 }],
    });
    expect(result.winner).toBe('player');
    expect(result.turns).toBe(1);
  });

  it('위력이 같으면(무승부) 코인이 줄지 않고 합이 계속된다', () => {
    // 1라운드: 둘 다 앞면 → 무승부 / 2라운드: 플레이어 앞면, 적 뒷면
    const rng = fixedRng([0.1, 0.1, 0.1, 0.9, 0.0]);
    const result = runBattle(makeCombatant(skills, 100), makeCombatant(skills, 10), rng);
    const rounds = result.events.filter((e) => e.type === 'clashRound');

    expect(rounds.map((r) => r.result)).toEqual(['draw', 'player']);
    expect(rounds[0].player.coinCountAfter).toBe(1);
    expect(rounds[0].enemy.coinCountAfter).toBe(1);
  });
});

describe('여러 턴 진행', () => {
  // 플레이어: 위력 항상 5, 코인 3개 / 적: 위력 항상 1, 코인 1개 → 플레이어가 항상 합 승리
  const player = makeCombatant(uniformSkills({ basePower: 5, coinPower: 0, coinCount: 3 }), 100);
  const enemy = makeCombatant(uniformSkills({ basePower: 1, coinPower: 0, coinCount: 1 }), 100);
  const result = runBattle(player, enemy, fixedRng([0.5]));
  const attacks = result.events.filter((e) => e.type === 'attack');

  it('남은 코인 개수만큼 타격하고, 적 체력이 0이 되면 남은 타격은 생략한다', () => {
    expect(attacks[0].hits.map((h) => h.targetHpAfter)).toEqual([95, 90, 85]);
    // 100 / 15 → 7턴째에 처치. 마지막 턴은 체력 10에서 5 + 5로 끝나 3번째 타격 없음
    expect(result.turns).toBe(7);
    expect(attacks).toHaveLength(7);
    expect(attacks[6].hits.map((h) => h.targetHpAfter)).toEqual([5, 0]);
    expect(attacks[6].coins).toHaveLength(3);
    expect(result.winner).toBe('player');
  });

  it('합에서 진 쪽은 공격하지 않는다', () => {
    expect(attacks.every((a) => a.attacker === 'player')).toBe(true);
  });

  it('스킬은 묶음 순서대로 쓰고, 다 쓰면 새 묶음으로 리셋된다', () => {
    const tiers = result.events
      .filter((e) => e.type === 'turnStart')
      .map((e) => e.playerTier);
    expect(tiers).toEqual([1, 1, 1, 2, 2, 3, 1]);
  });

  it('입력으로 넘긴 상태를 변경하지 않는다', () => {
    expect(player.hp).toBe(100);
    expect(enemy.hp).toBe(100);
    expect(player.deck).toEqual([1, 1, 1, 2, 2, 3]);
    expect(player.sanity).toBe(0);
  });
});

describe('실제 스펙으로 여러 판 돌리기', () => {
  const play = (seed: number) => {
    const rng = createRng(seed);
    const player = createCombatant(BASE_SKILLS, 1, rng);
    const enemy = createCombatant(BASE_SKILLS, 1, rng);
    return runBattle(player, enemy, rng);
  };

  it('같은 시드면 같은 전투가 재현된다', () => {
    expect(play(2024)).toEqual(play(2024));
  });

  it('모든 전투가 정상 종료되고 불변 조건을 지킨다', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { events, winner, turns, reason } = play(seed);

      const last = events[events.length - 1];
      expect(last).toEqual({ type: 'battleEnd', winner, turns, reason });
      expect(events.filter((e) => e.type === 'battleEnd')).toHaveLength(1);

      let clashWinner: string | null = null;
      let remaining = 0;
      for (const e of events) {
        if (e.type === 'turnStart') clashWinner = null;
        if (e.type === 'clashEnd') {
          clashWinner = e.winner;
          remaining = e.remainingCoins;
        }
        if (e.type === 'attack') {
          // 합 승자만 공격하고, 코인 개수 = 합에서 남은 코인 개수
          expect(e.attacker).toBe(clashWinner);
          expect(e.coins).toHaveLength(remaining);
          expect(e.hits.length).toBeGreaterThan(0);
        }
        if (e.type === 'sanityChange') {
          expect(e.to).toBeGreaterThanOrEqual(COIN.sanityMin);
          expect(e.to).toBeLessThanOrEqual(COIN.sanityMax);
        }
      }
    }
  });

  it('정신력 고정 모드에서는 정신력 변동 이벤트가 없다', () => {
    const original = COIN.sanityMode;
    COIN.sanityMode = 'fixed';
    try {
      const { events } = play(1);
      expect(events.some((e) => e.type === 'sanityChange')).toBe(false);
    } finally {
      COIN.sanityMode = original;
    }
  });
});

describe('전투 제한', () => {
  const draw = { basePower: 5, coinPower: 0, coinCount: 1 }; // 항상 같은 위력 → 영원히 무승부

  it('제한 상수는 100이다', () => {
    expect(MAX_CLASH_ROUNDS).toBe(100);
    expect(MAX_TURNS_PER_BATTLE).toBe(100);
  });

  it('합이 끝나지 않으면 무승부: 공격도 정신력 변동도 없이 다음 턴으로 넘어간다', () => {
    // 1턴: 1스킬끼리 위력 동일 → 무승부 / 2턴: 플레이어 2스킬(9) > 적(5) → 승리 후 처치
    const player = makeCombatant(
      { 1: draw, 2: { ...draw, basePower: 9 }, 3: { ...draw, basePower: 9 } },
      100,
      [1, 2, 3, 1, 2, 3],
    );
    const enemy = makeCombatant(uniformSkills(draw), 9);
    const result = runBattle(player, enemy, fixedRng([0.5]));

    const firstTurnEnd = result.events.findIndex((e, i) => i > 0 && e.type === 'turnStart');
    const turn1 = result.events.slice(0, firstTurnEnd);
    expect(turn1.filter((e) => e.type === 'clashRound')).toHaveLength(MAX_CLASH_ROUNDS);
    expect(turn1[turn1.length - 1]).toEqual({ type: 'clashStalemate', rounds: MAX_CLASH_ROUNDS });
    expect(turn1.some((e) => e.type === 'attack' || e.type === 'sanityChange')).toBe(false);

    expect(result.turns).toBe(2);
    expect(result.winner).toBe('player');
    expect(result.reason).toBe('kill');
    expect(result.events.filter((e) => e.type === 'attack')).toHaveLength(1);
  });

  it('합이 계속 무승부면 제한 턴 후 플레이어 패배', () => {
    const result = runBattle(
      makeCombatant(uniformSkills(draw), 100),
      makeCombatant(uniformSkills(draw), 100),
      fixedRng([0.5]),
    );
    expect(result.winner).toBe('enemy');
    expect(result.reason).toBe('turnLimit');
    expect(result.turns).toBe(MAX_TURNS_PER_BATTLE);
    expect(result.events.filter((e) => e.type === 'clashStalemate')).toHaveLength(
      MAX_TURNS_PER_BATTLE,
    );
    expect(result.events.some((e) => e.type === 'attack')).toBe(false);
    expect(result.events[result.events.length - 1]).toEqual({
      type: 'battleEnd',
      winner: 'enemy',
      turns: MAX_TURNS_PER_BATTLE,
      reason: 'turnLimit',
    });
  });

  // 플레이어는 매 턴 합에서 이기지만 턴당 1데미지만 줌
  const slowPlayer = () =>
    makeCombatant(uniformSkills({ basePower: 1, coinPower: 0, coinCount: 1 }), 100);
  const zeroEnemy = (hp: number) =>
    makeCombatant(uniformSkills({ basePower: 0, coinPower: 0, coinCount: 1 }), hp);

  it('제한 턴의 마지막 턴에 처치하면 승리한다', () => {
    const result = runBattle(slowPlayer(), zeroEnemy(MAX_TURNS_PER_BATTLE), fixedRng([0.5]));
    expect(result.winner).toBe('player');
    expect(result.reason).toBe('kill');
    expect(result.turns).toBe(MAX_TURNS_PER_BATTLE);
  });

  it('제한 턴 안에 처치하지 못하면 합에서 계속 이겨도 패배한다', () => {
    const result = runBattle(slowPlayer(), zeroEnemy(MAX_TURNS_PER_BATTLE + 1), fixedRng([0.5]));
    expect(result.winner).toBe('enemy');
    expect(result.reason).toBe('turnLimit');
    expect(result.events.filter((e) => e.type === 'attack')).toHaveLength(MAX_TURNS_PER_BATTLE);
  });
});