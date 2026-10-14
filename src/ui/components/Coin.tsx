import type { Side } from '../../core/types';

export type CoinFace = 'heads' | 'tails' | 'hidden';
export type CoinSize = 'sm' | 'md' | 'lg' | 'xl';

const FACE_LABEL: Record<CoinFace, string> = { heads: '앞면', tails: '뒷면', hidden: '미공개' };
const FACE_GLYPH: Record<CoinFace, string> = { heads: '앞', tails: '뒤', hidden: '' };

/** 코인 하나. 색뿐 아니라 글자(앞/뒤)로도 앞뒷면을 구분한다 */
export function Coin({ face, size = 'md', side }: { face: CoinFace; size?: CoinSize; side?: Side }) {
  const classes = ['coin', `coin--${face}`, `coin--${size}`, side ? `coin--${side}` : ''].filter(Boolean);
  return (
    <span className={classes.join(' ')} role="img" aria-label={FACE_LABEL[face]}>
      {FACE_GLYPH[face]}
    </span>
  );
}

/** 코인 여러 개. shown을 주면 그 개수만큼만 앞/뒷면을 공개하고 나머지는 가려둔다 */
export function CoinRow({
  coins,
  shown,
  size = 'lg',
  side,
}: {
  coins: readonly boolean[];
  shown?: number;
  size?: CoinSize;
  side?: Side;
}) {
  const visible = shown ?? coins.length;
  return (
    <span className="coin-row">
      {coins.map((isHeads, i) => (
        <Coin
          key={i}
          face={i >= visible ? 'hidden' : isHeads ? 'heads' : 'tails'}
          size={size}
          side={side}
        />
      ))}
    </span>
  );
}

/** 코인 개수를 작은 동전 아이콘으로 표시 */
export function CoinPips({ count }: { count: number }) {
  return (
    <span className="coin-pips" role="img" aria-label={`코인 ${count}개`}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="coin-pips__dot" />
      ))}
    </span>
  );
}
