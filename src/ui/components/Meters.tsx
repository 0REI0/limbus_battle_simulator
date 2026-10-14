import type { Side } from '../../core/types';
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

/** 정신력 -45 ~ +45. 가운데가 0이고 양수는 오른쪽, 음수는 왼쪽으로 채운다 */
export function SanityMeter({ sanity }: { sanity: number }) {
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
        정신력 {sanity > 0 ? `+${sanity}` : sanity}, 앞면 확률 {headsPercent}%
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
