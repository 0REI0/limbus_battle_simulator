import { describe, expect, it } from 'vitest';
import { runBattle } from '../src/core/battle';
import {
  attackHeadsProbability,
  clashDistribution,
  computeMatchup,
  expectedAttackDamage,
  sanityAtClash,
  specValue,
  sum,
  turnExpectation,
} from '../src/core/evaluate';
import { createRng } from '../src/core/rng';
import type { SkillStats, SkillTier } from '../src/core/types';
import { COIN, baseSanityRules } from '../src/data/balance';
import { makeCombatant, skillSet, skillStats, specOf, uniformSkills } from './helpers';

const stat = (basePower: number, coinPower: number, coinCount: number, sanityOnUse = 0): SkillStats =>
  skillStats({ basePower, coinPower, coinCount, sanityOnUse });

/** 1/2/3스킬이 다른 기본 스펙 (스킬 하나만 바꿔서 비교하기 쉽게) */
const baseSkills = () => skillSet({ 1: stat(4, 7, 1), 2: stat(4, 5, 2), 3: stat(4, 3, 3) });

describe('clashDistribution (정확한 합 확률)', () => {
  it('항상 이기는 쪽이 남은 코인과 함께 이긴다', () => {
    // A 위력 10 고정(코인 1개), B 위력 1 고정(코인 2개): B가 2번 져서 코인 0, A는 1개 남음
    const dist = clashDistribution(stat(10, 0, 1), stat(1, 0, 2), 0.5);
    expect(dist.a[1]).toBeCloseTo(1);
    expect(sum(dist.b)).toBeCloseTo(0);
  });

  it('무승부는 제외하고 다시 굴린 것으로 계산한다', () => {
    // A: 앞면이면 2, 뒷면이면 0 / B: 앞면이면 1, 뒷면이면 0
    // A승 0.5, B승 0.25, 무승부 0.25 → 무승부 제외하면 A 2/3, B 1/3
    const dist = clashDistribution(stat(0, 2, 1), stat(0, 1, 1), 0.5);
    expect(sum(dist.a)).toBeCloseTo(2 / 3);
    expect(sum(dist.b)).toBeCloseTo(1 / 3);
  });

  it('모든 경우의 확률 합은 1이다', () => {
    const dist = clashDistribution(stat(4, 5, 2), stat(6, 4, 2), 0.5);
    expect(sum(dist.a) + sum(dist.b)).toBeCloseTo(1);
  });

  it('양쪽의 앞면 확률이 다르면 앞면이 잘 나오는 쪽이 유리하다 (코인 위력이 양수일 때)', () => {
    const coin = stat(0, 5, 1); // 앞면이면 5, 뒷면이면 0
    const aHigher = sum(clashDistribution(coin, coin, 0.9, 0.1).a);
    const bHigher = sum(clashDistribution(coin, coin, 0.1, 0.9).a);
    expect(aHigher).toBeGreaterThan(0.85);
    expect(bHigher).toBeLessThan(0.15);
    expect(sum(clashDistribution(coin, coin, 0.5, 0.5).a)).toBeCloseTo(0.5); // 같으면 반반
    expect(aHigher + bHigher).toBeCloseTo(1); // 서로 바꾸면 대칭
  });

  it('probB를 생략하면 양쪽이 같은 확률이다', () => {
    const a = clashDistribution(stat(4, 5, 2), stat(6, 4, 2), 0.7);
    const b = clashDistribution(stat(4, 5, 2), stat(6, 4, 2), 0.7, 0.7);
    expect(a).toEqual(b);
  });
});

describe('expectedAttackDamage (마이너스 코인 포함)', () => {
  it('코인 위력이 양수면 기존 닫힌 식과 같다', () => {
    // 코인 1개: 4 + 7 * 0.5 = 7.5
    expect(expectedAttackDamage(stat(4, 7, 1), 1, 0.5)).toBeCloseTo(7.5);
    // 코인 r개: r*base + coinPower*p*r(r+1)/2 → 2*4 + 5*0.5*3 = 15.5
    expect(expectedAttackDamage(stat(4, 5, 2), 2, 0.5)).toBeCloseTo(15.5);
  });

  it('위력이 0에서 잘리는 경우를 정확히 계산한다', () => {
    // 기본 3, 코인 -2, 코인 3개, 앞면 확률 50%
    // 1번째: 3(50%) / 1(50%) → 2.0
    // 2번째: 3(25%) / 1(50%) / 0(25%, 3-4=-1이 0으로) → 1.25
    // 3번째: 3(12.5%) / 1(37.5%) / 0 / 0 → 0.75
    expect(expectedAttackDamage(stat(3, -2, 3), 3, 0.5)).toBeCloseTo(4.0);
  });

  it('모두 앞면이 나오는 극단에서도 음수가 되지 않는다', () => {
    // 앞면 확률 100%: 3-2=1, 3-4→0, 3-6→0 → 합 1
    expect(expectedAttackDamage(stat(3, -2, 3), 3, 1)).toBeCloseTo(1);
    expect(expectedAttackDamage(stat(0, -5, 4), 4, 0.5)).toBeGreaterThanOrEqual(0);
  });
});

