// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState, type ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runBattle } from '../src/core/battle';
import { createRng } from '../src/core/rng';
import { chooseReward, startRun } from '../src/core/run';
import type { BattleEvent, BattleResult } from '../src/core/types';
import App from '../src/ui/App';
import { DELAY } from '../src/ui/playback';
import { BattleScreen } from '../src/ui/screens/BattleScreen';
import { loadBest } from '../src/ui/storage';
import { makeCombatant, uniformSkills } from './helpers';

beforeEach(() => {
  window.scrollTo = vi.fn();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const $ = (selector: string) => document.querySelector(selector)!;
const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const REWARD_BUTTON = /^등급 \d:/;

/** 배속 상태를 부모가 들고 있는 구조라, 전투 화면만 따로 테스트할 때는 상태를 가진 감싸개가 필요하다 */
function Battle(props: Omit<ComponentProps<typeof BattleScreen>, 'speed' | 'onSpeedChange' | 'onContinue'>) {
  const [speed, setSpeed] = useState(1);
  return <BattleScreen {...props} speed={speed} onSpeedChange={setSpeed} onContinue={() => {}} />;
}

/** 실제 전투 1판 */
function realBattle() {
  const picked = startRun(1);
  const state = chooseReward(picked, picked.choices[0].id);
  return (
    <Battle
      floor={state.floor}
      skills={state.skills}
      enemySkills={state.enemySkills}
      battle={state.battle!}
    />
  );
}

/** 손으로 만든 이벤트로 전투 결과를 만든다 */
const custom = (events: BattleEvent[]): BattleResult => ({ winner: 'player', reason: 'kill', turns: 1, events });
const turnStart = (turn: number, playerTier: 1 | 2 | 3, enemyTier: 1 | 2 | 3): BattleEvent => ({
  type: 'turnStart',
  turn,
  playerTier,
  enemyTier,
});

const specs = uniformSkills({ basePower: 4, coinPower: 3, coinCount: 2 });

describe('실제 클릭 흐름 (jsdom)', () => {
  it('타이틀에서 게임 시작을 누르면 보상 선택 화면이 나온다', () => {
    render(<App />);
    click('게임 시작');
    expect(screen.getByText('보상을 하나 고르세요')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: REWARD_BUTTON }).length).toBe(3);
  });

  it('보상을 고르면 전투 화면으로 넘어가고, 건너뛰기를 누르면 다음 단계 버튼이 나온다', () => {
    render(<App />);
    click('게임 시작');
    fireEvent.click(screen.getAllByRole('button', { name: REWARD_BUTTON })[0]);

    expect(screen.getByText('자동 전투')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /다음 층으로|결과 보기/ })).toBeNull();

    click('건너뛰기');
    expect(screen.getByRole('button', { name: /다음 층으로|결과 보기/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: '다시 보기' })).toBeTruthy();
  });

  it('처음부터 게임 오버까지 클릭만으로 진행되고, 최고 기록이 저장된다', () => {
    render(<App />);
    click('게임 시작');

    let floorsWon = 0;
    for (let guard = 0; guard < 500; guard++) {
      if (screen.queryByRole('button', { name: '다시 도전' })) break;

      const choices = screen.queryAllByRole('button', { name: REWARD_BUTTON });
      if (choices.length > 0) {
        fireEvent.click(choices[0]);
        continue;
      }
      click('건너뛰기');
      if (screen.queryByRole('button', { name: '다음 층으로' })) floorsWon++;
      fireEvent.click(screen.getByRole('button', { name: /다음 층으로|결과 보기/ }));
    }

    expect(screen.getByRole('button', { name: '다시 도전' })).toBeTruthy();
    expect(screen.getByText('고른 보상')).toBeTruthy();
    // 최고 기록은 클리어한 층 수와 같게 저장된다 (0층이면 저장하지 않음)
    expect(loadBest()).toBe(floorsWon);
  });

  it('게임 오버 후 다시 도전하면 새 판이 시작되고, 처음으로를 누르면 타이틀로 돌아간다', () => {
    render(<App />);
    click('게임 시작');
    for (let guard = 0; guard < 500 && !screen.queryByRole('button', { name: '다시 도전' }); guard++) {
      const choices = screen.queryAllByRole('button', { name: REWARD_BUTTON });
      if (choices.length > 0) fireEvent.click(choices[0]);
      else {
        click('건너뛰기');
        fireEvent.click(screen.getByRole('button', { name: /다음 층으로|결과 보기/ }));
      }
    }

    click('다시 도전');
    expect(screen.getByText('보상을 하나 고르세요')).toBeTruthy();

    for (let guard = 0; guard < 500 && !screen.queryByRole('button', { name: '처음으로' }); guard++) {
      const choices = screen.queryAllByRole('button', { name: REWARD_BUTTON });
      if (choices.length > 0) fireEvent.click(choices[0]);
      else {
        click('건너뛰기');
        fireEvent.click(screen.getByRole('button', { name: /다음 층으로|결과 보기/ }));
      }
    }
    click('처음으로');
    expect(screen.getByRole('button', { name: '게임 시작' })).toBeTruthy();
  });
});

