import { applyReward, describeReward, STAT_LABEL } from '../../core/rewards';
import type { RunState } from '../../core/run';
import type { Reward, SkillSet } from '../../core/types';
import { REWARDS, rewardCountForFloor } from '../../data/balance';
import { TierPips } from '../components/Meters';
import { SkillList, SpecDiff } from '../components/SkillSpec';
import { formatDelta } from '../format';

function RewardCard({
  reward,
  skills,
  onChoose,
}: {
  reward: Reward;
  skills: SkillSet;
  onChoose: (id: string) => void;
}) {
  const after = applyReward(skills, reward);
  const touched = [...new Set(reward.effects.map((e) => e.skillTier))].sort();

  return (
    <button
      type="button"
      className={`reward reward--t${reward.rewardTier}`}
      onClick={() => onChoose(reward.id)}
      aria-label={`등급 ${reward.rewardTier}: ${describeReward(reward)}`}
    >
      <span className="reward__rank">
        <TierPips tier={reward.rewardTier} />
        <span>등급 {reward.rewardTier}</span>
      </span>
      <span className="reward__effects">
        {reward.effects.map((e) => (
          <span key={`${e.skillTier}-${e.stat}`} className="reward__effect">
            {e.skillTier}스킬 {STAT_LABEL[e.stat]}{' '}
            <b className={e.amount >= 0 ? 'delta delta--up' : 'delta delta--down'}>
              {formatDelta(e.amount)}
            </b>
          </span>
        ))}
      </span>
      <span className="reward__preview">
        {touched.map((tier) => (
          <span key={tier} className="reward__preview-row">
            <span className="reward__preview-tier">{tier}스킬</span>
            <SpecDiff before={skills[tier]} after={after[tier]} />
          </span>
        ))}
      </span>
    </button>
  );
}

export function RewardScreen({
  state,
  onChoose,
}: {
  state: RunState;
  onChoose: (rewardId: string) => void;
}) {
  const total = REWARDS.picksPerFloor;
  const order = total - state.picksLeft + 1;

  return (
    <section className="reward-screen">
      <header className="stagehead">
        <h1 className="stagehead__floor">
          <span className="num">{state.floor}</span>층
        </h1>
        <p className="stagehead__note">
          보상을 하나 고르세요{total > 1 ? ` (${order}/${total}번째)` : ''}
        </p>
      </header>

      <ul className="choices">
        {state.choices.map((reward) => (
          <li key={reward.id}>
            <RewardCard reward={reward} skills={state.skills} onChoose={onChoose} />
          </li>
        ))}
      </ul>

      <section className="panel">
        <h2 className="panel__title">내 스킬</h2>
        <SkillList skills={state.skills} />
        <p className="hint">위력은 기본 + 코인 × 앞면 개수입니다. 코인 개수는 합에서 버티는 횟수이자 공격 횟수입니다.</p>
      </section>

      <p className="hint">
        이 층의 적은 보상 {rewardCountForFloor(state.floor)}개를 받은 상태로 나옵니다.
      </p>
    </section>
  );
}
