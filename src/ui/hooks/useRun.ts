// ============================================================
// ui/hooks/useRun.ts - core/run.ts의 순수 전이 함수를 useReducer로 연결
// state === null 이면 타이틀 화면이다.
// ============================================================

import { useCallback, useReducer } from 'react';
import { randomSeed } from '../../core/rng';
import { advanceFloor, chooseReward, startRun, type RunState } from '../../core/run';

type Action =
  | { type: 'start'; seed: number }
  | { type: 'choose'; rewardId: string }
  | { type: 'advance' }
  | { type: 'quit' };

function reducer(state: RunState | null, action: Action): RunState | null {
  switch (action.type) {
    case 'start':
      return startRun(action.seed);
    case 'choose':
      return state === null ? state : chooseReward(state, action.rewardId);
    case 'advance':
      return state === null ? state : advanceFloor(state);
    case 'quit':
      return null;
  }
}

export function useRun() {
  const [state, dispatch] = useReducer(reducer, null);

  // 시드는 리듀서 밖(이벤트 핸들러)에서 만든다. 리듀서는 같은 입력에 항상 같은 결과를 내야 하기 때문
  const start = useCallback(() => dispatch({ type: 'start', seed: randomSeed() }), []);
  const choose = useCallback((rewardId: string) => dispatch({ type: 'choose', rewardId }), []);
  const advance = useCallback(() => dispatch({ type: 'advance' }), []);
  const quit = useCallback(() => dispatch({ type: 'quit' }), []);

  return { state, start, choose, advance, quit };
}
