import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeReward } from '../src/core/rewards';
import { advanceFloor, chooseReward, startRun, type RunState } from '../src/core/run';
import { maxHpForFloor } from '../src/data/balance';
import App from '../src/ui/App';
import { Coin, CoinRow } from '../src/ui/components/Coin';
import { SanityMeter } from '../src/ui/components/Meters';
import { formatDelta } from '../src/ui/format';
import { BattleScreen } from '../src/ui/screens/BattleScreen';
import { GameOverScreen } from '../src/ui/screens/GameOverScreen';
import { RewardScreen } from '../src/ui/screens/RewardScreen';
import { loadBest, recordBest } from '../src/ui/storage';

const noop = () => {};

/** 서버 렌더링은 이어 붙인 텍스트 사이에 <!-- --> 를 넣으므로, 문자열 비교 전에 제거한다 */
const render = (node: Parameters<typeof renderToString>[0]) =>
  renderToString(node).replaceAll('<!-- -->', '');

/** 항상 첫 번째 선택지를 골라 게임 오버가 될 때까지 진행 */
function playToGameOver(seed: number): RunState {
  let state = startRun(seed);
  for (let i = 0; i < 5000; i++) {
    if (state.phase === 'gameOver') return state;
    state = state.phase === 'reward' ? chooseReward(state, state.choices[0].id) : advanceFloor(state);
  }
  throw new Error('게임이 끝나지 않음');
}

describe('화면 렌더링 (서버 렌더링으로 크래시 없이 그려지는지 확인)', () => {
  it('앱의 첫 화면은 타이틀이다', () => {
    const html = render(<App />);
    expect(html).toContain('림버스 오토 배틀 로그라이크');
    expect(html).toContain('게임 시작');
    expect(html).toContain('이 프로젝트는 Limbus Company(Project Moon)의 2차 창작 팬 프로젝트이며 비공식입니다.');
    expect(html).toContain(
      'ProjectMoon의 공식 이미지 혹은 사운드 리소스는 사용되지 않았으며, 상업적, 영리적인 목적이 없습니다.',
    );
  });

  it('보상 선택 화면에 모든 선택지와 내 스킬이 나온다', () => {
    const state = startRun(1);
    const html = render(<RewardScreen state={state} onChoose={noop} />);
    expect(html).toContain('보상을 하나 고르세요');
    for (const reward of state.choices) expect(html).toContain(describeReward(reward));
    expect(html).toContain('플레이어 스킬');
    expect(html).not.toContain('내 스킬');
    expect((html.match(/class="reward reward--t\d"/g) ?? []).length).toBe(state.choices.length);
  });

  it('보상 선택 화면에서는 플레이어 스킬 아래에 이 층의 적 스킬이 먼저 공개된다', () => {
    const state = startRun(1);
    const html = render(<RewardScreen state={state} onChoose={noop} />);
    const playerAt = html.indexOf('플레이어 스킬');
    const enemyAt = html.indexOf('이 층의 적 스킬');
    expect(playerAt).toBeGreaterThan(-1);
    expect(enemyAt).toBeGreaterThan(playerAt);
    // 스킬 목록이 플레이어 3줄 + 적 3줄
    expect((html.match(/class="skills__row"/g) ?? []).length).toBe(6);
    expect(html).toContain(`양쪽 체력은 모두 ${maxHpForFloor(1)}입니다.`);
  });

  it('전투 화면은 재생 시작 전 상태(전투 시작)로 그려진다', () => {
    const state = chooseReward(startRun(1), startRun(1).choices[0].id);
    const html = render(
      <BattleScreen
        floor={state.floor}
        skills={state.skills}
        enemySkills={state.enemySkills}
        battle={state.battle!}
        onContinue={noop}
      />,
    );
    expect(html).toContain('자동 전투');
    expect(html).toContain('전투 시작');
    expect(html).toContain(`양쪽 체력은 ${maxHpForFloor(1)}입니다.`);
    expect(html).toContain('건너뛰기');
    expect(html).toContain('양쪽 스킬 스펙 보기');
    // 재생이 끝나기 전에는 다음 단계 버튼이 없다
    expect(html).not.toContain('다음 층으로');
    expect(html).not.toContain('결과 보기');
  });

  it('게임 오버 화면에 결과, 고른 보상, 최종 스킬이 나온다', () => {
    const state = playToGameOver(7);
    const html = render(
      <GameOverScreen state={state} best={3} newRecord={false} onRestart={noop} onQuit={noop} />,
    );
    expect(html).toContain('층 클리어');
    expect(html).toContain('최고 기록: 3층 클리어');
    expect(html).toContain('고른 보상');
    expect(html).toContain('최종 스킬');
    expect(html).toContain('다시 도전');
    expect(html).toContain(describeReward(state.history[0]));
  });

  it('새 기록이면 안내 문구가 나온다', () => {
    const state = playToGameOver(7);
    const html = render(
      <GameOverScreen state={state} best={5} newRecord onRestart={noop} onQuit={noop} />,
    );
    expect(html).toContain('새 최고 기록입니다.');
  });
});

describe('작은 컴포넌트', () => {
  it('코인은 색뿐 아니라 접근성 이름과 글자로도 앞/뒷면을 구분한다', () => {
    expect(renderToString(<Coin face="heads" />)).toContain('aria-label="앞면"');
    expect(renderToString(<Coin face="tails" />)).toContain('aria-label="뒷면"');
    expect(renderToString(<Coin face="hidden" />)).toContain('aria-label="미공개"');
  });

  it('CoinRow는 shown 개수만큼만 공개한다', () => {
    const html = renderToString(<CoinRow coins={[true, false, true]} shown={1} />);
    expect(html.match(/aria-label="앞면"/g)).toHaveLength(1);
    expect(html.match(/aria-label="미공개"/g)).toHaveLength(2);
  });

  it('정신력 표시는 앞면 확률을 함께 보여준다', () => {
    expect(render(<SanityMeter sanity={5} />)).toContain('앞면 확률 55%');
    expect(render(<SanityMeter sanity={-45} />)).toContain('앞면 확률 5%');
  });

  it('증감 숫자 표기: 음수는 수학 마이너스를 쓴다', () => {
    expect(formatDelta(3)).toBe('+3');
    expect(formatDelta(0)).toBe('+0');
    expect(formatDelta(-2)).toBe('\u22122');
  });
});

describe('최고 기록 저장', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stubStorage = () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    return store;
  };

  it('저장소를 쓸 수 없는 환경에서도 에러 없이 0을 돌려준다', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(loadBest()).toBe(0);
    expect(() => recordBest(5)).not.toThrow();
  });

  it('기존 기록보다 높을 때만 저장한다', () => {
    stubStorage();
    expect(loadBest()).toBe(0);
    recordBest(4);
    expect(loadBest()).toBe(4);
    recordBest(2);
    expect(loadBest()).toBe(4);
    recordBest(9);
    expect(loadBest()).toBe(9);
  });

  it('깨진 값이 저장되어 있어도 0으로 취급한다', () => {
    const store = stubStorage();
    store.set('limbus_battle_simulator:best-floors', 'abc');
    expect(loadBest()).toBe(0);
    store.set('limbus_battle_simulator:best-floors', '-3');
    expect(loadBest()).toBe(0);
  });
});