describe('보상 선택 화면 레이아웃', () => {
  it('플레이어 스킬과 적 스킬이 좌우로 나란히 놓인다', () => {
    render(<App />);
    click('게임 시작');

    const panels = document.querySelectorAll('.duo > .panel');
    expect(panels).toHaveLength(2);
    expect(panels[0].textContent).toContain('플레이어 스킬');
    expect(panels[1].textContent).toContain('이 층의 적 스킬');
    expect(panels[0].querySelectorAll('.skills__row')).toHaveLength(3);
    expect(panels[1].querySelectorAll('.skills__row')).toHaveLength(3);
    // 보상 선택 화면에서는 "남은 수"를 보여주지 않는다
    expect(document.querySelector('.skills__remain')).toBeNull();
  });

  it('힌트 문구는 스킬 박스 밖, 두 패널 아래에 있다', () => {
    render(<App />);
    click('게임 시작');

    const duo = $('.duo');
    for (const hint of [
      screen.getByText(/위력은 기본 \+ 코인 × 앞면 개수/),
      screen.getByText(/적은 보상 \d+개를 받은 상태입니다/),
    ]) {
      expect(hint.closest('.panel')).toBeNull(); // 박스 안이 아니다
      expect(duo.contains(hint)).toBe(false);
      expect(follows(duo, hint)).toBe(true); // 박스 아래에 있다
    }
  });
});

describe('전투 화면 구성', () => {
  it('배속/건너뛰기 → 체력·정신력 → 배틀 화면 → 스킬 스펙 → 다음 층 버튼 → 로그 순서로 놓인다', () => {
    render(realBattle());
    const order = ['.controls', '.fighters', '.arena', '.duo', '.continue', '.log'];
    for (let i = 0; i < order.length - 1; i++) {
      expect(follows($(order[i]), $(order[i + 1]))).toBe(true);
    }
  });

  it('체력/정신력 영역에는 사용 중인 스킬 표시가 없고, 스킬 스펙은 접히지 않는다', () => {
    render(realBattle());
    const fighters = $('.fighters');
    expect(fighters.querySelectorAll('.fighter')).toHaveLength(2);
    expect(fighters.textContent).toContain('정신력');
    expect(fighters.querySelector('.chip, .fighter__skill')).toBeNull();
    expect(document.querySelector('details')).toBeNull();
    expect($('.duo').querySelectorAll('.skills__row')).toHaveLength(6);
  });

  it('플레이어는 왼쪽, 적은 오른쪽에 놓인다 (체력 영역, 스킬 스펙)', () => {
    render(realBattle());
    const fighters = $('.fighters').querySelectorAll('.fighter');
    expect(fighters[0].classList.contains('fighter--player')).toBe(true);
    expect(fighters[1].classList.contains('fighter--enemy')).toBe(true);

    const panels = $('.duo').querySelectorAll('.panel');
    expect(panels[0].classList.contains('panel--enemy')).toBe(false);
    expect(panels[1].classList.contains('panel--enemy')).toBe(true);
  });

  it('합 단계에서 양쪽 코인이 좌우로 나란히 놓이고 같은 크기를 쓴다', () => {
    vi.useFakeTimers();
    render(realBattle());
    act(() => void vi.advanceTimersByTime(DELAY.ready));
    act(() => void vi.advanceTimersByTime(DELAY.skills)); // 첫 합

    const sides = $('.arena__grid').querySelectorAll('.arena__side');
    expect(sides).toHaveLength(2);
    expect(sides[0].classList.contains('arena__side--player')).toBe(true);
    expect(sides[1].classList.contains('arena__side--enemy')).toBe(true);

    const areas = $('.arena__grid').querySelectorAll('.coin-area');
    expect(areas).toHaveLength(2);
    expect(areas[0].className).toBe(areas[1].className); // 같은 크기 → 높이가 같다
  });

  it('공격 단계에서는 공격하는 쪽 칸에만 코인이 나오고 반대쪽은 자리만 유지한다', () => {
    vi.useFakeTimers();
    const hits = [
      { coinIndex: 0, headsSoFar: 1, power: 7, targetHpAfter: 93 },
      { coinIndex: 1, headsSoFar: 1, power: 7, targetHpAfter: 86 },
    ];
    const attack = (attacker: 'player' | 'enemy'): BattleEvent => ({
      type: 'attack',
      attacker,
      tier: 1,
      coins: [true, false],
      hits,
    });

    for (const attacker of ['player', 'enemy'] as const) {
      cleanup();
      render(
        <Battle floor={1} skills={specs} enemySkills={specs} battle={custom([turnStart(1, 1, 1), attack(attacker)])} />,
      );
      act(() => void vi.advanceTimersByTime(DELAY.ready));
      act(() => void vi.advanceTimersByTime(DELAY.skills)); // 공격 시작 프레임

      const [left, right] = Array.from($('.arena__grid').children).slice(1); // 0번째는 캡션
      const attackerSide = attacker === 'player' ? left : right;
      const idleSide = attacker === 'player' ? right : left;
      expect(attackerSide.querySelector('.coin-area')).not.toBeNull();
      expect(idleSide.querySelector('.coin-area')).toBeNull();
      expect(idleSide.classList.contains('arena__side--idle')).toBe(true);
    }
  });

  it('재생이 끝나기 전에는 비활성 버튼이 자리를 지키고, 끝나면 다음 단계 버튼으로 바뀐다', () => {
    render(realBattle());
    const waiting = screen.getByRole('button', { name: '전투 진행 중' });
    expect((waiting as HTMLButtonElement).disabled).toBe(true);
    expect($('.continue').contains(waiting)).toBe(true);

    click('건너뛰기');
    expect(screen.queryByRole('button', { name: '전투 진행 중' })).toBeNull();
    expect($('.continue').contains(screen.getByRole('button', { name: /다음 층으로|결과 보기/ }))).toBe(true);
  });
});

