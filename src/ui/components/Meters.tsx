import type { SanityRules, Side } from '../../core/types';
import { formatRuleAmount } from '../format';
import { COIN } from '../../data/balance';

export function HpBar({ hp, max, side }: { hp: number; max: number; side: Side }) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
  return (
    <div
      className={`hp hp--${side}`}
      role="progressbar"
      aria-label="체력"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={hp}
    >
      <div className="hp__fill" style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}

/**
 * 정신력 -45 ~ +45. 가운데가 0이고 양수는 오른쪽, 음수는 왼쪽으로 채운다.
 * 바 아래에 현재 정신력과 앞면 확률, 그리고 이 쪽의 정신력 증감 규칙(합 승리/패배 시)을 보여준다.
 */
export function SanityMeter({ sanity, rules }: { sanity: number; rules: SanityRules }) {
  const half = Math.max(COIN.sanityMax, -COIN.sanityMin);
  const width = (Math.min(Math.abs(sanity), half) / half) * 50;
  const left = sanity >= 0 ? 50 : 50 - width;
  const headsPercent = COIN.baseHeadsPercent + sanity;
  return (
    <div className="sanity">
      <div className="sanity__track" aria-hidden="true">
        <div className="sanity__fill" style={{ left: `${left}%`, width: `${width}%` }} />
      </div>
      <p className="sanity__text">
        <span>정신력 {sanity > 0 ? `+${sanity}` : sanity}</span>
        <span>앞면 확률 {headsPercent}%</span>
      </p>
      <p className="sanity__text sanity__text--rules">
        {COIN.sanityMode === 'dynamic' ? (
          <>
            <span>합 승리시 {formatRuleAmount(rules.sanityOnClashWin)}</span>
            <span>합 패배시 {formatRuleAmount(rules.sanityOnClashLose)}</span>
          </>
        ) : (
          <span>정신력 변동 없음</span>
        )}
      </p>
    </div>
  );
}

/** 보상 등급을 5단 막대로 표시 (채워진 막대 수 = 등급) */
export function TierPips({ tier, total = 5 }: { tier: number; total?: number }) {
  return (
    <span className="pips" role="img" aria-label={`등급 ${tier}`}>
      {Array.from({ length: total }, (_, i) => (
        <i key={i} className={i < tier ? 'pips__bar is-on' : 'pips__bar'} />
      ))}
    </span>
  );
}
