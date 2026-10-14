// ============================================================
// sim/matchup.ts - 스킬 vs 스킬 합(clash) 확률을 정확하게 계산 (기본 스펙 기준)
//
// 사용법:  npx tsx sim/matchup.ts [--verify N]
//   --verify N   실제 battle.ts로 N번 돌려서 계산값과 비교 (기본: 비교 안 함)
// 수치를 바꿔 비교하는 옵션(--sanity fixed 등)은 sim/overrides.ts 참고.
//
// 정신력은 합 도중 변하지 않으므로 양측 초기 정신력(기본 0)으로 고정해 계산한다.
// 합 승자는 balance.ts 설정에 따라 정신력이 오른 뒤 공격하므로, 기대 데미지는 그 확률로 계산한다.
// ============================================================

import { createCombatant, runBattle } from '../src/core/battle';
import { createRng } from '../src/core/rng';
import type { Combatant, SkillTier } from '../src/core/types';
import { BASE_SKILLS, COIN, DECK_COMPOSITION } from '../src/data/balance';
import { computeMatchup, DECK_SIZE, TIERS, turnExpectation, winnerHeadsProb, type Matchup } from '../src/core/evaluate';
import { applyOverrides } from './overrides';

const overrides = applyOverrides();
if (overrides.length > 0) console.log(`\n[덮어쓴 값: ${overrides.join(', ')}]`);

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const cell = (s: string) => s.padStart(9);

const matrix = new Map<string, Matchup>();
for (const r of TIERS) for (const c of TIERS) matrix.set(`${r}-${c}`, computeMatchup(r, c, BASE_SKILLS, BASE_SKILLS));
const m = (r: SkillTier, c: SkillTier) => matrix.get(`${r}-${c}`)!;

const specLine = TIERS.map((t) => {
  const s = BASE_SKILLS[t];
  return `${t}스킬(기본 ${s.basePower}, 코인 ${s.coinPower}, ${s.coinCount}개)`;
}).join(' / ');
console.log(`\n기본 스펙: ${specLine}`);
console.log(
  `합 중 앞면 확률 ${COIN.baseHeadsPercent + COIN.initialSanity}%, ` +
    `승자 공격 시 앞면 확률 ${(winnerHeadsProb() * 100).toFixed(0)}% (정신력 ${COIN.sanityMode})`,
);

console.log('\n[합 승률: 행 스킬이 열 스킬을 이길 확률 (무승부는 재시도하므로 제외)]');
console.log('        ' + TIERS.map((c) => cell(`vs ${c}스킬`)).join(''));
for (const r of TIERS) {
  console.log(`${r}스킬   ` + TIERS.map((c) => cell(pct(m(r, c).winRate))).join(''));
}

console.log('\n[행이 이겼을 때 남는 코인 평균 (= 공격 횟수)]');
console.log('        ' + TIERS.map((c) => cell(`vs ${c}스킬`)).join(''));
for (const r of TIERS) {
  console.log(`${r}스킬   ` + TIERS.map((c) => cell(m(r, c).avgRemainWin.toFixed(2))).join(''));
}

console.log('\n[한 번의 맞대결에서 행 스킬 측이 입히는 기대 데미지 / 열 스킬 측이 입히는 기대 데미지]');
console.log('        ' + TIERS.map((c) => `vs ${c}스킬`.padStart(13)).join(''));
for (const r of TIERS) {
  console.log(
    `${r}스킬   ` +
      TIERS.map((c) => `${m(r, c).dmgRow.toFixed(1)} / ${m(r, c).dmgCol.toFixed(1)}`.padStart(13)).join(''),
  );
}

// 묶음 비율(3:2:1)로 가중한 평균: 상대 스킬이 묶음에서 무작위로 나온다고 보고
console.log('\n[상대 스킬이 묶음 비율(1스킬 3 : 2스킬 2 : 3스킬 1)대로 나올 때, 각 스킬의 평균]');
console.log('스킬      합 승률   기대 데미지(입힘)   기대 데미지(받음)');
for (const r of TIERS) {
  let win = 0;
  let dealt = 0;
  let taken = 0;
  for (const c of TIERS) {
    const w = DECK_COMPOSITION[c] / DECK_SIZE;
    win += w * m(r, c).winRate;
    dealt += w * m(r, c).dmgRow;
    taken += w * m(r, c).dmgCol;
  }
  console.log(
    `${r}스킬   ${pct(win).padStart(8)}   ${dealt.toFixed(1).padStart(14)}   ${taken.toFixed(1).padStart(16)}`,
  );
}
const turn = turnExpectation(BASE_SKILLS, BASE_SKILLS);
console.log(
  `\n한 턴에 한쪽이 입히는 평균 기대 데미지(양측 동일 스펙): ${turn.dealt.toFixed(1)} (양측 합산 ${(turn.dealt * 2).toFixed(1)})`,
);

// ---- 실제 battle.ts로 검증 ----
const verifyIdx = process.argv.indexOf('--verify');
if (verifyIdx >= 0) {
  const n = Number(process.argv[verifyIdx + 1] ?? 100000);
  console.log(`\n[검증] 실제 battle.ts로 매치업당 ${n}번 실행해 합 결과를 계산값과 비교`);
  console.log('매치업    계산 승률  실측 승률   계산 남은코인  실측 남은코인');
  let worst = 0;
  for (const r of TIERS) {
    for (const c of TIERS) {
      let wins = 0;
      let remainSum = 0;
      for (let seed = 1; seed <= n; seed++) {
        const rng = createRng(seed * 7919 + r * 31 + c);
        // 체력 1이라 첫 공격으로 전투가 끝난다 → 1턴의 합 결과만 관찰
        const mk = (tier: SkillTier): Combatant => ({
          ...createCombatant(BASE_SKILLS, 1, rng),
          maxHp: 1,
          hp: 1,
          deck: [tier],
        });
        const result = runBattle(mk(r), mk(c), rng);
        const end = result.events.find((e) => e.type === 'clashEnd')!;
        if (end.type === 'clashEnd' && end.winner === 'player') {
          wins++;
          remainSum += end.remainingCoins;
        }
      }
      const exp = m(r, c);
      const rate = wins / n;
      const remain = wins > 0 ? remainSum / wins : 0;
      worst = Math.max(worst, Math.abs(rate - exp.winRate));
      console.log(
        `${r}스킬 vs ${c}스킬  ${pct(exp.winRate).padStart(8)}  ${pct(rate).padStart(8)}   ` +
          `${exp.avgRemainWin.toFixed(3).padStart(12)}  ${remain.toFixed(3).padStart(12)}`,
      );
    }
  }
  console.log(`최대 승률 오차: ${(worst * 100).toFixed(2)}%p`);
}
console.log();
