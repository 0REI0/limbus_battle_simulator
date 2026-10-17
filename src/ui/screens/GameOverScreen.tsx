import { describeReward } from '../../core/rewards';
import { floorsCleared, type RunState } from '../../core/run';
import { MAX_TURNS_PER_BATTLE, REWARDS } from '../../data/balance';
import { TierPips } from '../components/Meters';
import { SanityRulesText, SkillList } from '../components/SkillSpec';

export function GameOverScreen({
  state,
  best,
  newRecord,
  onRestart,
  onQuit,
}: {
  state: RunState;
  best: number;
  newRecord: boolean;
  onRestart: () => void;
  onQuit: () => void;
}) {
  const cleared = floorsCleared(state);
  const reason =
    state.battle?.reason === 'turnLimit'
      ? `${MAX_TURNS_PER_BATTLE}턴 안에 적을 처치하지 못했습니다.`
      : '적에게 쓰러졌습니다.';

  return (
    <section className="gameover">
      <p className="gameover__where">
        {state.floor}층에서 도전이 끝났습니다. {reason}
      </p>
      <h1 className="gameover__score">
        <span className="num">{cleared}</span>층 클리어
      </h1>
      <p className={newRecord ? 'gameover__record is-new' : 'gameover__record'}>
        {newRecord ? '새 최고 기록입니다.' : `최고 기록: ${best}층 클리어`}
      </p>

      <div className="actions">
        <button type="button" className="btn btn--primary" onClick={onRestart}>
          다시 도전
        </button>
        <button type="button" className="btn" onClick={onQuit}>
          처음으로
        </button>
      </div>

      <section className="panel">
        <h2 className="panel__title">고른 보상</h2>
        <ol className="history">
          {state.history.map((reward, i) => (
            <li key={i} className="history__row">
              <span className="history__floor">{Math.floor(i / REWARDS.picksPerFloor) + 1}층</span>
              <TierPips tier={reward.rewardTier} />
              <span>{describeReward(reward)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="panel">
        <h2 className="panel__title">최종 스킬</h2>
        <SkillList skills={state.player.skills} />
        <SanityRulesText rules={state.player.sanity} />
      </section>

      <p className="hint">시드 {state.seed}</p>
    </section>
  );
}