describe('사용 중인 스킬 강조와 묶음 남은 수', () => {
  it('양쪽이 이번 턴에 쓰는 스킬 줄이 강조되고, 남은 수가 갱신된다', () => {
    vi.useFakeTimers();
    const battle = custom([
      turnStart(1, 1, 3),
      turnStart(2, 1, 2),
      { type: 'battleEnd', winner: 'player', turns: 2, reason: 'kill' },
    ]);
    render(<Battle floor={1} skills={specs} enemySkills={specs} battle={battle} />);

    // 시작 전: 강조 없음, 남은 수는 묶음 구성 그대로
    expect(document.querySelector('.is-active')).toBeNull();
    const remainTexts = () => Array.from(document.querySelectorAll('.skills__remain')).map((e) => e.textContent);
    expect(remainTexts()).toEqual(['남은 3/3', '남은 2/2', '남은 1/1', '남은 3/3', '남은 2/2', '남은 1/1']);

    // 1턴: 플레이어 1스킬, 적 3스킬
    act(() => void vi.advanceTimersByTime(DELAY.ready));
    const [playerPanel, enemyPanel] = Array.from(document.querySelectorAll('.duo .panel'));
    let activePlayer = playerPanel.querySelectorAll('.is-active');
    let activeEnemy = enemyPanel.querySelectorAll('.is-active');
    expect(activePlayer).toHaveLength(1);
    expect(activeEnemy).toHaveLength(1);
    expect(activePlayer[0].textContent).toContain('1스킬');
    expect(activePlayer[0].textContent).toContain('남은 2/3'); // 1스킬 하나를 뽑았으니 2개 남음
    expect(activeEnemy[0].textContent).toContain('3스킬');
    expect(activeEnemy[0].textContent).toContain('남은 0/1');

    // 2턴: 플레이어 1스킬, 적 2스킬 → 강조가 옮겨가고 남은 수가 줄어든다
    act(() => void vi.advanceTimersByTime(DELAY.skills));
    activePlayer = playerPanel.querySelectorAll('.is-active');
    activeEnemy = enemyPanel.querySelectorAll('.is-active');
    expect(activePlayer[0].textContent).toContain('남은 1/3');
    expect(activeEnemy).toHaveLength(1);
    expect(activeEnemy[0].textContent).toContain('2스킬');
    expect(activeEnemy[0].textContent).toContain('남은 1/2');
    expect(enemyPanel.querySelectorAll('.is-active')[0].getAttribute('aria-current')).toBe('true');
  });
});

