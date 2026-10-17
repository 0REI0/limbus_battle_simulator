import { useMemo, type ReactNode } from 'react';
import type { BattleResult, ClashSide, Side, SkillSet, SkillTier, UnitSpec } from '../../core/types';
import { maxHpForFloor } from '../../data/balance';
import { BattleLog } from '../components/BattleLog';
import { CoinRow, type CoinSize } from '../components/Coin';
import { HpBar, SanityMeter } from '../components/Meters';
import { SkillList } from '../components/SkillSpec';
import { useBattlePlayback } from '../hooks/useBattlePlayback';
import { buildFrames, type AttackView, type BattleView } from '../playback';

const SPEEDS = [1, 2, 4] as const;
const NAME: Record<Side, string> = { player: '플레이어', enemy: '적' };

/**
 * 코인 크기: 그 스킬의 코인 개수로 정한다. 합이 진행되며 코인이 줄어도 크기가 바뀌지 않아
 * 화면이 흔들리지 않는다 (양쪽 중 큰 쪽에 맞춰 같은 크기를 쓴다).
 */
function coinSizeFor(maxCoins: number): CoinSize {
  if (maxCoins <= 6) return 'lg';
  if (maxCoins <= 10) return 'md';
  return 'sm';
}

// ---------- 1) 체력 / 정신력 ----------

function Fighter({ side, view, spec }: { side: Side; view: BattleView; spec: UnitSpec }) {
  return (
    <section className={`fighter fighter--${side}`} aria-label={NAME[side]}>
      <div className="fighter__head">
        <h2 className="fighter__name">{NAME[side]}</h2>
        <p className="fighter__hp">
          <span className="num">{view.hp[side]}</span> / {view.maxHp}
        </p>
      </div>
      <HpBar hp={view.hp[side]} max={view.maxHp} side={side} />
      <SanityMeter sanity={view.sanity[side]} rules={spec.sanity} />
    </section>
  );
}

// ---------- 2) 배틀 화면 (코인 굴림, 합, 공격) ----------
// 높이가 고정된 무대 안에서 플레이어는 왼쪽, 적은 오른쪽에 둔다.

function ArenaSide({
  side,
  dim = false,
  children,
}: {
  side: Side;
  dim?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`arena__side arena__side--${side}${dim ? ' is-dim' : ''}`}>
      <p className="arena__who">{NAME[side]}</p>
      {children}
    </div>
  );
}

function CoinArea({ size, children }: { size: CoinSize; children: ReactNode }) {
  return <div className={`coin-area coin-area--${size}`}>{children}</div>;
}

function PowerCalc({ data, skills, tier }: { data: ClashSide; skills: SkillSet; tier: SkillTier }) {
  const stats = skills[tier];
  // 코인 위력이 음수면 위력이 0 아래로 내려가지 않는다는 점을 계산식에 같이 표시
  const raw = stats.basePower + stats.coinPower * data.heads;
  return (
    <p className="arena__power">
      <span className="num">{data.power}</span>
      <span className="arena__calc">
        {stats.basePower} {stats.coinPower < 0 ? '\u2212' : '+'} {Math.abs(stats.coinPower)}×{data.heads}
        {raw < 0 ? ' (최소 0)' : ''}
      </span>
    </p>
  );
}

function ClashStage({ view, specs }: { view: BattleView; specs: Record<Side, SkillSet> }) {
  const clash = view.clash;
  const { player, enemy } = view.tiers;
  if (clash === null || player === null || enemy === null) return null;

  const tiers: Record<Side, SkillTier> = { player, enemy };
  const size = coinSizeFor(Math.max(specs.player[player].coinCount, specs.enemy[enemy].coinCount));

  return (
    <div className="arena__grid" key={`${view.turn}-${clash.round}`}>
      <p className="arena__caption">
        {view.turn}턴, {clash.round}합{clash.result === 'draw' ? ' (무승부)' : ''}
      </p>
      {(['player', 'enemy'] as const).map((side) => (
        <ArenaSide key={side} side={side} dim={clash.result !== 'draw' && clash.result !== side}>
          <CoinArea size={size}>
            <CoinRow coins={clash[side].coins} size={size} side={side} />
          </CoinArea>
          <PowerCalc data={clash[side]} skills={specs[side]} tier={tiers[side]} />
        </ArenaSide>
      ))}
    </div>
  );
}

function AttackStage({ attack, specs }: { attack: AttackView; specs: Record<Side, SkillSet> }) {
  const hit = attack.lastHit;
  const size = coinSizeFor(specs[attack.attacker][attack.tier].coinCount);

  return (
    <div className="arena__grid">
      <p className="arena__caption">
        {NAME[attack.attacker]}의 공격 ({attack.tier}스킬)
      </p>
      {(['player', 'enemy'] as const).map((side) =>
        side === attack.attacker ? (
          <ArenaSide key={side} side={side}>
            <CoinArea size={size}>
              <CoinRow coins={attack.coins} shown={attack.shown} size={size} side={side} />
            </CoinArea>
            <p className="arena__damage">
              {hit === null ? (
                '코인을 굴립니다'
              ) : (
                <>
                  <span className="num arena__number" key={attack.shown}>
                    {hit.power}
                  </span>{' '}
                  피해
                </>
              )}
            </p>
          </ArenaSide>
        ) : (
          // 공격을 받는 쪽은 자리만 유지한다
          <div key={side} className="arena__side arena__side--idle" aria-hidden="true" />
        ),
      )}
    </div>
  );
}

