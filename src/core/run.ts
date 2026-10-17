// ============================================================
// core/run.ts - 한 판(런)의 진행 상태와 전이 함수
//
// 흐름:  startRun → [chooseReward × n] → (자동 전투) → advanceFloor → 다음 층 보상 선택 ...
// 층이 시작될 때(startRun / advanceFloor) 그 층의 적 스펙이 먼저 정해진다. 플레이어는 적을 보고 보상을 고른다.
//
// 모든 함수는 순수 함수다: 새 RunState를 반환하고, 입력 상태는 바꾸지 않는다.
// 잘못된 단계/입력으로 호출하면 에러 대신 같은 상태를 그대로 돌려준다 (더블클릭에도 안전).
// 난수는 상태에 저장된 seed에서 "층 + 용도"별로 파생해 만들기 때문에,
// 같은 상태에서 같은 함수를 몇 번 호출해도 결과가 같다 (React useReducer와 호환).
// ============================================================

import { REWARDS, baseSpec } from '../data/balance';
import { createCombatant, runBattle } from './battle';
import { createEnemySpec } from './enemy';
import { applyReward, generateChoices } from './rewards';
import { createRng, deriveSeed } from './rng';
import type { BattleResult, Reward, Rng, UnitSpec } from './types';

/**
 * reward:   보상 선택 중 (choices 중 하나를 고른다)
 * battle:   전투 완료, 결과(battle)를 보여주는 중 (advanceFloor로 진행)
 * gameOver: 전투에서 패배해 런 종료
 */
export type RunPhase = 'reward' | 'battle' | 'gameOver';

export interface RunState {
  seed: number;
  floor: number; // 현재 층 (1부터)
  phase: RunPhase;
  player: UnitSpec; // 플레이어의 현재 스펙 (스킬 + 정신력 규칙)
  history: Reward[]; // 지금까지 고른 보상 (순서대로)
  picksLeft: number; // 이번 층에서 남은 보상 선택 횟수
  choices: Reward[]; // 현재 선택지 (reward 단계에서만 값이 있음)
  enemy: UnitSpec; // 이번 층 적의 스펙 (층이 시작될 때 정해지고, 보상 선택 화면에서 미리 공개된다)
  battle: BattleResult | null; // 이번 층 전투 결과 (이벤트 로그 포함)
}

// ---- 난수 스트림: 층마다, 용도마다 독립된 난수열을 만든다 ----
// 보상 선택 n번째(0부터)는 스트림 n을 쓴다. picksPerFloor는 50 미만이어야 한다.
const STREAM_ENEMY = 50;
const STREAM_BATTLE = 60;

const rngFor = (seed: number, floor: number, stream: number): Rng =>
  createRng(deriveSeed(seed, floor * 100 + stream));

/** 그 층의 적 스펙. 시드와 층수로만 정해지므로 플레이어가 어떤 보상을 고르든 같다 */
const enemyFor = (seed: number, floor: number): UnitSpec =>
  createEnemySpec(floor, rngFor(seed, floor, STREAM_ENEMY));

const choicesFor = (seed: number, floor: number, pickIndex: number): Reward[] =>
  generateChoices(rngFor(seed, floor, pickIndex));

/** 새 런 시작: 1층, 첫 보상 선택지가 제시된 상태 */
export function startRun(seed: number): RunState {
  return {
    seed,
    floor: 1,
    phase: 'reward',
    player: baseSpec(),
    history: [],
    picksLeft: REWARDS.picksPerFloor,
    choices: choicesFor(seed, 1, 0),
    enemy: enemyFor(seed, 1),
    battle: null,
  };
}

/** 선택지 중 하나를 고른다. 마지막 선택이면 자동으로 전투까지 진행한다. */
export function chooseReward(state: RunState, rewardId: string): RunState {
  if (state.phase !== 'reward') return state;
  const reward = state.choices.find((c) => c.id === rewardId);
  if (!reward) return state;

  const player = applyReward(state.player, reward);
  const history = [...state.history, reward];
  const picksLeft = state.picksLeft - 1;

  if (picksLeft > 0) {
    const pickIndex = REWARDS.picksPerFloor - picksLeft;
    return {
      ...state,
      player,
      history,
      picksLeft,
      choices: choicesFor(state.seed, state.floor, pickIndex),
    };
  }
  return fightFloor({ ...state, player, history, picksLeft: 0, choices: [] });
}

/** 전투 진행. 적은 층이 시작될 때 이미 정해져 있다. 체력과 정신력은 층마다 초기화되므로 이전 전투 상태는 필요 없다. */
function fightFloor(state: RunState): RunState {
  const rng = rngFor(state.seed, state.floor, STREAM_BATTLE);
  const player = createCombatant(state.player, state.floor, rng);
  const enemy = createCombatant(state.enemy, state.floor, rng);
  const battle = runBattle(player, enemy, rng);

  return { ...state, phase: 'battle', battle };
}

/** 전투 결과 확인 후 진행: 승리하면 다음 층의 보상 선택, 패배하면 게임 오버 */
export function advanceFloor(state: RunState): RunState {
  if (state.phase !== 'battle' || state.battle === null) return state;

  if (state.battle.winner !== 'player') {
    return { ...state, phase: 'gameOver' };
  }

  const floor = state.floor + 1;
  return {
    ...state,
    floor,
    phase: 'reward',
    picksLeft: REWARDS.picksPerFloor,
    choices: choicesFor(state.seed, floor, 0),
    enemy: enemyFor(state.seed, floor),
    battle: null,
  };
}

/** 클리어한 층 수 (최종 기록용) */
export function floorsCleared(state: RunState): number {
  const wonCurrent = state.phase === 'battle' && state.battle?.winner === 'player';
  return wonCurrent ? state.floor : state.floor - 1;
}
