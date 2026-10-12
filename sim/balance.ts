// ============================================================
// sim/balance.ts - 밸런스 시뮬레이터 (Node에서 실행)
//
// 사용법:  npx tsx sim/balance.ts [옵션]
//   --runs N          정책당 판 수 (기본 2000)
//   --seed N          기준 시드 (기본 1)
//   --max-floor N     이 층을 클리어하면 중단 (기본 50)
//   --policy NAME     특정 정책만 (기본: 전부)
//
// balance.ts를 고치지 않고 수치를 바꿔 비교해볼 수 있는 옵션:
//   --picks N         층당 보상 선택 횟수
//   --choices N       선택지 개수
//   --weights A,B,C   보상 티어 가중치 (예: 60,30,10)
//   --sanity MODE     dynamic | fixed
//   --sanity-win N    합 승리 시 정신력 증가량
// ============================================================

import { COIN, REWARD_TIER_WEIGHTS, REWARDS } from '../src/data/balance';
import { POLICIES } from './policies';
import { simulate, type SimStats } from './simulate';

const argv = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const numArg = (name: string): number | undefined => {
  const v = arg(name);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`--${name} 값이 숫자가 아님: ${v}`);
  return n;
};

// ---- 수치 덮어쓰기 (실행 중에만 적용, 파일은 바뀌지 않음) ----
const overrides: string[] = [];
const picks = numArg('picks');
if (picks !== undefined) {
  REWARDS.picksPerFloor = picks;
  overrides.push(`picks=${picks}`);
}
const choices = numArg('choices');
if (choices !== undefined) {
  REWARDS.choicesPerPick = choices;
  overrides.push(`choices=${choices}`);
}
const weights = arg('weights');
if (weights !== undefined) {
  const w = weights.split(',').map(Number);
  if (w.length !== 3 || w.some((x) => !Number.isFinite(x) || x < 0)) {
    throw new Error('--weights는 "60,30,10" 형식이어야 함');
  }
  REWARD_TIER_WEIGHTS[1] = w[0];
  REWARD_TIER_WEIGHTS[2] = w[1];
  REWARD_TIER_WEIGHTS[3] = w[2];
  overrides.push(`weights=${weights}`);
}
const sanity = arg('sanity');
if (sanity !== undefined) {
  if (sanity !== 'dynamic' && sanity !== 'fixed') throw new Error('--sanity는 dynamic | fixed');
  COIN.sanityMode = sanity;
  overrides.push(`sanity=${sanity}`);
}
const sanityWin = numArg('sanity-win');
if (sanityWin !== undefined) {
  COIN.sanityOnClashWin = sanityWin;
  overrides.push(`sanity-win=${sanityWin}`);
}

// ---- 실행 ----
const runs = numArg('runs') ?? 2000;
const seed = numArg('seed') ?? 1;
const maxFloor = numArg('max-floor') ?? 50;
const only = arg('policy');
const policies = only ? POLICIES.filter((p) => p.name === only) : POLICIES;
if (policies.length === 0) {
  throw new Error(`알 수 없는 정책: ${only} (가능: ${POLICIES.map((p) => p.name).join(', ')})`);
}

console.log(`\n밸런스 시뮬레이션: 정책당 ${runs}판, 시드 ${seed}, 최대 ${maxFloor}층`);
console.log(
  `설정: 층당 보상 ${REWARDS.picksPerFloor}회, 선택지 ${REWARDS.choicesPerPick}개, ` +
    `티어 가중치 ${REWARD_TIER_WEIGHTS[1]}/${REWARD_TIER_WEIGHTS[2]}/${REWARD_TIER_WEIGHTS[3]}, ` +
    `정신력 ${COIN.sanityMode}(+${COIN.sanityOnClashWin})` +
    (overrides.length > 0 ? `  [덮어쓴 값: ${overrides.join(', ')}]` : ''),
);

const started = Date.now();
const results: SimStats[] = policies.map((p) => simulate(p, { runs, seed, maxFloor }));
const seconds = ((Date.now() - started) / 1000).toFixed(1);

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

console.log('\n[클리어한 층 수]');
console.log(
  'policy'.padEnd(11) +
    ['avg', 'median', 'p90', 'max', '>=5F', '>=10F', 'turns', 'TL%']
      .map((h) => h.padStart(8))
      .join(''),
);
for (const r of results) {
  console.log(
    r.policy.padEnd(11) +
      [
        r.avgCleared.toFixed(2),
        String(r.median),
        String(r.p90),
        String(r.max),
        pct(r.shareAtLeast5),
        pct(r.shareAtLeast10),
        r.avgTurns.toFixed(1),
        pct(r.turnLimitRunRate),
      ]
        .map((c) => c.padStart(8))
        .join(''),
  );
}

const SHOWN_FLOORS = 10;
console.log(`\n[층별 클리어율: 그 층에 도달한 판 중 승리한 비율 (도달 20판 미만은 -)]`);
console.log(
  'policy'.padEnd(11) +
    Array.from({ length: SHOWN_FLOORS }, (_, i) => `F${i + 1}`)
      .map((h) => h.padStart(6))
      .join(''),
);
for (const r of results) {
  const cells = Array.from({ length: SHOWN_FLOORS }, (_, i) => {
    const f = i + 1;
    return r.floorAttempts[f] >= 20 ? `${Math.round((r.floorWins[f] / r.floorAttempts[f]) * 100)}%` : '-';
  });
  console.log(r.policy.padEnd(11) + cells.map((c) => c.padStart(6)).join(''));
}

console.log('\n[정책 설명]');
for (const p of policies) console.log(`  ${p.name.padEnd(10)} ${p.description}`);

const capped = results.filter((r) => r.cappedRuns > 0);
if (capped.length > 0) {
  console.log(
    `\n※ ${maxFloor}층 도달로 중단된 판: ` + capped.map((r) => `${r.policy} ${r.cappedRuns}판`).join(', '),
  );
}
console.log(`\n(소요 시간 ${seconds}초)\n`);
