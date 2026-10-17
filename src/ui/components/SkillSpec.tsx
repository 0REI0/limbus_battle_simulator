import {
  SKILL_TIERS,
  type SanityRules,
  type Side,
  type SkillSet,
  type SkillStats,
  type SkillTier,
} from '../../core/types';
import { COIN, DECK_COMPOSITION } from '../../data/balance';
import { formatDelta, formatRuleAmount } from '../format';
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
      {stats.sanityOnUse !== 0 && (
        <span className="spec__item">
          사용시 정신력 <b>{formatDelta(stats.sanityOnUse)}</b>
        </span>
      )}
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
      {(before.sanityOnUse !== 0 || after.sanityOnUse !== 0) && (
        <span className="spec__item">
          사용시 정신력{' '}
          <Changed before={before.sanityOnUse} after={after.sanityOnUse} format={formatDelta} />
        </span>
      )}
    </span>
  );
}

/** 정신력 규칙 한 줄 표기 (보상 선택 화면의 스킬 패널 아래): "정신력: 합 승리시 +5, 합 패배시 0" */
export function SanityRulesText({ rules }: { rules: SanityRules }) {
  return (
    <p className="rules">
      {COIN.sanityMode === 'dynamic'
        ? `정신력: 합 승리시 ${formatRuleAmount(rules.sanityOnClashWin)}, 합 패배시 ${formatRuleAmount(rules.sanityOnClashLose)}`
        : '정신력: 변동 없음'}
    </p>
  );
}

/** 보상 적용 전후의 정신력 규칙 비교: 바뀌는 수치만 강조 */
export function SanityRulesDiff({ before, after }: { before: SanityRules; after: SanityRules }) {
  return (
    <span className="spec">
      <span className="spec__item">
        합 승리시{' '}
        <Changed before={before.sanityOnClashWin} after={after.sanityOnClashWin} format={formatRuleAmount} />
      </span>
      <span className="spec__item">
        합 패배시{' '}
        <Changed before={before.sanityOnClashLose} after={after.sanityOnClashLose} format={formatRuleAmount} />
      </span>
    </span>
  );
}

/**
 * 1/2/3스킬 스펙 목록.
 * - side: 강조 색(플레이어 = 놋쇠, 적 = 장미)
 * - active: 지금 사용 중인 스킬 (배경색으로 강조)
 * - remaining: 스킬 묶음에 남은 각 스킬의 수 (주면 "남은 2/3"처럼 표시)
 */
export function SkillList({
  skills,
  side,
  active = null,
  remaining,
}: {
  skills: SkillSet;
  side?: Side;
  active?: SkillTier | null;
  remaining?: Record<SkillTier, number>;
}) {
  return (
    <ul className={side ? `skills skills--${side}` : 'skills'}>
      {SKILL_TIERS.map((tier) => (
        <li
          key={tier}
          className={active === tier ? 'skills__row is-active' : 'skills__row'}
          aria-current={active === tier ? 'true' : undefined}
        >
          <span className="skills__head">
            <span className="skills__tier">{tier}스킬</span>
            {remaining && (
              <span className="skills__remain">
                남은 {remaining[tier]}/{DECK_COMPOSITION[tier]}
              </span>
            )}
          </span>
          <SkillSpec stats={skills[tier]} />
        </li>
      ))}
    </ul>
  );
}