describe('마이너스 코인이 있는 합 확률', () => {
  it('위력이 항상 0으로 잘리는 쪽은 위력이 양수인 쪽에게 항상 진다', () => {
    // A: 기본 0, 코인 -5 → 위력은 항상 0 / B: 위력 1 고정
    const dist = clashDistribution(stat(0, -5, 1), stat(1, 0, 1), 0.5);
    expect(sum(dist.b)).toBeCloseTo(1);
    expect(sum(dist.a)).toBeCloseTo(0);
  });

  it('앞면이 나오면 오히려 불리해진다 (앞면 확률이 높을수록 승률이 낮다)', () => {
    const negative = stat(6, -4, 1); // 뒷면 6 / 앞면 2
    const fixed = stat(4, 0, 1);
    const lowHeads = sum(clashDistribution(negative, fixed, 0.1).a);
    const highHeads = sum(clashDistribution(negative, fixed, 0.9).a);
    expect(lowHeads).toBeGreaterThan(highHeads);
  });
});

describe('정신력 모델: 스킬 사용 정신력과 합 승리 정신력', () => {
  it('합 직전 정신력 = 시작 정신력 + 스킬의 사용 시 정신력 (범위 제한)', () => {
    expect(sanityAtClash(stat(4, 5, 2))).toBe(COIN.initialSanity);
    expect(sanityAtClash(stat(4, 5, 2, 10))).toBe(COIN.initialSanity + 10);
    expect(sanityAtClash(stat(4, 5, 2, -7))).toBe(COIN.initialSanity - 7);
    expect(sanityAtClash(stat(4, 5, 2, 999))).toBe(COIN.sanityMax);
    expect(sanityAtClash(stat(4, 5, 2, -999))).toBe(COIN.sanityMin);
  });

  it('정신력 고정 모드에서는 스킬 사용 정신력이 무시된다', () => {
    const original = COIN.sanityMode;
    COIN.sanityMode = 'fixed';
    try {
      expect(sanityAtClash(stat(4, 5, 2, 30))).toBe(COIN.initialSanity);
      expect(attackHeadsProbability(stat(4, 5, 2, 30), { sanityOnClashWin: 20, sanityOnClashLose: 0 })).toBeCloseTo(0.5);
    } finally {
      COIN.sanityMode = original;
    }
  });

  it('공격 앞면 확률 = 합 직전 정신력 + 합 승리 정신력 증감', () => {
    const rules = { sanityOnClashWin: 5, sanityOnClashLose: 0 };
    expect(attackHeadsProbability(stat(4, 5, 2), rules)).toBeCloseTo(0.55);
    expect(attackHeadsProbability(stat(4, 5, 2, 10), rules)).toBeCloseTo(0.65); // 10 + 5
    expect(attackHeadsProbability(stat(4, 5, 2), { ...rules, sanityOnClashWin: -10 })).toBeCloseTo(0.4);
    expect(attackHeadsProbability(stat(4, 5, 2, 40), { ...rules, sanityOnClashWin: 40 })).toBeCloseTo(0.95); // 범위 제한
  });

  it('사용 시 정신력이 높은 스킬은 같은 스펙의 스킬보다 합에서 유리하다', () => {
    const plain = specOf(baseSkills());
    const boosted = specOf(skillSet({ 1: stat(4, 7, 1), 2: stat(4, 5, 2, 15), 3: stat(4, 3, 3) }));
    // 같은 스펙끼리는 반반
    expect(computeMatchup(2, 2, plain, plain).winRate).toBeCloseTo(0.5);
    // 2스킬에 사용 시 정신력 +15가 있으면 앞면이 더 잘 나와 이긴다
    expect(computeMatchup(2, 2, boosted, plain).winRate).toBeGreaterThan(0.55);
    expect(computeMatchup(2, 2, plain, boosted).winRate).toBeLessThan(0.45);
  });

  it('사용 시 정신력이 마이너스면 합에서 불리해진다', () => {
    const plain = specOf(baseSkills());
    const drained = specOf(skillSet({ 1: stat(4, 7, 1), 2: stat(4, 5, 2, -15), 3: stat(4, 3, 3) }));
    expect(computeMatchup(2, 2, drained, plain).winRate).toBeLessThan(0.45);
  });

  it('합 승리 정신력은 합 승률을 바꾸지 않고, 이겼을 때의 기대 데미지만 키운다', () => {
    const skills = baseSkills();
    const low = specOf(skills, { sanityOnClashWin: 0 });
    const high = specOf(skills, { sanityOnClashWin: 30 });
    const a = computeMatchup(3, 2, low, low);
    const b = computeMatchup(3, 2, high, low);
    expect(b.winRate).toBeCloseTo(a.winRate);
    expect(b.dmgRow).toBeGreaterThan(a.dmgRow);
    expect(b.dmgCol).toBeCloseTo(a.dmgCol); // 상대(열)의 규칙은 그대로
  });
});