describe('재생 속도', () => {
  it('시간이 지나면 프레임이 하나씩 진행된다', () => {
    vi.useFakeTimers();
    render(realBattle());
    expect(screen.getByText('전투 시작')).toBeTruthy();

    // 첫 프레임(전투 시작)이 끝나면 1턴 스킬 공개
    act(() => void vi.advanceTimersByTime(DELAY.ready));
    expect(screen.getByText('1턴')).toBeTruthy();
  });

  it('배속을 올리면 같은 시간에 더 빨리 진행된다', () => {
    vi.useFakeTimers();
    render(realBattle());
    click('4배속');
    expect(screen.getByRole('button', { name: '4배속' }).getAttribute('aria-pressed')).toBe('true');

    // 1배속이면 DELAY.ready(600ms)가 지나야 넘어가지만 4배속은 150ms면 충분
    act(() => void vi.advanceTimersByTime(DELAY.ready / 4));
    expect(screen.getByText('1턴')).toBeTruthy();
  });

  it('선택한 배속은 다음 층에서도 유지된다', () => {
    // 1층을 이기는 판이 나올 때까지 새 게임을 시도한다 (시드가 무작위라 판마다 결과가 다르다)
    for (let attempt = 0; attempt < 40; attempt++) {
      cleanup();
      render(<App />);
      click('게임 시작');
      fireEvent.click(screen.getAllByRole('button', { name: REWARD_BUTTON })[0]);

      expect(screen.getByRole('button', { name: '1배속' }).getAttribute('aria-pressed')).toBe('true');
      click('4배속');
      click('건너뛰기');

      if (screen.queryByRole('button', { name: '다음 층으로' })) {
        click('다음 층으로');
        fireEvent.click(screen.getAllByRole('button', { name: REWARD_BUTTON })[0]); // 2층 전투 화면
        expect(screen.getByText('자동 전투')).toBeTruthy();
        expect(screen.getByRole('button', { name: '4배속' }).getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByRole('button', { name: '1배속' }).getAttribute('aria-pressed')).toBe('false');
        return;
      }
    }
    throw new Error('1층을 이기는 판을 찾지 못함');
  });

  it('다시 보기를 누르면 처음부터 재생한다', () => {
    render(realBattle());
    click('건너뛰기');
    expect(screen.getByRole('button', { name: '다시 보기' })).toBeTruthy();

    click('다시 보기');
    expect(screen.getByText('전투 시작')).toBeTruthy();
    expect(screen.getByRole('button', { name: '건너뛰기' })).toBeTruthy();
  });

  it('끝까지 재생하면 전투 기록에 결과가 남는다', () => {
    render(realBattle());
    click('건너뛰기');
    const log = screen.getByRole('list', { name: '전투 기록' });
    const lines = Array.from(log.querySelectorAll('li')).map((li) => li.textContent);
    expect(lines.length).toBeGreaterThan(3);
    expect(lines[0]).toContain('1턴');
    expect(lines[lines.length - 1]).toMatch(/전투 승리|전투 패배|OVER CLOCK/);
  });
});

describe('마이너스 코인 위력 표시', () => {
  it('합 계산식에 부호가 바르게 표시되고, 스킬 스펙에도 "+-"가 나오지 않는다', () => {
    vi.useFakeTimers();
    const negative = uniformSkills({ basePower: 3, coinPower: -2, coinCount: 3 });
    const steady = uniformSkills({ basePower: 1, coinPower: 0, coinCount: 1 });
    const battle = runBattle(makeCombatant(negative, 50), makeCombatant(steady, 50), createRng(1));

    render(<Battle floor={1} skills={negative} enemySkills={steady} battle={battle} />);
    // 전투 시작(ready) → 스킬 공개(skills) → 첫 합(clash) 프레임까지 진행.
    // act 한 번에 프레임이 하나씩만 넘어가므로 프레임마다 따로 진행한다
    act(() => void vi.advanceTimersByTime(DELAY.ready));
    act(() => void vi.advanceTimersByTime(DELAY.skills));

    expect(screen.getAllByText(/3 \u2212 2×\d/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain('+-');
    expect(document.body.textContent).not.toContain('+\u2212');
    // 스킬 스펙 표기: 코인 −2
    expect(document.body.textContent).toContain('코인 \u22122');
  });
});
