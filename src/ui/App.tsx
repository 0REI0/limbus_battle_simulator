import { useCallback, useEffect, useState } from 'react';
import { floorsCleared } from '../core/run';
import { useRun } from './hooks/useRun';
import { BattleScreen } from './screens/BattleScreen';
import { GameOverScreen } from './screens/GameOverScreen';
import { RewardScreen } from './screens/RewardScreen';
import { TitleScreen } from './screens/TitleScreen';
import { loadBest, recordBest } from './storage';

/** 화면이 새로 나타날 때(마운트) 한 번만 맨 위로 스크롤한다 */
function ScrollToTop() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  return null;
}

export default function App() {
  const { state, start, choose, advance, quit } = useRun();

  // 재생 배속은 층이 바뀌어도(전투 화면이 새로 마운트되어도) 유지한다
  const [speed, setSpeed] = useState(1);

  // 이번 런을 시작할 때의 최고 기록. 게임 오버 때 "새 기록인가"를 비교하는 기준이기도 하다
  const [baseline, setBaseline] = useState(loadBest);
  const cleared = state === null ? 0 : floorsCleared(state);
  const isGameOver = state !== null && state.phase === 'gameOver';
  // 화면에 보여줄 최고 기록: 게임 오버 화면에서는 방금 판의 결과까지 반영
  const best = isGameOver ? Math.max(baseline, cleared) : baseline;

  const startRun = useCallback(() => {
    setBaseline(best);
    start();
  }, [best, start]);

  const quitToTitle = useCallback(() => {
    setBaseline(best);
    quit();
  }, [best, quit]);

  // 게임 오버가 되면 브라우저 저장소에 기록 (외부 시스템과의 동기화라 효과로 처리)
  useEffect(() => {
    if (state !== null && state.phase === 'gameOver') recordBest(floorsCleared(state));
  }, [state]);

  let screen;
  if (state === null) {
    screen = <TitleScreen best={best} onStart={startRun} />;
  } else if (state.phase === 'reward') {
    screen = <RewardScreen state={state} onChoose={choose} />;
  } else if (state.phase === 'battle' && state.battle !== null) {
    screen = (
      <BattleScreen
        floor={state.floor}
        skills={state.skills}
        enemySkills={state.enemySkills}
        battle={state.battle}
        speed={speed}
        onSpeedChange={setSpeed}
        onContinue={advance}
      />
    );
  } else {
    screen = (
      <GameOverScreen
        state={state}
        best={best}
        newRecord={cleared > baseline}
        onRestart={startRun}
        onQuit={quitToTitle}
      />
    );
  }

  // key가 바뀌면 화면이 새로 마운트되어 스크롤과 재생 상태가 초기화된다
  const screenKey = state === null ? 'title' : `${state.phase}-${state.floor}-${state.picksLeft}`;

  return (
    <div className="app">
      <main className="screen" key={screenKey}>
        <ScrollToTop />
        {screen}
      </main>
      <footer className="fan-note">
        <p>이 프로젝트는 Limbus Company(Project Moon)의 2차 창작 팬 프로젝트이며 비공식입니다.</p>
        <p>
          ProjectMoon의 공식 이미지 혹은 사운드 리소스는 사용되지 않았으며, 상업적, 영리적인 목적이
          없습니다.
        </p>
      </footer>
    </div>
  );
}
