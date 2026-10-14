import { useMemo, useState } from 'react';
import type { BattleResult, ClashSide, Side, SkillSet } from '../../core/types';
import { maxHpForFloor } from '../../data/balance';
import { BattleLog } from '../components/BattleLog';
import { CoinRow } from '../components/Coin';
import { HpBar, SanityMeter } from '../components/Meters';
import { SkillList, SkillSpec } from '../components/SkillSpec';
import { useBattlePlayback } from '../hooks/useBattlePlayback';
import { buildFrames, type AttackView, type BattleView } from '../playback';

const SPEEDS = [1, 2, 4] as const;
const NAME: Record<Side, string> = { player: '플레이어', enemy: '적' };

function Fighter({ side, view, skills }: { side: Side; view: BattleView; skills: SkillSet }) {
  const tier = view.tiers[side];
  return (
    <section className={`fighter fighter--${side}`} aria-label={NAME[side]}>
      <div className="fighter__head">
        <h2 className="fighter__name">{NAME[side]}</h2>
        <p className="fighter__hp">
          <span className="num">{view.hp[side]}</span> / {view.maxHp}
        </p>
      </div>
      <HpBar hp={view.hp[side]} max={view.maxHp} side={side} />
      <SanityMeter sanity={view.sanity[side]} />
      <p className="fighter__skill">
        {tier === null ? (
          <span className="muted">스킬 대기 중</span>
        ) : (
          <>
            <span className="chip">{tier}스킬</span>
            <SkillSpec stats={skills[tier]} />
          </>
        )}
      </p>
    </section>
  );
}

function ClashRow({
  side,
  data,
  skills,
  tier,
  leading,
}: {
  side: Side;
  data: ClashSide;
  skills: SkillSet;
  tier: 1 | 2 | 3;
  leading: boolean;
}) {
  const stats = skills[tier];
  // 코인 위력이 음수면 위력이 0 아래로 내려가지 않는다는 점을 계산식에 같이 표시
  const raw = stats.basePower + stats.coinPower * data.heads;
  return (
    <div className={`clash__row clash__row--${side}${leading ? ' is-leading' : ''}`}>
      <CoinRow coins={data.coins} size="lg" side={side} />
      <p className="clash__power">
        <span className="num">{data.power}</span>
        <span className="clash__calc">
          {stats.basePower} {stats.coinPower < 0 ? '\u2212' : '+'} {Math.abs(stats.coinPower)}×{data.heads}
          {raw < 0 ? ' (최소 0)' : ''}
        </span>
      </p>
    </div>
  );
}

function AttackStage({ attack }: { attack: AttackView }) {
  const hit = attack.lastHit;
  return (
    <div className={`attack attack--${attack.attacker}`}>
      <p className="arena__caption">
        {NAME[attack.attacker]}의 공격 ({attack.tier}스킬)
      </p>
      <CoinRow coins={attack.coins} shown={attack.shown} size="lg" side={attack.attacker} />
      <p className="attack__damage">
        {hit === null ? (
          '코인을 굴립니다'
        ) : (
          <>
            <span className="num attack__number" key={attack.shown}>
              {hit.power}
            </span>{' '}
            피해
          </>
        )}
      </p>
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
    case 'clash': {
      const clash = view.clash;
      const { player, enemy } = view.tiers;
      if (clash === null || player === null || enemy === null) return null;
      return (
        <div className="clash" key={`${view.turn}-${clash.round}`}>
          <ClashRow side="enemy" data={clash.enemy} skills={specs.enemy} tier={enemy} leading={clash.result === 'enemy'} />
          <p className="arena__caption">
            {view.turn}턴, {clash.round}합
            {clash.result === 'draw' ? ' (무승부)' : ''}
          </p>
          <ClashRow side="player" data={clash.player} skills={specs.player} tier={player} leading={clash.result === 'player'} />
        </div>
      );
    }
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
      return view.attack === null ? null : <AttackStage attack={view.attack} />;
    case 'end': {
      const end = view.end;
      if (end === null) return null;
      const won = end.winner === 'player';
      return (
        <ArenaText
          title={won ? '승리' : '패배'}
          note={end.reason === 'turnLimit' ? '제한 턴 안에 처치하지 못했습니다.' : `${end.turns}턴 만에 끝났습니다.`}
        />
      );
    }
  }
}

export function BattleScreen({
  floor,
  skills,
  enemySkills,
  battle,
  onContinue,
}: {
  floor: number;
  skills: SkillSet;
  enemySkills: SkillSet;
  battle: BattleResult;
  onContinue: () => void;
}) {
  const maxHp = maxHpForFloor(floor);
  const frames = useMemo(() => buildFrames(battle.events, maxHp), [battle, maxHp]);
  const [speed, setSpeed] = useState<number>(1);
  const { index, frame, finished, skip, replay } = useBattlePlayback(frames, speed);
  const logLines = useMemo(
    () => frames.slice(0, index + 1).flatMap((f) => (f.log === null ? [] : [f.log])),
    [frames, index],
  );
  const specs: Record<Side, SkillSet> = { player: skills, enemy: enemySkills };
  const view = frame.view;

  return (
    <section className="battle">
      <header className="stagehead stagehead--battle">
        <h1 className="stagehead__floor">
          <span className="num">{floor}</span>층
        </h1>
        <p className="stagehead__note">자동 전투</p>
      </header>

      <Fighter side="enemy" view={view} skills={enemySkills} />
      <div className="arena" aria-live="polite">
        <Arena view={view} specs={specs} />
      </div>
      <Fighter side="player" view={view} skills={skills} />

      <div className="controls">
        <div className="speed" role="group" aria-label="재생 속도">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              className="btn btn--small"
              aria-pressed={speed === s}
              onClick={() => setSpeed(s)}
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

      {finished && (
        <button type="button" className="btn btn--primary btn--wide" onClick={onContinue}>
          {battle.winner === 'player' ? '다음 층으로' : '결과 보기'}
        </button>
      )}

      <BattleLog lines={logLines} />

      <details className="specs">
        <summary>양쪽 스킬 스펙 보기</summary>
        <div className="specs__grid">
          <div>
            <h3 className="specs__who">플레이어</h3>
            <SkillList skills={skills} />
          </div>
          <div>
            <h3 className="specs__who">적</h3>
            <SkillList skills={enemySkills} />
          </div>
        </div>
      </details>
    </section>
  );
}
