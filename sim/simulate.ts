// ============================================================
// sim/simulate.ts - 정책 하나로 여러 판을 돌리고 통계를 계산 (출력은 balance.ts)
// ============================================================

import { createRng, deriveSeed } from '../src/core/rng';
import { advanceFloor, chooseReward, floorsCleared, startRun } from '../src/core/run';
import type { Policy } from './policies';

export interface SimOptions {
  runs: number;
  seed: number;
  /** 이 층을 클리어하면 그 판을 중단 (너무 강한 정책이 무한히 가는 것 방지) */
  maxFloor: number;
}

export interface SimStats {
  policy: string;
  runs: number;
  /** 판별 클리어한 층 수 (오름차순) */
  cleared: number[];
  avgCleared: number;
  median: number;
  p90: number;
  max: number;
  /** n층 이상 클리어한 판의 비율 (0~1) */
  shareAtLeast5: number;
  shareAtLeast10: number;
  shareAtLeast20: number;
  shareAtLeast30: number;
  shareAtLeast40: number;
  shareAtLeast50: number;
  /** 전투 한 번당 평균 턴 수 */
  avgTurns: number;
  /** 제한 턴 초과로 끝난 판의 비율 */
  turnLimitRunRate: number;
  /** maxFloor에 도달해 중단된 판 수 */
  cappedRuns: number;
  /** index = 층. 해당 층에 도달한 판 수 / 그 층에서 승리한 판 수 */
  floorAttempts: number[];
  floorWins: number[];
}

const percentile = (sorted: number[], p: number) => sorted[Math.floor(p * (sorted.length - 1))];

export function simulate(policy: Policy, options: SimOptions): SimStats {
  const { runs, seed, maxFloor } = options;
  const cleared: number[] = [];
  const floorAttempts = new Array<number>(maxFloor + 2).fill(0);
  const floorWins = new Array<number>(maxFloor + 2).fill(0);
  let battles = 0;
  let totalTurns = 0;
  let turnLimitRuns = 0;
  let cappedRuns = 0;

  for (let i = 0; i < runs; i++) {
    const runSeed = deriveSeed(seed, i);
    const rng = createRng(deriveSeed(runSeed, 987654321)); // 정책용 난수 (게임 난수와 분리)
    let state = startRun(runSeed);

    while (state.phase !== 'gameOver') {
      if (state.phase === 'reward') {
        state = chooseReward(state, policy.pick(state, rng));
        continue;
      }

      // phase === 'battle': 전투 결과 기록
      const battle = state.battle!;
      const won = battle.winner === 'player';
      battles++;
      totalTurns += battle.turns;
      floorAttempts[state.floor]++;
      if (won) floorWins[state.floor]++;
      if (!won && battle.reason === 'turnLimit') turnLimitRuns++;

      if (won && state.floor >= maxFloor) {
        cappedRuns++;
        break;
      }
      state = advanceFloor(state);
    }
    cleared.push(floorsCleared(state));
  }

  cleared.sort((a, b) => a - b);
  const share = (n: number) => cleared.filter((c) => c >= n).length / runs;

  return {
    policy: policy.name,
    runs,
    cleared,
    avgCleared: cleared.reduce((a, b) => a + b, 0) / runs,
    median: percentile(cleared, 0.5),
    p90: percentile(cleared, 0.9),
    max: cleared[cleared.length - 1],
    shareAtLeast5: share(5),
    shareAtLeast10: share(10),
    shareAtLeast20: share(20),
    shareAtLeast30: share(30),
    shareAtLeast40: share(40),
    shareAtLeast50: share(50),
    avgTurns: battles > 0 ? totalTurns / battles : 0,
    turnLimitRunRate: turnLimitRuns / runs,
    cappedRuns,
    floorAttempts,
    floorWins,
  };
}
