// ============================================================
// core/run.ts - 한 판(런)의 진행 상태와 전이 함수
//
// 흐름:  startRun → [chooseReward × n] → (자동 전투) → advanceFloor → 다음 층 보상 선택 ...
//
// 모든 함수는 순수 함수다: 새 RunState를 반환하고, 입력 상태는 바꾸지 않는다.
// 잘못된 단계/입력으로 호출하면 에러 대신 같은 상태를 그대로 돌려준다 (더블클릭에도 안전).
// 난수는 상태에 저장된 seed에서 "층 + 용도"별로 파생해 만들기 때문에,
// 같은 상태에서 같은 함수를 몇 번 호출해도 결과가 같다 (React useReducer와 호환).
// ============================================================

import { BASE_SKILLS, REWARDS } from '../data/balance';
import { createCombatant, runBattle } from './battle';
import { createEnemySkills } from './enemy';
import { applyReward, generateChoices } from './rewards';
import { createRng, deriveSeed } from './rng';
import type { BattleResult, Reward, Rng, SkillSet } from './types';

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
  skills: SkillSet; // 플레이어의 현재 스킬 스펙
  history: Reward[]; // 지금까지 고른 보상 (순서대로)
  picksLeft: number; // 이번 층에서 남은 보상 선택 횟수
  choices: Reward[]; // 현재 선택지 (reward 단계에서만 값이 있음)
  enemySkills: SkillSet | null; // 이번 층 적의 스펙 (전투 후에 채워짐)
  battle: BattleResult | null; // 이번 층 전투 결과 (이벤트 로그 포함)
}

// ---- 난수 스트림: 층마다, 용도마다 독립된 난수열을 만든다 ----
// 보상 선택 n번째(0부터)는 스트림 n을 쓴다. picksPerFloor는 50 미만이어야 한다.
const STREAM_ENEMY = 50;
const STREAM_BATTLE = 60;

const rngFor = (seed: number, floor: number, stream: number): Rng =>
  createRng(deriveSeed(seed, floor * 100 + stream));

const choicesFor = (seed: number, floor: number, pickIndex: number): Reward[] =>
  generateChoices(rngFor(seed, floor, pickIndex));

/** 새 런 시작: 1층, 첫 보상 선택지가 제시된 상태 */
export function startRun(seed: number): RunState {
  return {
    seed,
    floor: 1,
    phase: 'reward',
    skills: BASE_SKILLS,
    history: [],
    picksLeft: REWARDS.picksPerFloor,
    choices: choicesFor(seed, 1, 0),
    enemySkills: null,
    battle: null,
  };
}

/** 선택지 중 하나를 고른다. 마지막 선택이면 적을 생성하고 전투까지 자동으로 진행한다. */
export function chooseReward(state: RunState, rewardId: string): RunState {
  if (state.phase !== 'reward') return state;
  const reward = state.choices.find((c) => c.id === rewardId);
  if (!reward) return state;

  const skills = applyReward(state.skills, reward);
  const history = [...state.history, reward];
  const picksLeft = state.picksLeft - 1;

  if (picksLeft > 0) {
    const pickIndex = REWARDS.picksPerFloor - picksLeft;
    return {
      ...state,
      skills,
      history,
      picksLeft,
      choices: choicesFor(state.seed, state.floor, pickIndex),
    };
  }
  return fightFloor({ ...state, skills, history, picksLeft: 0, choices: [] });
}

/** 적 생성 → 전투 진행. 체력과 정신력은 층마다 초기화되므로 이전 전투 상태는 필요 없다. */
function fightFloor(state: RunState): RunState {
  const enemySkills = createEnemySkills(state.floor, rngFor(state.seed, state.floor, STREAM_ENEMY));

  const rng = rngFor(state.seed, state.floor, STREAM_BATTLE);
  const player = createCombatant(state.skills, state.floor, rng);
  const enemy = createCombatant(enemySkills, state.floor, rng);
  const battle = runBattle(player, enemy, rng);

  return { ...state, phase: 'battle', enemySkills, battle };
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
    enemySkills: null,
    battle: null,
  };
}

/** 클리어한 층 수 (최종 기록용) */
export function floorsCleared(state: RunState): number {
  const wonCurrent = state.phase === 'battle' && state.battle?.winner === 'player';
  return wonCurrent ? state.floor : state.floor - 1;
}
