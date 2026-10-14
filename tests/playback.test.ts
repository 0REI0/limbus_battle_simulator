import { describe, expect, it } from 'vitest';
import { createCombatant, runBattle } from '../src/core/battle';
import { createRng } from '../src/core/rng';
import type { BattleEvent } from '../src/core/types';
import { BASE_SKILLS, MAX_TURNS_PER_BATTLE, maxHpForFloor } from '../src/data/balance';
import { buildFrames, initialView } from '../src/ui/playback';

/** 손으로 만든 이벤트: 플레이어가 합에서 이기고 2번 타격해 적 체력이 100 → 71이 되는 한 턴 */
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
    expect(last.log).toBe('전투 승리');
  });

  it('이전 프레임의 화면은 이후 프레임이 바뀌어도 변하지 않는다 (불변 스냅샷)', () => {
    expect(frames[1].view.hp).toEqual({ player: 100, enemy: 100 });
    expect(frames[1].view.hp).not.toBe(frames[8].view.hp);
  });
});

describe('buildFrames: 로그 문구', () => {
  const logs = buildFrames(manual, 100).map((f) => f.log);

  it('플레이어는 "플레이어"로, 합은 "n합"으로 표기한다', () => {
    expect(logs[1]).toBe('1턴: 플레이어 1스킬, 적 2스킬');
    expect(logs[2]).toBe('1합: 플레이어 위력 11(앞면 1/1), 적 위력 4(앞면 0/2). 플레이어가 우세');
    expect(logs[3]).toBe('합 종료: 플레이어가 승리, 남은 코인 3개');
    expect(logs[4]).toBe('플레이어 정신력 0 → 5 (앞면 확률 55%)');
    expect(logs[5]).toBe('플레이어 1스킬 공격: 코인 2개');
  });

  it('공격 로그는 타격이 모두 공개된 마지막 프레임에 한 줄로 남는다', () => {
    // 5: 공격 시작, 6: 첫 타격(로그 없음), 7: 마지막 타격(요약)
    expect(logs[6]).toBeNull();
    expect(logs[7]).toBe('데미지 : 29 (11+18)');
  });

  it('처치하면 요약 끝에 (처치)가 붙는다', () => {
    const frames = buildFrames(
      [
        {
          type: 'attack',
          attacker: 'player',
          tier: 3,
          coins: [true, false, false, true],
          hits: [
            { coinIndex: 0, headsSoFar: 1, power: 4, targetHpAfter: 16 },
            { coinIndex: 1, headsSoFar: 1, power: 4, targetHpAfter: 12 },
            { coinIndex: 2, headsSoFar: 1, power: 4, targetHpAfter: 8 },
            { coinIndex: 3, headsSoFar: 2, power: 8, targetHpAfter: 0 },
          ],
        },
      ],
      20,
    );
    const summaries = frames.map((f) => f.log).filter((l) => l !== null && l.startsWith('데미지'));
    expect(summaries).toEqual(['데미지 : 20 (4+4+4+8) (처치)']);
  });

  it('타격이 1번이면 괄호 안에 숫자 하나만 나온다', () => {
    const frames = buildFrames(
      [
        {
          type: 'attack',
          attacker: 'enemy',
          tier: 1,
          coins: [false],
          hits: [{ coinIndex: 0, headsSoFar: 0, power: 4, targetHpAfter: 96 }],
        },
      ],
      100,
    );
    expect(frames[frames.length - 1].log).toBe('데미지 : 4 (4)');
  });

  it('적의 공격 로그와 무승부는 "플레이어가/적이" 표기를 따른다', () => {
    const frames = buildFrames(
      [
        {
          type: 'clashRound',
          round: 2,
          player: { coins: [true], heads: 1, power: 5, coinCountAfter: 1 },
          enemy: { coins: [true], heads: 1, power: 5, coinCountAfter: 1 },
          result: 'draw',
        },
        {
          type: 'clashRound',
          round: 3,
          player: { coins: [false], heads: 0, power: 0, coinCountAfter: 0 },
          enemy: { coins: [true], heads: 1, power: 5, coinCountAfter: 1 },
          result: 'enemy',
        },
        { type: 'sanityChange', side: 'enemy', from: 0, to: 5 },
      ],
      100,
    );
    const logs = frames.map((f) => f.log);
    expect(logs[1]).toContain('2합:');
    expect(logs[1]).toMatch(/무승부$/);
    expect(logs[2]).toMatch(/적이 우세$/);
    expect(logs[3]).toBe('적 정신력 0 → 5 (앞면 확률 55%)');
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
    expect(last.log).toBe('합 종료: 합 제한 초과, 무승부');
  });

  it('턴 제한 패배는 OVER CLOCK으로 표시된다', () => {
    const frames = buildFrames(
      [{ type: 'battleEnd', winner: 'enemy', turns: MAX_TURNS_PER_BATTLE, reason: 'turnLimit' }],
      100,
    );
    const last = frames[frames.length - 1];
    expect(last.view.end?.reason).toBe('turnLimit');
    expect(last.log).toBe('OVER CLOCK');
  });

  it('처치당한 경우는 전투 패배로 표시된다', () => {
    const frames = buildFrames([{ type: 'battleEnd', winner: 'enemy', turns: 7, reason: 'kill' }], 100);
    expect(frames[frames.length - 1].log).toBe('전투 패배');
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
  it('프레임 수, 체력 변화, 종료 상태, 로그 형식이 이벤트와 일치한다', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rng = createRng(seed);
      const player = createCombatant(BASE_SKILLS, 1, rng);
      const enemy = createCombatant(BASE_SKILLS, 1, rng);
      const result = runBattle(player, enemy, rng);
      const maxHp = maxHpForFloor(1);
      const frames = buildFrames(result.events, maxHp);

      // 프레임 수 = 초기 1 + 이벤트 수 + 추가 타격 프레임 수(공격 이벤트마다 타격 수만큼)
      const attacks = result.events.filter((e) => e.type === 'attack');
      const extra = attacks.reduce((n, e) => n + e.hits.length, 0);
      expect(frames).toHaveLength(1 + result.events.length + extra);

      const last = frames[frames.length - 1].view;
      expect(last.end).toEqual({ winner: result.winner, reason: result.reason, turns: result.turns });
      if (result.reason === 'kill') {
        const loser = result.winner === 'player' ? 'enemy' : 'player';
        expect(last.hp[loser]).toBe(0);
      }

      for (const f of frames) {
        expect(f.view.hp.player).toBeGreaterThanOrEqual(0);
        expect(f.view.hp.player).toBeLessThanOrEqual(maxHp);
        expect(f.view.hp.enemy).toBeGreaterThanOrEqual(0);
        expect(f.view.hp.enemy).toBeLessThanOrEqual(maxHp);
        expect(f.delay).toBeGreaterThan(0);
      }

      // 로그가 없는 프레임: 첫 프레임과, 각 공격의 마지막 타격을 제외한 나머지 타격 프레임
      const withoutLog = frames.filter((f) => f.log === null).length;
      expect(withoutLog).toBe(1 + attacks.reduce((n, e) => n + (e.hits.length - 1), 0));

      // 공격 요약 로그의 총 데미지는 실제 체력 감소와 같다
      const summaries = frames.map((f) => f.log).filter((l): l is string => l !== null && l.startsWith('데미지'));
      expect(summaries).toHaveLength(attacks.length);
      summaries.forEach((line, i) => {
        const total = attacks[i].hits.reduce((sum, h) => sum + h.power, 0);
        expect(line.startsWith(`데미지 : ${total} (`)).toBe(true);
        const killed = attacks[i].hits[attacks[i].hits.length - 1].targetHpAfter === 0;
        expect(line.endsWith('(처치)')).toBe(killed);
      });

      // 모든 로그에서 "나/내" 대신 "플레이어"를 쓰고, "라운드" 대신 "n합"을 쓴다
      for (const f of frames) {
        if (f.log === null) continue;
        expect(f.log).not.toMatch(/(?:^|\s)(?:나|내|내가)(?:\s|$)/);
        expect(f.log).not.toContain('라운드');
      }
    }
  });
});
