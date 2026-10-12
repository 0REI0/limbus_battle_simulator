import { describe, expect, it } from 'vitest';
import { advanceFloor, chooseReward, floorsCleared, startRun, type RunState } from '../src/core/run';
import type { SkillSet } from '../src/core/types';
import { BASE_SKILLS, REWARDS } from '../src/data/balance';

const sumStats = (s: SkillSet) =>
  ([1, 2, 3] as const).reduce(
    (t, k) => t + s[k].basePower + s[k].coinPower + s[k].coinCount,
    0,
  );

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
    expect(s.skills).toEqual(BASE_SKILLS);
    expect(s.picksLeft).toBe(REWARDS.picksPerFloor);
    expect(s.choices).toHaveLength(REWARDS.choicesPerPick);
    expect(s.battle).toBeNull();
    expect(s.enemySkills).toBeNull();
  });

  it('같은 시드면 같은 선택지가 나온다', () => {
    expect(startRun(42)).toEqual(startRun(42));
  });
});

describe('chooseReward', () => {
  it('마지막 선택이면 보상을 적용하고 적 생성 + 전투까지 진행한다', () => {
    const s0 = startRun(1);
    const picked = s0.choices[0];
    const s1 = chooseReward(s0, picked.id);

    expect(s1.phase).toBe('battle');
    expect(s1.history).toEqual([picked]);
    expect(s1.skills[picked.skillTier][picked.stat]).toBe(
      BASE_SKILLS[picked.skillTier][picked.stat] + picked.amount,
    );
    expect(s1.enemySkills).not.toBeNull();
    expect(s1.battle).not.toBeNull();
    expect(s1.battle!.events.length).toBeGreaterThan(0);
    expect(s1.choices).toEqual([]);

    // 입력 상태는 변하지 않는다
    expect(s0.phase).toBe('reward');
    expect(s0.skills).toEqual(BASE_SKILLS);
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
      // 1층: 적도 1 * 3 = 3번의 랜덤 보상을 받음
      expect(sumStats(s.enemySkills!)).toBeGreaterThanOrEqual(sumStats(BASE_SKILLS) + 3);
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
    expect(next.enemySkills).toBeNull();
    expect(next.skills).toEqual(won.skills); // 강화는 유지
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
});
