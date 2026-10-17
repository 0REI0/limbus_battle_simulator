import { afterEach, describe, expect, it } from 'vitest';
import { applyReward } from '../src/core/rewards';
import { advanceFloor, chooseReward, floorsCleared, startRun, type RunState } from '../src/core/run';
import type { RewardEffect } from '../src/core/types';
import { ENEMY, REWARD_TABLE, REWARD_TIERS, REWARDS, base, baseSpec, lose, power, ref, scale, onUse, win } from '../src/data/balance';

/** 항상 첫 번째 선택지를 고르며 게임 오버까지 진행 */
function playToEnd(seed: number, maxSteps = 5000): RunState {
  let state = startRun(seed);
  for (let i = 0; i < maxSteps; i++) {
    if (state.phase === 'gameOver') return state;
    state =
      state.phase === 'reward'
        ? chooseReward(state, state.choices[0].id)
        : advanceFloor(state);
  }
  throw new Error('게임이 끝나지 않음');
}

describe('startRun', () => {
  it('1층 보상 선택 단계로 시작한다', () => {
    const s = startRun(1);
    expect(s.floor).toBe(1);
    expect(s.phase).toBe('reward');
    expect(s.player).toEqual(baseSpec());
    expect(s.picksLeft).toBe(REWARDS.picksPerFloor);
    expect(s.choices).toHaveLength(REWARDS.choicesPerPick);
    expect(s.battle).toBeNull();
    // 적 스펙은 층이 시작될 때 이미 정해져 있다 (1층 적은 보상 1개를 받은 상태)
    expect(s.enemy).not.toEqual(baseSpec());
  });

  it('같은 시드면 같은 선택지가 나온다', () => {
    expect(startRun(42)).toEqual(startRun(42));
  });
});

describe('적 스펙의 공개 시점', () => {
  it('보상을 고르기 전에 이미 정해져 있고, 어떤 보상을 골라도 같은 적이 나온다', () => {
    const s0 = startRun(5);
    for (const choice of s0.choices) {
      const afterPick = chooseReward(s0, choice.id);
      expect(afterPick.enemy).toEqual(s0.enemy);
    }
  });

  it('같은 시드면 같은 적이고, 다음 층으로 넘어갈 때도 보상 선택 전에 정해진다', () => {
    expect(startRun(9).enemy).toEqual(startRun(9).enemy);

    const fought = chooseReward(startRun(9), startRun(9).choices[0].id);
    const won: RunState = { ...fought, battle: { ...fought.battle!, winner: 'player' } };
    const next = advanceFloor(won);
    expect(next.phase).toBe('reward'); // 아직 보상을 고르기 전
    expect(next.enemy).not.toEqual(baseSpec());
    // 보상을 고른 뒤에도 그대로
    expect(chooseReward(next, next.choices[0].id).enemy).toEqual(next.enemy);
  });
});

describe('chooseReward', () => {
  it('마지막 선택이면 보상을 적용하고 적 생성 + 전투까지 진행한다', () => {
    const s0 = startRun(1);
    const picked = s0.choices[0];
    const s1 = chooseReward(s0, picked.id);

    expect(s1.phase).toBe('battle');
    expect(s1.history).toEqual([picked]);
    expect(s1.player).toEqual(applyReward(baseSpec(), picked));
    expect(s1.enemy).toEqual(s0.enemy); // 플레이어의 선택과 상관없이 같은 적
    expect(s1.battle).not.toBeNull();
    expect(s1.battle!.events.length).toBeGreaterThan(0);
    expect(s1.choices).toEqual([]);

    // 입력 상태는 변하지 않는다
    expect(s0.phase).toBe('reward');
    expect(s0.player).toEqual(baseSpec());
  });

  it('없는 보상 id나 잘못된 단계에서는 상태가 그대로다 (no-op)', () => {
    const s0 = startRun(1);
    expect(chooseReward(s0, 'nope')).toBe(s0);

    const s1 = chooseReward(s0, s0.choices[0].id);
    expect(chooseReward(s1, s0.choices[0].id)).toBe(s1); // 더블클릭 상황
  });

  it('보상 선택이 여러 번이면 마지막 선택 전까지는 새 선택지를 제시한다', () => {
    const original = REWARDS.picksPerFloor;
    REWARDS.picksPerFloor = 3;
    try {
      let s = startRun(7);
      expect(s.picksLeft).toBe(3);

      s = chooseReward(s, s.choices[0].id);
      expect(s.phase).toBe('reward');
      expect(s.picksLeft).toBe(2);
      expect(s.choices).toHaveLength(REWARDS.choicesPerPick);

      s = chooseReward(s, s.choices[0].id);
      expect(s.phase).toBe('reward');
      expect(s.picksLeft).toBe(1);

      s = chooseReward(s, s.choices[0].id);
      expect(s.phase).toBe('battle');
      expect(s.history).toHaveLength(3);
      // 1층: 적도 1 * 3 = 3번의 랜덤 보상을 받아 기본 스펙과 달라진다
      expect(s.enemy).not.toEqual(baseSpec());
    } finally {
      REWARDS.picksPerFloor = original;
    }
  });
});

