import { SKILL_TIERS, type SkillSet, type SkillStats } from '../../core/types';
import { formatDelta } from '../format';
import { CoinPips } from './Coin';

/** 스킬 한 줄 스펙: 기본 위력, 코인 위력, 코인 개수 */
export function SkillSpec({ stats }: { stats: SkillStats }) {
  return (
    <span className="spec">
      <span className="spec__item">
        기본 <b>{stats.basePower}</b>
      </span>
      <span className="spec__item">
        코인 <b>{formatDelta(stats.coinPower)}</b>
      </span>
      <CoinPips count={stats.coinCount} />
    </span>
  );
}

function Changed({
  before,
  after,
  format = String,
}: {
  before: number;
  after: number;
  format?: (n: number) => string;
}) {
  if (before === after) return <b>{format(after)}</b>;
  return (
    <b className="spec__changed">
      {format(before)}→{format(after)}
    </b>
  );
}

/** 보상 적용 전후 비교: 바뀌는 수치만 강조 표시 */
export function SpecDiff({ before, after }: { before: SkillStats; after: SkillStats }) {
  return (
    <span className="spec">
      <span className="spec__item">
        기본 <Changed before={before.basePower} after={after.basePower} />
      </span>
      <span className="spec__item">
        코인 <Changed before={before.coinPower} after={after.coinPower} format={formatDelta} />
      </span>
      <span className="spec__item">
        개수 <Changed before={before.coinCount} after={after.coinCount} />
      </span>
    </span>
  );
}

/** 1/2/3스킬 스펙 목록 */
export function SkillList({ skills }: { skills: SkillSet }) {
  return (
    <ul className="skills">
      {SKILL_TIERS.map((tier) => (
        <li key={tier} className="skills__row">
          <span className="skills__tier">{tier}스킬</span>
          <SkillSpec stats={skills[tier]} />
        </li>
      ))}
    </ul>
  );
}
