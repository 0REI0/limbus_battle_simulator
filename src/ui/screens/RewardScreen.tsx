import {
  amountText,
  applyReward,
  describeReward,
  resolveAmount,
  RULE_LABEL,
  STAT_LABEL,
} from '../../core/rewards';
import type { RunState } from '../../core/run';
import { isSanityRuleEffect, type Reward, type RewardEffect, type UnitSpec } from '../../core/types';
import { maxHpForFloor, REWARDS, rewardCountForFloor } from '../../data/balance';
import { TierPips } from '../components/Meters';
import { SanityRulesDiff, SanityRulesText, SkillList, SpecDiff } from '../components/SkillSpec';
import { formatDelta, formatRuleAmount } from '../format';

const MINUS = '\u2212';

/** 효과 한 줄. 스킬의 현재 스탯을 참조하는 식이면 식과 "현재 값"을 같이 보여준다 */
function EffectLine({ effect, spec }: { effect: RewardEffect; spec: UnitSpec }) {
  if (isSanityRuleEffect(effect)) {
    return (
      <span className="reward__effect">
        {RULE_LABEL[effect.rule]}{' '}
        <b className={effect.amount >= 0 ? 'delta delta--up' : 'delta delta--down'}>
          {formatRuleAmount(effect.amount)}
        </b>
      </span>
    );
  }

  const resolved = resolveAmount(effect.amount, spec.skills[effect.skillTier]);
  const isFormula = typeof effect.amount !== 'number';
  return (
    <span className="reward__effect">
      {effect.skillTier}스킬 {STAT_LABEL[effect.stat]}{' '}
      <b className={resolved >= 0 ? 'delta delta--up' : 'delta delta--down'}>
        {isFormula ? amountText(effect.amount, MINUS) : formatDelta(resolved)}
      </b>
      {isFormula && <span className="reward__now"> (현재 {formatDelta(resolved)})</span>}
    </span>
  );
}

function RewardCard({
  reward,
  spec,
  onChoose,
}: {
  reward: Reward;
  spec: UnitSpec;
  onChoose: (id: string) => void;
}) {
  const after = applyReward(spec, reward);
  const touched = [
    ...new Set(reward.effects.flatMap((e) => (isSanityRuleEffect(e) ? [] : [e.skillTier]))),
  ].sort();
  const changesRules = reward.effects.some(isSanityRuleEffect);

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
        {reward.effects.map((effect, i) => (
          <EffectLine key={i} effect={effect} spec={spec} />
        ))}
      </span>
      <span className="reward__preview">
        {touched.map((tier) => (
          <span key={tier} className="reward__preview-row">
            <span className="reward__preview-tier">{tier}스킬</span>
            <SpecDiff before={spec.skills[tier]} after={after.skills[tier]} />
          </span>
        ))}
        {changesRules && (
          <span className="reward__preview-row">
            <span className="reward__preview-tier">정신력</span>
            <SanityRulesDiff before={spec.sanity} after={after.sanity} />
          </span>
        )}
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
            <RewardCard reward={reward} spec={state.player} onChoose={onChoose} />
          </li>
        ))}
      </ul>

      <div className="duo">
        <section className="panel" aria-label="플레이어 스킬">
          <h2 className="panel__title">플레이어 스킬</h2>
          <SkillList side="player" skills={state.player.skills} />
          <SanityRulesText rules={state.player.sanity} />
        </section>
        <section className="panel panel--enemy" aria-label="이 층의 적 스킬">
          <h2 className="panel__title">이 층의 적 스킬</h2>
          <SkillList side="enemy" skills={state.enemy.skills} />
          <SanityRulesText rules={state.enemy.sanity} />
        </section>
      </div>

      <p className="hint">
        위력은 기본 + 코인 × 앞면 개수이고, 0 아래로는 내려가지 않습니다. 코인 개수는 합에서 버티는 횟수이자
        공격 횟수입니다.
      </p>
      <p className="hint">
        스킬의 사용시 정신력은 그 스킬을 쓸 때(합 직전) 적용되고, 합 승리/패배시 정신력은 스킬과 상관없이 합이
        끝난 뒤 적용됩니다.
      </p>
      <p className="hint">
        적은 보상 {rewardCountForFloor(state.floor)}개를 받은 상태입니다. 양쪽 체력은 모두{' '}
        {maxHpForFloor(state.floor)}입니다.
      </p>
    </section>
  );
}