describe('advanceFloor', () => {
  const fought = () => chooseReward(startRun(1), startRun(1).choices[0].id);

  it('승리하면 다음 층 보상 선택으로 넘어간다', () => {
    const won: RunState = { ...fought(), battle: { ...fought().battle!, winner: 'player' } };
    const next = advanceFloor(won);

    expect(next.floor).toBe(2);
    expect(next.phase).toBe('reward');
    expect(next.picksLeft).toBe(REWARDS.picksPerFloor);
    expect(next.choices).toHaveLength(REWARDS.choicesPerPick);
    expect(next.battle).toBeNull();
    expect(next.enemy).not.toEqual(won.enemy); // 새 층의 새 적
    expect(next.player).toEqual(won.player); // 강화는 유지
    expect(next.history).toEqual(won.history);
  });

  it('패배하면 게임 오버가 되고 층과 전투 결과는 유지된다', () => {
    const lost: RunState = { ...fought(), battle: { ...fought().battle!, winner: 'enemy' } };
    const over = advanceFloor(lost);

    expect(over.phase).toBe('gameOver');
    expect(over.floor).toBe(1);
    expect(over.battle).not.toBeNull();
    expect(advanceFloor(over)).toBe(over); // 게임 오버 이후에는 진행 안 됨
  });

  it('보상 선택 단계에서는 상태가 그대로다 (no-op)', () => {
    const s = startRun(1);
    expect(advanceFloor(s)).toBe(s);
  });
});

describe('floorsCleared', () => {
  it('단계별로 클리어한 층 수를 센다', () => {
    const s0 = startRun(1);
    expect(floorsCleared(s0)).toBe(0);

    const fought = chooseReward(s0, s0.choices[0].id);
    const won: RunState = { ...fought, battle: { ...fought.battle!, winner: 'player' } };
    expect(floorsCleared(won)).toBe(1);
    expect(floorsCleared(advanceFloor(won))).toBe(1);

    const lost: RunState = { ...fought, battle: { ...fought.battle!, winner: 'enemy' } };
    expect(floorsCleared(lost)).toBe(0);
    expect(floorsCleared(advanceFloor(lost))).toBe(0);
  });
});

describe('한 판 전체', () => {
  it('같은 시드와 같은 선택이면 같은 결과가 나온다', () => {
    expect(playToEnd(2024)).toEqual(playToEnd(2024));
  });

  it('여러 시드에서 모두 게임 오버까지 정상 진행된다', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const end = playToEnd(seed);
      expect(end.phase).toBe('gameOver');
      expect(end.battle!.winner).toBe('enemy');
      expect(end.history).toHaveLength(end.floor * REWARDS.picksPerFloor);
    }
  });

  it('같은 상태에서 같은 함수를 두 번 호출해도 결과가 같다 (React StrictMode 대비)', () => {
    const s = startRun(5);
    expect(chooseReward(s, s.choices[1].id)).toEqual(chooseReward(s, s.choices[1].id));
  });

  it("적이 선택지를 고르는 'rank' 모드에서도 한 판이 끝까지 진행되고 재현된다", () => {
    const original = { ...ENEMY };
    ENEMY.pickMode = 'rank';
    ENEMY.rankWeights = [60, 30, 10];
    try {
      for (let seed = 1; seed <= 20; seed++) {
        const end = playToEnd(seed);
        expect(end.phase).toBe('gameOver');
        expect(end.battle!.winner).toBe('enemy');
      }
      expect(playToEnd(77)).toEqual(playToEnd(77));
    } finally {
      Object.assign(ENEMY, original);
    }
  });
});

