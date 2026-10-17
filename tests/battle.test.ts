import { describe, expect, it } from 'vitest';
import { createCombatant, runBattle } from '../src/core/battle';
import { createRng } from '../src/core/rng';
import type { BattleEvent } from '../src/core/types';
import {
  baseSpec,
  COIN,
  MAX_CLASH_ROUNDS,
  MAX_TURNS_PER_BATTLE,
} from '../src/data/balance';
import { fixedRng, makeCombatant, skillSet, uniformSkills } from './helpers';

const types = (events: BattleEvent[]) => events.map((e) => e.type);

describe('한 턴의 흐름', () => {
  // 모든 스킬: 기본 5, 코인 위력 5, 코인 1개
  const skills = uniformSkills({ basePower: 5, coinPower: 5, coinCount: 1, sanityOnUse: 0 });

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
    expect(result.events[3]).toEqual({ type: 'sanityChange', side: 'player', from: 0, to: 5, cause: 'clashWin' });
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
  const player = makeCombatant(uniformSkills({ basePower: 5, coinPower: 0, coinCount: 3, sanityOnUse: 0 }), 100);
  const enemy = makeCombatant(uniformSkills({ basePower: 1, coinPower: 0, coinCount: 1, sanityOnUse: 0 }), 100);
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
    const player = createCombatant(baseSpec(), 1, rng);
    const enemy = createCombatant(baseSpec(), 1, rng);
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
  const draw = { basePower: 5, coinPower: 0, coinCount: 1, sanityOnUse: 0 }; // 항상 같은 위력 → 영원히 무승부

  it('제한 상수는 100이다', () => {
    expect(MAX_CLASH_ROUNDS).toBe(100);
    expect(MAX_TURNS_PER_BATTLE).toBe(100);
  });

  it('합이 끝나지 않으면 무승부: 공격도 정신력 변동도 없이 다음 턴으로 넘어간다', () => {
    // 1턴: 1스킬끼리 위력 동일 → 무승부 / 2턴: 플레이어 2스킬(9) > 적(5) → 승리 후 처치
    const player = makeCombatant(
      skillSet({ 1: draw, 2: { ...draw, basePower: 9 }, 3: { ...draw, basePower: 9 } }),
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
    makeCombatant(uniformSkills({ basePower: 1, coinPower: 0, coinCount: 1, sanityOnUse: 0 }), 100);
  const zeroEnemy = (hp: number) =>
    makeCombatant(uniformSkills({ basePower: 0, coinPower: 0, coinCount: 1, sanityOnUse: 0 }), hp);

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

describe('마이너스 코인 위력', () => {
  it('위력이 0 아래로 내려가지 않아 타격이 상대를 회복시키지 않는다', () => {
    const negative = uniformSkills({ basePower: 2, coinPower: -3, coinCount: 3, sanityOnUse: 0 });
    const steady = uniformSkills({ basePower: 1, coinPower: 0, coinCount: 1, sanityOnUse: 0 });
    for (let seed = 1; seed <= 60; seed++) {
      const result = runBattle(
        makeCombatant(negative, 60),
        makeCombatant(steady, 60),
        createRng(seed),
      );
      let hp = { player: 60, enemy: 60 };
      for (const e of result.events) {
        if (e.type === 'clashRound') {
          expect(e.player.power).toBeGreaterThanOrEqual(0);
          expect(e.enemy.power).toBeGreaterThanOrEqual(0);
        }
        if (e.type === 'attack') {
          const target = e.attacker === 'player' ? 'enemy' : 'player';
          for (const hit of e.hits) {
            expect(hit.power).toBeGreaterThanOrEqual(0);
            expect(hit.targetHpAfter).toBeLessThanOrEqual(hp[target]); // 체력이 늘어나지 않는다
            hp = { ...hp, [target]: hit.targetHpAfter };
          }
        }
      }
    }
  });
});

describe('정신력 규칙: 스킬 사용 시 정신력과 합 승리/패배 시 정신력', () => {
  // 위력이 고정(코인 위력 0)이라 합 결과가 항상 같다: 플레이어(5)가 적(1)을 이긴다
  const winner = (sanityOnUse = 0) => uniformSkills({ basePower: 5, coinPower: 0, coinCount: 1, sanityOnUse });
  const loser = (sanityOnUse = 0) => uniformSkills({ basePower: 1, coinPower: 0, coinCount: 1, sanityOnUse });
  const sanityEvents = (events: BattleEvent[]) =>
    events.flatMap((e) => (e.type === 'sanityChange' ? [[e.side, e.cause, e.from, e.to] as const] : []));

  it('스킬 사용 정신력은 합이 시작되기 직전에, 합 결과 정신력은 공격 직전에 적용된다 (이벤트 순서)', () => {
    const result = runBattle(
      makeCombatant(winner(7), 100), // 플레이어: 사용 시 +7
      makeCombatant(loser(-4), 5, undefined, { sanityOnClashLose: -3 }), // 적: 사용 시 -4, 합 패배 시 -3 (체력 5라 첫 공격에 처치)
      fixedRng([0.5]),
    );
    expect(types(result.events)).toEqual([
      'turnStart',
      'sanityChange', // 플레이어 스킬 사용 +7
      'sanityChange', // 적 스킬 사용 -4
      'clashRound',
      'clashEnd',
      'sanityChange', // 플레이어 합 승리 +5 (기본 규칙)
      'sanityChange', // 적 합 패배 -3
      'attack',
      'battleEnd',
    ]);
    expect(sanityEvents(result.events)).toEqual([
      ['player', 'skillUse', 0, 7],
      ['enemy', 'skillUse', 0, -4],
      ['player', 'clashWin', 7, 12],
      ['enemy', 'clashLose', -4, -7],
    ]);
  });

  it('변화량이 0이면 이벤트를 남기지 않는다', () => {
    const result = runBattle(
      makeCombatant(winner(0), 100, undefined, { sanityOnClashWin: 0, sanityOnClashLose: 0 }),
      makeCombatant(loser(0), 5, undefined, { sanityOnClashWin: 0, sanityOnClashLose: 0 }),
      fixedRng([0.5]),
    );
    expect(result.events.some((e) => e.type === 'sanityChange')).toBe(false);
  });

  it('합의 코인은 스킬 사용 정신력이 적용된 뒤의 앞면 확률로 굴리고, 공격 코인은 합 승리 정신력까지 적용된 확률로 굴린다', () => {
    // 양쪽 모두 기본 0, 코인 위력 10, 코인 1개. 난수 순서: 플레이어 합 코인, 적 합 코인, 공격 코인
    const coin = (sanityOnUse: number) => uniformSkills({ basePower: 0, coinPower: 10, coinCount: 1, sanityOnUse });
    const rng = fixedRng([0.65, 0.65, 0.74]);
    const result = runBattle(
      makeCombatant(coin(20), 100), // 플레이어: 사용 시 +20 → 앞면 확률 70% / 합 승리 +5 → 공격 앞면 확률 75%
      makeCombatant(coin(0), 10), // 적: 앞면 확률 50% (체력 10이라 위력 10 한 번에 처치)
      rng,
    );

    // 합: 0.65는 70%에서는 앞면, 50%에서는 뒷면 → 플레이어 위력 10, 적 위력 0
    const round = result.events.find((e) => e.type === 'clashRound');
    expect(round).toMatchObject({
      result: 'player',
      player: { coins: [true], power: 10 },
      enemy: { coins: [false], power: 0 },
    });
    // 공격: 0.74는 75%에서만 앞면. 스킬 사용(+20)만, 또는 합 승리(+5)만 적용됐다면 뒷면이라 위력 0이었을 것
    const attack = result.events.find((e) => e.type === 'attack');
    expect(attack).toMatchObject({ attacker: 'player', coins: [true], hits: [{ power: 10, targetHpAfter: 0 }] });
    expect(result.winner).toBe('player');
  });

  it('정신력은 -45 ~ +45로 제한된다', () => {
    const up = runBattle(makeCombatant(winner(999), 100), makeCombatant(loser(), 5), fixedRng([0.5]));
    expect(sanityEvents(up.events)[0]).toEqual(['player', 'skillUse', 0, COIN.sanityMax]);

    const down = runBattle(makeCombatant(winner(-999), 100), makeCombatant(loser(), 5), fixedRng([0.5]));
    expect(sanityEvents(down.events)[0]).toEqual(['player', 'skillUse', 0, COIN.sanityMin]);

    // 이미 상한이면 더 올라가지 않으므로 합 승리 정신력 이벤트도 없다
    expect(sanityEvents(up.events).some(([, cause]) => cause === 'clashWin')).toBe(false);

    // 합 패배 정신력도 범위 제한
    const crushed = runBattle(
      makeCombatant(winner(), 100),
      makeCombatant(loser(), 5, undefined, { sanityOnClashLose: -999 }),
      fixedRng([0.5]),
    );
    expect(sanityEvents(crushed.events)).toContainEqual(['enemy', 'clashLose', 0, COIN.sanityMin]);
  });

  it('정신력은 턴을 넘어 누적된다', () => {
    // 매 턴 플레이어가 이기며 10 피해: 체력 25면 3턴째에 처치. 스킬 사용 +3, 합 승리 +5
    const result = runBattle(
      makeCombatant(uniformSkills({ basePower: 10, coinPower: 0, coinCount: 1, sanityOnUse: 3 }), 100),
      makeCombatant(loser(), 25),
      fixedRng([0.5]),
    );
    expect(result.turns).toBe(3);
    expect(sanityEvents(result.events).map(([, , , to]) => to)).toEqual([3, 8, 11, 16, 19, 24]);
  });

  it('합 승리/패배 정신력은 이긴 쪽/진 쪽 각자의 규칙을 쓴다 (상대의 규칙이 아니다)', () => {
    // 이번에는 적이 이긴다. 플레이어 규칙: 승리 +10, 패배 -7 / 적 규칙: 승리 +2, 패배 0
    const result = runBattle(
      makeCombatant(loser(), 5, undefined, { sanityOnClashWin: 10, sanityOnClashLose: -7 }), // 체력 5: 적의 공격 5에 처치
      makeCombatant(winner(), 100, undefined, { sanityOnClashWin: 2, sanityOnClashLose: 0 }),
      fixedRng([0.5]),
    );
    expect(result.winner).toBe('enemy');
    expect(sanityEvents(result.events)).toEqual([
      ['enemy', 'clashWin', 0, 2], // 이긴 적은 자기 승리 규칙(+2)
      ['player', 'clashLose', 0, -7], // 진 플레이어는 자기 패배 규칙(-7). 플레이어의 승리 규칙(+10)은 쓰이지 않는다
    ]);
  });

  it('정신력 고정 모드에서는 스킬 사용/합 결과 어느 쪽도 정신력이 변하지 않는다', () => {
    const original = COIN.sanityMode;
    COIN.sanityMode = 'fixed';
    try {
      const result = runBattle(
        makeCombatant(winner(30), 100, undefined, { sanityOnClashWin: 20 }),
        makeCombatant(loser(-30), 5, undefined, { sanityOnClashLose: -20 }),
        fixedRng([0.5]),
      );
      expect(result.events.some((e) => e.type === 'sanityChange')).toBe(false);
      expect(result.winner).toBe('player');
    } finally {
      COIN.sanityMode = original;
    }
  });

  it('입력으로 넘긴 전투 상태와 규칙 객체를 변경하지 않는다', () => {
    const player = makeCombatant(winner(7), 5);
    const enemy = makeCombatant(loser(), 100);
    const snapshot = JSON.stringify([player, enemy]);
    runBattle(player, enemy, fixedRng([0.5]));
    expect(JSON.stringify([player, enemy])).toBe(snapshot);
  });

  it('실제 스펙에 정신력 규칙을 섞어 300판을 돌려도 불변 조건을 지킨다', () => {
    const skills = skillSet({
      1: { basePower: 4, coinPower: 7, coinCount: 1, sanityOnUse: 3 },
      2: { basePower: 4, coinPower: 5, coinCount: 2, sanityOnUse: -2 },
      3: { basePower: 4, coinPower: 3, coinCount: 3, sanityOnUse: 8 },
    });
    for (let seed = 1; seed <= 300; seed++) {
      const rng = createRng(seed);
      const mkSpec = (win: number, lose: number) => ({ skills, sanity: { sanityOnClashWin: win, sanityOnClashLose: lose } });
      const player = createCombatant(mkSpec(6, -2), 1, rng);
      const enemy = createCombatant(mkSpec(-3, 4), 1, rng);
      const { events } = runBattle(player, enemy, rng);

      const sanity = { player: 0, enemy: 0 };
      let phase: 'turn' | 'afterSkillUse' | 'clash' | 'afterClash' = 'turn';
      for (const e of events) {
        if (e.type === 'turnStart') phase = 'turn';
        if (e.type === 'clashRound') phase = 'clash';
        if (e.type === 'clashEnd') phase = 'afterClash';

        if (e.type === 'sanityChange') {
          expect(e.from).toBe(sanity[e.side]); // 이벤트가 정신력 변화를 빠짐없이 따라간다
          expect(e.to).toBeGreaterThanOrEqual(COIN.sanityMin);
          expect(e.to).toBeLessThanOrEqual(COIN.sanityMax);
          expect(e.to).not.toBe(e.from);
          sanity[e.side] = e.to;
          // 스킬 사용 정신력은 합이 시작되기 전(턴 시작 직후), 합 결과 정신력은 합이 끝난 뒤에만 나온다
          if (e.cause === 'skillUse') expect(phase).toBe('turn');
          else expect(phase).toBe('afterClash');
        }
      }
    }
  });
});
