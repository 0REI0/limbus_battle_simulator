import { Coin } from '../components/Coin';
import { COIN, MAX_TURNS_PER_BATTLE } from '../../data/balance';

export function TitleScreen({ best, onStart }: { best: number; onStart: () => void }) {
  return (
    <section className="title">
      <div className="title__coins" aria-hidden="true">
        <Coin face="heads" size="xl" side="player" />
        <Coin face="tails" size="xl" side="enemy" />
      </div>
      <h1 className="title__name">림버스 배틀 시뮬레이터</h1>
      <p className="title__lead">코인을 굴려 합을 이기고, 한 층이라도 더 높이 올라가세요.</p>

      <button type="button" className="btn btn--primary btn--wide" onClick={onStart}>
        게임 시작
      </button>
      <p className="title__best">{best > 0 ? `최고 기록: ${best}층 클리어` : '아직 기록이 없습니다.'}</p>

      <details className="howto">
        <summary>게임 방법</summary>
        <ul>
          <li>
            층이 시작되면 그 층의 적 스킬이 먼저 공개됩니다. 적을 보고 보상 선택지 중 하나를 골라 스킬을
            강화합니다.
          </li>
          <li>전투는 자동으로 진행됩니다. 양쪽이 스킬을 꺼내 합을 겨루고, 합에서 이긴 쪽만 공격합니다.</li>
          <li>
            합에서는 코인을 굴려 앞면이 많을수록 위력이 커지고, 위력이 낮은 쪽이 코인을 1개 잃습니다.
            한쪽 코인이 0개가 되면 합이 끝납니다.
          </li>
          <li>
            합에서 이기면 정신력이 {COIN.sanityOnClashWin} 올라 앞면이 나올 확률이 높아집니다.
          </li>
          <li>이긴 쪽은 남은 코인 개수만큼 타격하고, 타격마다 지금까지 나온 앞면이 위력에 더해집니다.</li>
          <li>
            적도 같은 횟수의 보상을 받습니다. {MAX_TURNS_PER_BATTLE}턴 안에 처치하지 못하면
            패배합니다.
          </li>
        </ul>
      </details>
    </section>
  );
}