describe('turnExpectation', () => {
  const spec = specOf(skillSet({ 1: stat(4, 7, 1), 2: stat(4, 5, 2), 3: stat(6, 4, 2) }));

  it('같은 스펙끼리는 순이득이 0이다', () => {
    const t = turnExpectation(spec, spec);
    expect(t.net).toBeCloseTo(0);
    expect(t.dealt).toBeCloseTo(t.taken);
  });

  it('스펙이 더 좋으면 순이득이 양수다', () => {
    const better = specOf(skillSet({ ...spec.skills, 3: stat(9, 4, 2) }));
    expect(turnExpectation(better, spec).net).toBeGreaterThan(0);
    expect(turnExpectation(spec, better).net).toBeLessThan(0);
  });
});

describe('computeMatchup 캐시', () => {
  const spec = specOf(baseSkills());

  it('같은 입력이면 같은 결과를 돌려준다', () => {
    expect(computeMatchup(2, 3, spec, spec)).toEqual(computeMatchup(2, 3, spec, spec));
  });

  it('캐시에서 꺼낸 값이 새로 계산한 값과 같다 (스펙이 바뀌면 다른 값이 나온다)', () => {
    const before = computeMatchup(1, 2, spec, spec);
    const changed = specOf(skillSet({ ...spec.skills, 1: stat(9, 7, 1) }));
    const after = computeMatchup(1, 2, changed, spec);
    expect(after.winRate).toBeGreaterThan(before.winRate);
    // 원래 스펙으로 다시 계산해도 처음과 같다
    expect(computeMatchup(1, 2, spec, spec)).toEqual(before);
  });

  it('사용 시 정신력이나 합 승리 정신력이 다르면 서로 다른 캐시 항목으로 취급한다', () => {
    const plain = computeMatchup(2, 2, spec, spec);
    const useBoost = computeMatchup(2, 2, specOf(skillSet({ ...spec.skills, 2: stat(4, 5, 2, 20) })), spec);
    const winBoost = computeMatchup(2, 2, specOf(spec.skills, { sanityOnClashWin: 25 }), spec);
    expect(useBoost.winRate).not.toBeCloseTo(plain.winRate);
    expect(winBoost.dmgRow).toBeGreaterThan(plain.dmgRow);
    // 처음 값이 오염되지 않았다
    expect(computeMatchup(2, 2, spec, spec)).toEqual(plain);
  });

  it('정신력 설정(시작 정신력)이 바뀌면 캐시가 무효화되어 새 설정으로 계산된다', () => {
    const original = COIN.initialSanity;
    try {
      const before = computeMatchup(3, 2, spec, spec);
      COIN.initialSanity = 20; // 양쪽 앞면 확률이 70%가 되어 공격 코인의 기대 데미지가 커진다
      const after = computeMatchup(3, 2, spec, spec);
      expect(after.dmgRow).toBeGreaterThan(before.dmgRow);
    } finally {
      COIN.initialSanity = original;
    }
  });
});

describe('specValue', () => {
  const base = specOf(baseSkills());

  it('기준 스펙과 같으면 0, 더 강하면 양수, 더 약하면 음수다', () => {
    expect(specValue(base, base)).toBeCloseTo(0);
    expect(specValue(specOf(skillSet({ ...base.skills, 2: stat(6, 5, 2) })), base)).toBeGreaterThan(0);
    expect(specValue(specOf(skillSet({ ...base.skills, 2: stat(2, 5, 2) })), base)).toBeLessThan(0);
  });

  it('turnExpectation의 순이득과 같은 값이다', () => {
    const better = specOf(skillSet({ ...base.skills, 1: stat(4, 7, 2) }));
    expect(specValue(better, base)).toBeCloseTo(turnExpectation(better, base).net);
  });

  it('사용 시 정신력(+)과 합 승리 정신력(+)은 가치를 올리고, 사용 시 정신력(-)은 가치를 내린다', () => {
    const plus = specOf(skillSet({ ...base.skills, 2: stat(4, 5, 2, 15) }));
    const minus = specOf(skillSet({ ...base.skills, 2: stat(4, 5, 2, -15) }));
    const win = specOf(base.skills, { sanityOnClashWin: 20 });
    expect(specValue(plus, base)).toBeGreaterThan(0);
    expect(specValue(minus, base)).toBeLessThan(0);
    expect(specValue(win, base)).toBeGreaterThan(0);
  });

  it('[모델의 한계] 합 패배 시 정신력은 다음 턴 이후에 영향을 주므로 한 턴 모델의 가치에는 반영되지 않는다', () => {
    const lose = specOf(base.skills, { sanityOnClashLose: 30 });
    expect(specValue(lose, base)).toBeCloseTo(0);
  });
});

