// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runBattle } from '../src/core/battle';
import { createRng } from '../src/core/rng';
import { chooseReward, startRun } from '../src/core/run';
import { DELAY } from '../src/ui/playback';
import App from '../src/ui/App';
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

describe('실제 클릭 흐름 (jsdom)', () => {
  it('타이틀에서 게임 시작을 누르면 보상 선택 화면이 나온다', () => {
    render(<App />);
    click('게임 시작');
    expect(screen.getByText('보상을 하나 고르세요')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^등급 \d:/ }).length).toBe(3);
  });

  it('보상을 고르면 전투 화면으로 넘어가고, 건너뛰기를 누르면 다음 단계 버튼이 나온다', () => {
    render(<App />);
    click('게임 시작');
    fireEvent.click(screen.getAllByRole('button', { name: /^등급 \d:/ })[0]);

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

      const choices = screen.queryAllByRole('button', { name: /^등급 \d:/ });
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
      const choices = screen.queryAllByRole('button', { name: /^등급 \d:/ });
      if (choices.length > 0) fireEvent.click(choices[0]);
      else {
        click('건너뛰기');
        fireEvent.click(screen.getByRole('button', { name: /다음 층으로|결과 보기/ }));
      }
    }

    click('다시 도전');
    expect(screen.getByText('보상을 하나 고르세요')).toBeTruthy();

    // 이번 판은 바로 끝내지 않고 타이틀로 나가본다: 게임 오버까지 다시 진행한 뒤 처음으로
    for (let guard = 0; guard < 500 && !screen.queryByRole('button', { name: '처음으로' }); guard++) {
      const choices = screen.queryAllByRole('button', { name: /^등급 \d:/ });
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

describe('전투 재생 (가짜 타이머)', () => {
  const setup = () => {
    const picked = startRun(1);
    const state = chooseReward(picked, picked.choices[0].id);
    return (
      <BattleScreen
        floor={state.floor}
        skills={state.skills}
        enemySkills={state.enemySkills}
        battle={state.battle!}
        onContinue={() => {}}
      />
    );
  };

  it('시간이 지나면 프레임이 하나씩 진행된다', () => {
    vi.useFakeTimers();
    render(setup());
    expect(screen.getByText('전투 시작')).toBeTruthy();

    // 첫 프레임(전투 시작)이 끝나면 1턴 스킬 공개
    act(() => {
      vi.advanceTimersByTime(DELAY.ready);
    });
    expect(screen.getByText('1턴')).toBeTruthy();
  });

  it('배속을 올리면 같은 시간에 더 빨리 진행된다', () => {
    vi.useFakeTimers();
    render(setup());
    click('4배속');
    expect(screen.getByRole('button', { name: '4배속' }).getAttribute('aria-pressed')).toBe('true');

    // 1배속이면 DELAY.ready(600ms)가 지나야 넘어가지만 4배속은 150ms면 충분
    act(() => {
      vi.advanceTimersByTime(DELAY.ready / 4);
    });
    expect(screen.getByText('1턴')).toBeTruthy();
  });

  it('다시 보기를 누르면 처음부터 재생한다', () => {
    render(setup());
    click('건너뛰기');
    expect(screen.getByRole('button', { name: '다시 보기' })).toBeTruthy();

    click('다시 보기');
    expect(screen.getByText('전투 시작')).toBeTruthy();
    expect(screen.getByRole('button', { name: '건너뛰기' })).toBeTruthy();
  });

  it('끝까지 재생하면 전투 기록에 결과가 남는다', () => {
    render(setup());
    click('건너뛰기');
    const log = screen.getByRole('list', { name: '전투 기록' });
    const lines = Array.from(log.querySelectorAll('li')).map((li) => li.textContent);
    expect(lines.length).toBeGreaterThan(3);
    expect(lines[0]).toContain('1턴');
    expect(lines[lines.length - 1]).toMatch(/승리|쓰러졌습니다|패배/);
  });
});

describe('마이너스 코인 위력 표시', () => {
  it('합 계산식에 부호가 바르게 표시되고, 스킬 스펙에도 "+-"가 나오지 않는다', () => {
    vi.useFakeTimers();
    const negative = uniformSkills({ basePower: 3, coinPower: -2, coinCount: 3 });
    const steady = uniformSkills({ basePower: 1, coinPower: 0, coinCount: 1 });
    const battle = runBattle(makeCombatant(negative, 50), makeCombatant(steady, 50), createRng(1));

    render(
      <BattleScreen floor={1} skills={negative} enemySkills={steady} battle={battle} onContinue={() => {}} />,
    );
    // 전투 시작(ready) → 스킬 공개(skills) → 첫 합(clash) 프레임까지 진행.
    // act 한 번에 프레임이 하나씩만 넘어가므로 프레임마다 따로 진행한다
    act(() => {
      vi.advanceTimersByTime(DELAY.ready);
    });
    act(() => {
      vi.advanceTimersByTime(DELAY.skills);
    });

    expect(screen.getAllByText(/3 \u2212 2×\d/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain('+-');
    expect(document.body.textContent).not.toContain('+\u2212');
    // 스킬 스펙 표기: 코인 −2
    expect(document.body.textContent).toContain('코인 \u22122');
  });
});
