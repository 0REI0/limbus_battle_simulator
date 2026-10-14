import { describe, expect, it } from 'vitest';
import { createCombatant, runBattle } from '../src/core/battle';
import { createRng } from '../src/core/rng';
import type { BattleEvent } from '../src/core/types';
import { BASE_SKILLS, MAX_TURNS_PER_BATTLE, maxHpForFloor } from '../src/data/balance';
import { buildFrames, initialView } from '../src/ui/playback';

/** 손으로 만든 이벤트: 플레이어가 합에서 이기고 2번 타격해 적 체력이 100 → 81이 되는 한 턴 */
const manual: BattleEvent[] = [
  { type: 'turnStart', turn: 1, playerTier: 1, enemyTier: 2 },
  {
    type: 'clashRound',
    round: 1,
    player: { coins: [true], heads: 1, power: 11, coinCountAfter: 1 },
    enemy: { coins: [false, false], heads: 0, power: 4, coinCountAfter: 1 },
    result: 'player',
  },
  { type: 'clashEnd', winner: 'player', remainingCoins: 3 },
  { type: 'sanityChange', side: 'player', from: 0, to: 5 },
  {
    type: 'attack',
    attacker: 'player',
    tier: 1,
    coins: [true, true, false],
    // 처치 등으로 3번째 타격은 생략된 상황
    hits: [
      { coinIndex: 0, headsSoFar: 1, power: 11, targetHpAfter: 89 },
      { coinIndex: 1, headsSoFar: 2, power: 18, targetHpAfter: 71 },
    ],
  },
  { type: 'battleEnd', winner: 'player', turns: 1, reason: 'kill' },
];

describe('buildFrames: 손으로 만든 이벤트', () => {
  const frames = buildFrames(manual, 100);

  it('첫 프레임은 아무 일도 없는 초기 화면이다', () => {
    expect(frames[0].view).toEqual(initialView(100));
    expect(frames[0].view.stage).toBe('ready');
    expect(frames[0].log).toBeNull();
  });

  it('이벤트마다 프레임이 만들어지고, 공격은 타격 수만큼 늘어난다', () => {
    // 초기 1 + turnStart 1 + clashRound 1 + clashEnd 1 + sanity 1 + attack(시작 1 + 타격 2) + battleEnd 1
    expect(frames).toHaveLength(9);
    expect(frames.map((f) => f.view.stage)).toEqual([
      'ready',
      'skills',
      'clash',
      'clashEnd',
      'clashEnd',
      'attack',
      'attack',
      'attack',
      'end',
    ]);
  });

  it('합 라운드: 남은 코인과 양측 코인 정보가 화면에 반영된다', () => {
    const clash = frames[2].view;
    expect(clash.coinsLeft).toEqual({ player: 1, enemy: 1 });
    expect(clash.clash?.player.power).toBe(11);
    expect(clash.tiers).toEqual({ player: 1, enemy: 2 });
  });

  it('정신력 변화는 해당 쪽에만 반영된다', () => {
    expect(frames[4].view.sanity).toEqual({ player: 5, enemy: 0 });
  });

  it('공격은 코인을 하나씩 공개하며 체력이 줄어든다', () => {
    const attackFrames = frames.slice(5, 8);
    expect(attackFrames.map((f) => f.view.attack?.shown)).toEqual([0, 1, 2]);
    expect(attackFrames.map((f) => f.view.hp.enemy)).toEqual([100, 89, 71]);
    expect(attackFrames.every((f) => f.view.hp.player === 100)).toBe(true);
    expect(attackFrames[2].view.attack?.lastHit?.power).toBe(18);
  });

  it('생략된 타격의 코인은 보여주지 않는다 (공개할 코인 수 = 타격 수)', () => {
    expect(frames[5].view.attack?.coins).toHaveLength(2);
  });

  it('마지막 프레임에 전투 결과가 담긴다', () => {
    const last = frames[frames.length - 1];
    expect(last.view.stage).toBe('end');
    expect(last.view.end).toEqual({ winner: 'player', reason: 'kill', turns: 1 });
    expect(last.log).toBe('전투에서 승리했습니다.');
  });

  it('이전 프레임의 화면은 이후 프레임이 바뀌어도 변하지 않는다 (불변 스냅샷)', () => {
    expect(frames[1].view.hp).toEqual({ player: 100, enemy: 100 });
    expect(frames[1].view.hp).not.toBe(frames[8].view.hp);
  });
});

describe('buildFrames: 특수 상황', () => {
  it('합 무승부는 stalemate 단계로 표시된다', () => {
    const frames = buildFrames(
      [
        { type: 'turnStart', turn: 1, playerTier: 1, enemyTier: 1 },
        { type: 'clashStalemate', rounds: 100 },
      ],
      100,
    );
    const last = frames[frames.length - 1];
    expect(last.view.stage).toBe('stalemate');
    expect(last.log).toContain('100라운드');
  });

  it('턴 제한 패배는 제한 턴 수를 안내한다', () => {
    const frames = buildFrames(
      [{ type: 'battleEnd', winner: 'enemy', turns: MAX_TURNS_PER_BATTLE, reason: 'turnLimit' }],
      100,
    );
    const last = frames[frames.length - 1];
    expect(last.view.end?.reason).toBe('turnLimit');
    expect(last.log).toContain(`${MAX_TURNS_PER_BATTLE}턴`);
  });

  it('적이 공격하면 플레이어 체력이 줄어든다', () => {
    const frames = buildFrames(
      [
        {
          type: 'attack',
          attacker: 'enemy',
          tier: 2,
          coins: [true],
          hits: [{ coinIndex: 0, headsSoFar: 1, power: 9, targetHpAfter: 91 }],
        },
      ],
      100,
    );
    const last = frames[frames.length - 1].view;
    expect(last.hp).toEqual({ player: 91, enemy: 100 });
  });
});

describe('buildFrames: 실제 전투 300판', () => {
  it('프레임 수, 체력 변화, 종료 상태가 이벤트와 일치한다', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rng = createRng(seed);
      const player = createCombatant(BASE_SKILLS, 1, rng);
      const enemy = createCombatant(BASE_SKILLS, 1, rng);
      const result = runBattle(player, enemy, rng);
      const maxHp = maxHpForFloor(1);
      const frames = buildFrames(result.events, maxHp);

      // 프레임 수 = 초기 1 + 이벤트 수 + 추가 타격 프레임 수(공격 이벤트마다 타격 수만큼)
      const extra = result.events.reduce((n, e) => (e.type === 'attack' ? n + e.hits.length : n), 0);
      expect(frames).toHaveLength(1 + result.events.length + extra);

      const last = frames[frames.length - 1].view;
      expect(last.end).toEqual({ winner: result.winner, reason: result.reason, turns: result.turns });
      if (result.reason === 'kill') {
        const loser = result.winner === 'player' ? 'enemy' : 'player';
        expect(last.hp[loser]).toBe(0);
      }

      // 모든 프레임: 체력은 0 이상 최대 이하, 첫 프레임을 제외하면 로그가 있고 표시 시간은 양수
      for (const [i, f] of frames.entries()) {
        expect(f.view.hp.player).toBeGreaterThanOrEqual(0);
        expect(f.view.hp.player).toBeLessThanOrEqual(maxHp);
        expect(f.view.hp.enemy).toBeGreaterThanOrEqual(0);
        expect(f.view.hp.enemy).toBeLessThanOrEqual(maxHp);
        expect(f.delay).toBeGreaterThan(0);
        if (i > 0) expect(f.log).not.toBeNull();
      }
    }
  });
});