describe('실제 battle.ts와의 일치 (회귀 검증)', () => {
  const spec = specOf(skillSet({ 1: stat(4, 7, 1), 2: stat(4, 5, 2), 3: stat(6, 4, 2) }));

  it('2스킬 vs 3스킬 합 승률이 계산값과 같다', () => {
    const n = 20000;
    let wins = 0;
    for (let seed = 1; seed <= n; seed++) {
      const mk = (tier: SkillTier) => makeCombatant(spec.skills, 1, [tier]); // 체력 1: 첫 공격에서 종료
      const result = runBattle(mk(2), mk(3), createRng(seed));
      const end = result.events.find((e) => e.type === 'clashEnd');
      if (end?.type === 'clashEnd' && end.winner === 'player') wins++;
    }
    const expected = computeMatchup(2, 3, spec, spec).winRate;
    expect(Math.abs(wins / n - expected)).toBeLessThan(0.015);
  });

  it('스킬 사용 정신력이 한쪽에만 있을 때의 합 승률이 계산값과 같다', () => {
    // 플레이어 2스킬: 사용 시 정신력 +20 (앞면 확률 70%), 적 2스킬: 없음 (50%)
    const player = specOf(skillSet({ 1: stat(4, 7, 1), 2: stat(4, 6, 2, 20), 3: stat(4, 3, 3) }));
    const enemy = specOf(baseSkills());
    const n = 20000;
    let wins = 0;
    for (let seed = 1; seed <= n; seed++) {
      const result = runBattle(
        makeCombatant(player.skills, 1, [2]),
        makeCombatant(enemy.skills, 1, [2]),
        createRng(seed),
      );
      const end = result.events.find((e) => e.type === 'clashEnd');
      if (end?.type === 'clashEnd' && end.winner === 'player') wins++;
    }
    const expected = computeMatchup(2, 2, player, enemy).winRate;
    expect(expected).toBeGreaterThan(0.55); // 이 시나리오에서 정신력 효과가 실제로 있다
    expect(Math.abs(wins / n - expected)).toBeLessThan(0.015);
  });

  it('사용 시 정신력과 합 승리 정신력이 섞인 매치업의 첫 턴 기대 데미지가 계산값과 같다', () => {
    const playerSkills = skillSet({ 1: stat(4, 6, 2, 10), 2: stat(4, 5, 2), 3: stat(4, 3, 3) });
    const enemySkills = skillSet({ 1: stat(4, 7, 1), 2: stat(5, 4, 3, -10), 3: stat(4, 3, 3) });
    const playerRules = { sanityOnClashWin: 12 };
    const enemyRules = { sanityOnClashWin: -6 };
    const player = specOf(playerSkills, playerRules);
    const enemy = specOf(enemySkills, enemyRules);

    // 체력을 충분히 크게 줘서 첫 턴의 공격이 잘리지 않게 하고, 첫 공격의 데미지 합을 모은다
    const n = 5000;
    let total = 0;
    for (let seed = 1; seed <= n; seed++) {
      const result = runBattle(
        makeCombatant(playerSkills, 5000, [1], playerRules),
        makeCombatant(enemySkills, 5000, [2], enemyRules),
        createRng(seed),
      );
      const firstAttack = result.events.find((e) => e.type === 'attack');
      if (firstAttack?.type === 'attack') total += firstAttack.hits.reduce((sum, h) => sum + h.power, 0);
    }
    // 첫 턴에는 한쪽만 공격하므로, 기대 데미지 = (플레이어가 입히는 몫) + (적이 입히는 몫)
    const m = computeMatchup(1, 2, player, enemy);
    expect(Math.abs(total / n - (m.dmgRow + m.dmgCol))).toBeLessThan(0.4);
  });

  it('기본 규칙(baseSanityRules)이 모델과 battle.ts에서 같게 쓰인다', () => {
    expect(baseSanityRules()).toEqual({
      sanityOnClashWin: COIN.sanityOnClashWin,
      sanityOnClashLose: COIN.sanityOnClashLose,
    });
    expect(uniformSkills({ basePower: 1, coinPower: 0, coinCount: 1 })[1].sanityOnUse).toBe(0);
  });
});