function ArenaText({ title, note }: { title: string; note?: string }) {
  return (
    <div className="arena__text">
      <p className="arena__title">{title}</p>
      {note && <p className="arena__note">{note}</p>}
    </div>
  );
}

function Arena({ view, specs }: { view: BattleView; specs: Record<Side, SkillSet> }) {
  switch (view.stage) {
    case 'ready':
      return <ArenaText title="전투 시작" note={`양쪽 체력은 ${view.maxHp}입니다.`} />;
    case 'skills':
      return <ArenaText title={`${view.turn}턴`} note="양쪽이 스킬을 꺼냈습니다." />;
    case 'clash':
      return <ClashStage view={view} specs={specs} />;
    case 'stalemate':
      return <ArenaText title="합 무승부" note="승부가 나지 않아 이번 턴은 공격 없이 넘어갑니다." />;
    case 'clashEnd': {
      const winner = view.clashWinner;
      if (winner === null) return null;
      return (
        <ArenaText
          title={winner === 'player' ? '합 승리' : '합 패배'}
          note={`${NAME[winner]}의 코인 ${view.coinsLeft[winner] ?? 0}개가 남았습니다. 공격합니다.`}
        />
      );
    }
    case 'attack':
      return view.attack === null ? null : <AttackStage attack={view.attack} specs={specs} />;
    case 'end': {
      const end = view.end;
      if (end === null) return null;
      return (
        <ArenaText
          title={end.winner === 'player' ? '승리' : '패배'}
          note={end.reason === 'turnLimit' ? '제한 턴 안에 처치하지 못했습니다.' : `${end.turns}턴 만에 끝났습니다.`}
        />
      );
    }
  }
}

// ---------- 전체 화면 ----------

export function BattleScreen({
  floor,
  player,
  enemy,
  battle,
  speed,
  onSpeedChange,
  onContinue,
}: {
  floor: number;
  player: UnitSpec;
  enemy: UnitSpec;
  battle: BattleResult;
  /** 재생 배속. 층이 바뀌어도 유지되도록 부모가 들고 있다 */
  speed: number;
  onSpeedChange: (speed: number) => void;
  onContinue: () => void;
}) {
  const maxHp = maxHpForFloor(floor);
  const frames = useMemo(() => buildFrames(battle.events, maxHp), [battle, maxHp]);
  const { index, frame, finished, skip, replay } = useBattlePlayback(frames, speed);
  const logLines = useMemo(
    () => frames.slice(0, index + 1).flatMap((f) => (f.log === null ? [] : [f.log])),
    [frames, index],
  );
  const specs: Record<Side, SkillSet> = { player: player.skills, enemy: enemy.skills };
  const view = frame.view;

  return (
    <section className="battle">
      <header className="stagehead stagehead--battle">
        <h1 className="stagehead__floor">
          <span className="num">{floor}</span>층
        </h1>
        <p className="stagehead__note">자동 전투</p>
      </header>

      {/* 0) 배속 / 건너뛰기 */}
      <div className="controls">
        <div className="speed" role="group" aria-label="재생 속도">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              className="btn btn--small"
              aria-pressed={speed === s}
              onClick={() => onSpeedChange(s)}
            >
              {s}배속
            </button>
          ))}
        </div>
        {finished ? (
          <button type="button" className="btn btn--small" onClick={replay}>
            다시 보기
          </button>
        ) : (
          <button type="button" className="btn btn--small" onClick={skip}>
            건너뛰기
          </button>
        )}
      </div>

      {/* 1) 체력 / 정신력 */}
      <div className="fighters">
        <Fighter side="player" view={view} spec={player} />
        <Fighter side="enemy" view={view} spec={enemy} />
      </div>

      {/* 2) 배틀 화면 */}
      <div className="arena" aria-live="polite">
        <Arena view={view} specs={specs} />
      </div>

      {/* 3) 양쪽 스킬 스펙 + 묶음에 남은 스킬 수 (사용 중인 스킬은 배경색으로 강조) */}
      <div className="duo">
        <section className="panel" aria-label="플레이어 스킬">
          <h2 className="panel__title">플레이어</h2>
          <SkillList side="player" skills={player.skills} active={view.tiers.player} remaining={view.deck.player} />
        </section>
        <section className="panel panel--enemy" aria-label="적 스킬">
          <h2 className="panel__title">적</h2>
          <SkillList side="enemy" skills={enemy.skills} active={view.tiers.enemy} remaining={view.deck.enemy} />
        </section>
      </div>
      <p className="hint">
        강조된 줄이 이번 턴에 쓰는 스킬이고, 남은 수는 이번 스킬 묶음에 아직 남은 개수입니다.
      </p>

      {/* 4) 다음 층으로 (전투가 끝나기 전에는 같은 자리를 비활성 버튼으로 채워 화면이 밀리지 않게 한다) */}
      <div className="continue">
        {finished ? (
          <button type="button" className="btn btn--primary btn--wide" onClick={onContinue}>
            {battle.winner === 'player' ? '다음 층으로' : '결과 보기'}
          </button>
        ) : (
          <button type="button" className="btn btn--wide" disabled>
            전투 진행 중
          </button>
        )}
      </div>

      {/* 5) 전투 로그 */}
      <BattleLog lines={logLines} />
    </section>
  );
}
