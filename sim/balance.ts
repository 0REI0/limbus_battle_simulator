// ============================================================
// sim/balance.ts - 밸런스 시뮬레이터 (Node에서 실행)
//
// 사용법:  npx tsx sim/balance.ts [옵션]
//   --runs N          정책당 판 수 (기본 2000)
//   --seed N          기준 시드 (기본 1)
//   --max-floor N     이 층을 클리어하면 중단 (기본 50)
//   --policy NAME     특정 정책만 (기본: 전부)
// 수치를 바꿔 비교하는 옵션(--picks, --choices 등)은 sim/overrides.ts 참고.
// ============================================================

import { applyOverrides, arg, describeSettings, numArg } from './overrides';
import { POLICIES } from './policies';
import { simulate, type SimStats } from './simulate';

const overrides = applyOverrides();

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
  `설정: ${describeSettings()}` + (overrides.length > 0 ? `  [덮어쓴 값: ${overrides.join(', ')}]` : ''),
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