describe('정신력 보상이 있는 판', () => {
  const original = { ...REWARD_TABLE };
  afterEach(() => {
    for (const tier of REWARD_TIERS) REWARD_TABLE[tier] = original[tier];
  });

  /** 1티어에 지정한 보상들만 두고 나머지 티어는 비운다 */
  const useTable = (...entries: RewardEffect[][]) => {
    for (const tier of REWARD_TIERS) REWARD_TABLE[tier] = [];
    REWARD_TABLE[1] = entries;
  };

  it('보상으로 바꾼 합 승리 정신력 규칙은 플레이어에게만 적용되고, 전투에서 실제로 쓰인다', () => {
    useTable([win(3)]);
    let verified = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s0 = startRun(seed);
      const s1 = chooseReward(s0, s0.choices[0].id);
      expect(s1.player.sanity.sanityOnClashWin).toBe(baseSpec().sanity.sanityOnClashWin + 3);
      expect(s1.enemy).toEqual(s0.enemy); // 적은 플레이어의 선택과 무관

      // 플레이어의 첫 합 승리: 이전에 정신력 변화가 없었으므로 0 → 8 (= 기본 +5, 보상 +3)
      const firstWin = s1.battle!.events.find(
        (e) => e.type === 'sanityChange' && e.side === 'player' && e.cause === 'clashWin',
      );
      if (firstWin?.type === 'sanityChange') {
        expect([firstWin.from, firstWin.to]).toEqual([0, 8]);
        verified++;
      }
    }
    expect(verified).toBeGreaterThan(10); // 이 검증이 실제로 충분히 실행되었다
  });

  it('사용 시 정신력 보상은 그 스킬을 쓴 턴에만, 합 직전에 적용된다', () => {
    useTable([onUse(2, 3)]);
    let skillUseEvents = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s0 = startRun(seed);
      const s1 = chooseReward(s0, s0.choices[0].id);
      expect(s1.player.skills[2].sanityOnUse).toBe(3);
      expect(s1.player.skills[1].sanityOnUse).toBe(0);

      let playerTier = 0;
      for (const e of s1.battle!.events) {
        if (e.type === 'turnStart') playerTier = e.playerTier;
        if (e.type === 'sanityChange' && e.side === 'player' && e.cause === 'skillUse') {
          expect(playerTier).toBe(2); // 2스킬을 쓴 턴에만
          expect(e.to).toBe(Math.min(45, e.from + 3));
          skillUseEvents++;
        }
      }
    }
    expect(skillUseEvents).toBeGreaterThan(20);
  });

  it('정신력 규칙 보상은 층을 넘어 누적되고, 전투 정신력은 층마다 0에서 다시 시작한다', () => {
    useTable([win(3)]);
    for (let seed = 1; seed <= 60; seed++) {
      let state = chooseReward(startRun(seed), startRun(seed).choices[0].id);
      if (state.battle!.winner !== 'player') continue;

      state = advanceFloor(state); // 2층 보상 선택
      expect(state.player.sanity.sanityOnClashWin).toBe(8);
      state = chooseReward(state, state.choices[0].id);
      expect(state.player.sanity.sanityOnClashWin).toBe(11);

      // 2층 전투의 첫 정신력 변화는 항상 0에서 시작 (전 층의 정신력이 이어지지 않는다)
      const firstChange = state.battle!.events.find((e) => e.type === 'sanityChange');
      if (firstChange?.type === 'sanityChange') expect(firstChange.from).toBe(0);
      return;
    }
    throw new Error('1층을 이기는 판을 찾지 못함');
  });

  it('스탯 참조 식과 정신력 보상이 섞여도 한 판이 끝까지 진행되고 같은 시드면 같은 결과다', () => {
    useTable(
      [base(1, ref('coinCount')), power(1, -1)],
      [onUse(2, 2), win(1)],
      [lose(-1), onUse(3, -1)],
      [base(2, ref('coinCount', 'coinPower')), power(2, scale(-2, 'coinPower'))],
    );
    for (let seed = 1; seed <= 15; seed++) {
      const end = playToEnd(seed);
      expect(end.phase).toBe('gameOver');
      for (const tier of [1, 2, 3] as const) {
        expect(Number.isFinite(end.player.skills[tier].basePower)).toBe(true);
        expect(Number.isFinite(end.player.skills[tier].coinPower)).toBe(true);
        expect(end.player.skills[tier].coinCount).toBeGreaterThanOrEqual(1);
      }
    }
    expect(playToEnd(99)).toEqual(playToEnd(99));
  });

  it('상태는 순수 데이터라서 JSON으로 저장했다 복원해도 같은 상태다 (식 보상 포함)', () => {
    useTable([base(1, ref('coinCount')), power(1, scale(-2, 'coinPower')), win(1)]);
    let state = startRun(5);
    state = chooseReward(state, state.choices[0].id);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});
