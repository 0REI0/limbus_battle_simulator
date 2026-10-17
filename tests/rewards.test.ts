import { afterEach, describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import {
  amountText,
  applyRandomRewards,
  applyReward,
  describeEffect,
  describeReward,
  formulaText,
  generateChoices,
  getRewardPool,
  pickReward,
  resolveAmount,
  rewardId,
  rollRewardTier,
} from '../src/core/rewards';
import type { Reward, RewardEffect } from '../src/core/types';
import {
  REWARD_TABLE,
  REWARD_TIERS,
  REWARD_TIER_WEIGHTS,
  REWARDS,
  base,
  baseSpec,
  count,
  lose,
  power,
  ref,
  scale,
  onUse,
  win,
} from '../src/data/balance';
import { fixedRng, skillStats } from './helpers';

const reward = (effects: Reward['effects']): Reward => ({
  id: rewardId(1, effects),
  rewardTier: 1,
  effects,
});

describe('보상 풀', () => {
  it('보상 티어는 5개이고 각 티어에 보상이 있다', () => {
    expect(REWARD_TIERS).toHaveLength(5);
    for (const tier of REWARD_TIERS) expect(getRewardPool(tier).length).toBeGreaterThan(0);
  });

  it('풀의 크기와 순서는 REWARD_TABLE을 그대로 따른다', () => {
    for (const tier of REWARD_TIERS) {
      const pool = getRewardPool(tier);
      expect(pool).toHaveLength(REWARD_TABLE[tier].length);
      pool.forEach((r, i) => {
        expect(r.rewardTier).toBe(tier);
        expect(r.effects).toEqual(REWARD_TABLE[tier][i]);
      });
    }
  });

  it('모든 보상은 효과가 1개 이상이고 id가 서로 다르다', () => {
    const all = REWARD_TIERS.flatMap((t) => getRewardPool(t));
    expect(all.every((r) => r.effects.length >= 1)).toBe(true);
    expect(new Set(all.map((r) => r.id)).size).toBe(all.length);
  });

  it('id와 설명 문자열 형식', () => {
    const effects = [
      { skillTier: 1, stat: 'coinCount', amount: 1 },
      { skillTier: 1, stat: 'coinPower', amount: -1 },
    ] as const;
    expect(rewardId(3, effects)).toBe('t3:1.coinCount+1,1.coinPower-1');
    expect(describeReward(reward([...effects]))).toBe('1스킬 코인 개수 +1 / 1스킬 코인 위력 -1');
  });
});

describe('보상 풀 캐시', () => {
  it('같은 티어를 여러 번 요청해도 같은 내용이고, 배열을 바꿔도 다음 요청에 영향이 없다', () => {
    const first = getRewardPool(1);
    const length = first.length;
    first.pop(); // 반환된 배열은 호출자의 것이므로 바꿔도 된다
    expect(getRewardPool(1)).toHaveLength(length);
    expect(getRewardPool(1)).toEqual(getRewardPool(1));
  });

  it('공유되는 보상 객체는 수정할 수 없다', () => {
    const [reward] = getRewardPool(1);
    expect(() => {
      (reward as { id: string }).id = 'hacked';
    }).toThrow();
    expect(() => {
      (reward.effects[0] as { amount: number }).amount = 999;
    }).toThrow();
    expect(getRewardPool(1)[0].id).not.toBe('hacked');
  });
});

describe('티어 추첨', () => {
  const total = REWARD_TIERS.reduce((s, t) => s + REWARD_TIER_WEIGHTS[t], 0);

  it('각 티어 구간의 한가운데 난수는 해당 티어가 나온다', () => {
    let acc = 0;
    for (const tier of REWARD_TIERS) {
      const w = REWARD_TIER_WEIGHTS[tier];
      if (w > 0) expect(rollRewardTier(fixedRng([(acc + w / 2) / total]))).toBe(tier);
      acc += w;
    }
  });

  it('많이 뽑으면 티어 비율이 가중치에 가깝다', () => {
    const rng = createRng(11);
    const n = 30000;
    const counts = new Map<number, number>();
    for (let i = 0; i < n; i++) {
      const tier = pickReward(rng)!.rewardTier;
      counts.set(tier, (counts.get(tier) ?? 0) + 1);
    }
    for (const tier of REWARD_TIERS) {
      const expected = REWARD_TIER_WEIGHTS[tier] / total;
      expect(Math.abs((counts.get(tier) ?? 0) / n - expected)).toBeLessThan(0.02);
    }
  });
});

describe('generateChoices', () => {
  it('기본 선택지 개수만큼 만들고 중복이 없다', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const choices = generateChoices(createRng(seed));
      expect(choices).toHaveLength(REWARDS.choicesPerPick);
      expect(new Set(choices.map((c) => c.id)).size).toBe(choices.length);
    }
  });

  it('같은 시드면 같은 선택지가 나온다', () => {
    expect(generateChoices(createRng(5))).toEqual(generateChoices(createRng(5)));
  });

  it('뽑힌 티어의 후보가 소진되면 남은 티어에서 뽑는다', () => {
    // 난수 0.0 → 항상 가장 낮은 티어(1티어)를 뽑으려 함
    const n1 = getRewardPool(1).length;
    const choices = generateChoices(fixedRng([0.0]), n1 + 1);
    expect(choices.map((c) => c.rewardTier)).toEqual([...Array(n1).fill(1), 2]);
    expect(new Set(choices.map((c) => c.id)).size).toBe(n1 + 1);
  });

  it('가능한 보상 종류보다 많이 요청하면 가능한 만큼만 반환한다', () => {
    const total = REWARD_TIERS.reduce((n, t) => n + getRewardPool(t).length, 0);
    const choices = generateChoices(createRng(1), total + 10);
    expect(choices).toHaveLength(total);
    expect(new Set(choices.map((c) => c.id)).size).toBe(total);
  });
});

/** 보상 적용 테스트용: 효과 목록으로 보상을 만든다 */
const rw = (...effects: RewardEffect[]): Reward => reward(effects);

describe('applyReward', () => {
  it('효과가 여러 개인 보상은 모두 적용된다', () => {
    const before = baseSpec();
    const result = applyReward(before, rw(count(1, 1), power(1, -1), base(3, 2)));

    expect(result.skills[1].coinCount).toBe(before.skills[1].coinCount + 1);
    expect(result.skills[1].coinPower).toBe(before.skills[1].coinPower - 1);
    expect(result.skills[1].basePower).toBe(before.skills[1].basePower);
    expect(result.skills[3].basePower).toBe(before.skills[3].basePower + 2);
    expect(result.skills[2]).toEqual(before.skills[2]);
    expect(result.sanity).toEqual(before.sanity);
  });

  it('원본(스킬과 정신력 규칙)은 변경하지 않는다', () => {
    const before = baseSpec();
    const snapshot = JSON.stringify(before);
    applyReward(before, rw(base(2, 5), onUse(1, 4), win(3), lose(-2)));
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(JSON.stringify(baseSpec())).toBe(snapshot); // 기본 스펙 자체도 오염되지 않았다
  });

  it('기본 위력은 0, 코인 개수는 1 밑으로 내려가지 않지만, 코인 위력은 음수가 될 수 있다', () => {
    const before = baseSpec();
    const result = applyReward(before, rw(power(1, -100), base(1, -100), count(1, -100)));
    expect(result.skills[1].basePower).toBe(0);
    expect(result.skills[1].coinCount).toBe(1);
    expect(result.skills[1].coinPower).toBe(before.skills[1].coinPower - 100); // 마이너스 코인
  });

  it('코인 위력을 0 밑으로 반복해서 내릴 수 있다', () => {
    let spec = baseSpec();
    const start = spec.skills[3].coinPower;
    for (let i = 0; i < 4; i++) spec = applyReward(spec, rw(power(3, -2)));
    expect(spec.skills[3].coinPower).toBe(start - 8);
    expect(spec.skills[3].coinPower).toBeLessThan(0);
  });
});

describe('스킬의 현재 스탯을 참조하는 수치', () => {
  const stats = skillStats({ basePower: 4, coinPower: 7, coinCount: 3, sanityOnUse: 2 });

  it('resolveAmount: 숫자는 그대로, 식은 계수 × 스탯들의 곱', () => {
    expect(resolveAmount(5, stats)).toBe(5);
    expect(resolveAmount(-3, stats)).toBe(-3);
    expect(resolveAmount(ref('coinCount'), stats)).toBe(3);
    expect(resolveAmount(ref('coinCount', 'coinPower'), stats)).toBe(21);
    expect(resolveAmount(scale(-2, 'coinPower'), stats)).toBe(-14);
    expect(resolveAmount(scale(3, 'basePower', 'sanityOnUse'), stats)).toBe(24); // 3 × 4 × 2
    expect(resolveAmount(scale(5), stats)).toBe(5); // 참조하는 스탯이 없으면 계수 그대로
  });

  it('소수가 나오면 부호와 상관없이 같은 방식으로 반올림하고, -0은 만들지 않는다', () => {
    expect(resolveAmount(scale(0.5, 'coinCount'), stats)).toBe(2); // 1.5 → 2
    expect(resolveAmount(scale(-0.5, 'coinCount'), stats)).toBe(-2); // -1.5 → -2 (대칭)
    expect(resolveAmount(scale(0.4, 'coinCount'), stats)).toBe(1); // 1.2 → 1
    expect(Object.is(resolveAmount(scale(0, 'coinCount'), stats), 0)).toBe(true);
    expect(Object.is(resolveAmount(scale(-0.1, 'coinCount'), stats), 0)).toBe(true);
  });

  it('사용자 예시 1: 기본 위력 +(코인 개수), 코인 위력 -1', () => {
    const before = baseSpec(); // 1스킬: 기본 4, 코인 7, 코인 1개 / 3스킬: 기본 4, 코인 3, 코인 3개
    const reward = rw(base(1, ref('coinCount')), power(1, -1));

    const result = applyReward(before, reward);
    expect(result.skills[1].basePower).toBe(4 + 1);
    expect(result.skills[1].coinPower).toBe(7 - 1);

    // 코인 개수가 많은 스킬일수록 많이 오른다
    const onThree = applyReward(before, rw(base(3, ref('coinCount')), power(3, -1)));
    expect(onThree.skills[3].basePower).toBe(4 + 3);
    expect(onThree.skills[3].coinPower).toBe(3 - 1);
  });

  it('사용자 예시 2: 기본 위력 +(코인 개수×코인 위력), 코인 위력 -(코인 위력×2)', () => {
    const before = baseSpec(); // 2스킬: 기본 4, 코인 5, 코인 2개
    const result = applyReward(
      before,
      rw(base(2, ref('coinCount', 'coinPower')), power(2, scale(-2, 'coinPower'))),
    );
    expect(result.skills[2].basePower).toBe(4 + 2 * 5); // 14
    expect(result.skills[2].coinPower).toBe(5 - 10); // -5 (마이너스 코인)
    expect(result.skills[2].coinCount).toBe(2);
  });

  it('한 보상 안의 모든 효과는 적용 전 스탯으로 계산한다 (효과 순서와 상관없이 결과가 같다)', () => {
    const before = baseSpec(); // 2스킬: 기본 4, 코인 5, 코인 2개

    // 코인 개수를 늘리는 효과가 있어도, 기본 위력 증가량은 늘어나기 전의 코인 개수(2)로 계산
    const a = applyReward(before, rw(count(2, 1), base(2, ref('coinCount'))));
    const b = applyReward(before, rw(base(2, ref('coinCount')), count(2, 1)));
    expect(a.skills[2].basePower).toBe(4 + 2);
    expect(a.skills[2].coinCount).toBe(3);
    expect(a).toEqual(b);

    // 코인 위력을 줄이는 효과가 있어도, 기본 위력 증가량은 줄어들기 전의 코인 위력(5)으로 계산
    const c = applyReward(before, rw(power(2, scale(-2, 'coinPower')), base(2, ref('coinPower'))));
    const d = applyReward(before, rw(base(2, ref('coinPower')), power(2, scale(-2, 'coinPower'))));
    expect(c.skills[2].basePower).toBe(4 + 5);
    expect(c.skills[2].coinPower).toBe(5 - 10);
    expect(c).toEqual(d);
  });

  it('식은 그 효과가 가리키는 스킬의 스탯을 참조한다 (다른 스킬의 스탯이 아니다)', () => {
    const before = baseSpec(); // 코인 개수: 1스킬 1, 2스킬 2, 3스킬 3
    const result = applyReward(before, rw(base(1, ref('coinCount')), base(2, ref('coinCount')), base(3, ref('coinCount'))));
    expect(result.skills[1].basePower - before.skills[1].basePower).toBe(1);
    expect(result.skills[2].basePower - before.skills[2].basePower).toBe(2);
    expect(result.skills[3].basePower - before.skills[3].basePower).toBe(3);
  });

  it('사용 시 정신력도 식으로 참조하고 바꿀 수 있다', () => {
    let spec = applyReward(baseSpec(), rw(onUse(1, ref('coinCount'))));
    expect(spec.skills[1].sanityOnUse).toBe(1); // 코인 1개
    spec = applyReward(spec, rw(onUse(1, 3)));
    expect(spec.skills[1].sanityOnUse).toBe(4);
    // 이미 쌓인 사용 시 정신력을 참조해 기본 위력으로 바꾼다
    spec = applyReward(spec, rw(base(1, ref('sanityOnUse'))));
    expect(spec.skills[1].basePower).toBe(4 + 4);
  });

  it('식으로 줄어드는 값도 한계를 지킨다 (기본 위력 0, 코인 개수 1)', () => {
    const before = baseSpec();
    const result = applyReward(before, rw(base(2, scale(-5, 'coinPower')), count(2, scale(-1, 'coinPower'))));
    expect(result.skills[2].basePower).toBe(0);
    expect(result.skills[2].coinCount).toBe(1);
  });

  it('id: 식도 내용으로 구분되고, 같은 보상은 같은 id다', () => {
    const e = (amount: Parameters<typeof base>[1]) => [base(1, amount)];
    expect(rewardId(2, e(ref('coinCount')))).toBe('t2:1.basePower+coinCount');
    expect(rewardId(2, e(ref('coinCount', 'coinPower')))).toBe('t2:1.basePower+coinCount*coinPower');
    expect(rewardId(2, [power(1, scale(-2, 'coinPower'))])).toBe('t2:1.coinPower-coinPower*2');
    expect(rewardId(2, e(3))).toBe('t2:1.basePower+3');
    expect(rewardId(2, e(ref('coinCount')))).toBe(rewardId(2, e(ref('coinCount'))));
    // 서로 다른 식은 다른 id
    const ids = new Set([
      rewardId(2, e(ref('coinCount'))),
      rewardId(2, e(ref('coinPower'))),
      rewardId(2, e(ref('coinCount', 'coinPower'))),
      rewardId(2, e(scale(2, 'coinCount'))),
      rewardId(2, e(scale(-1, 'coinCount'))),
    ]);
    expect(ids.size).toBe(5);
  });

  it('표기: 식은 "+(코인 개수)", "-(코인 위력×2)"처럼 읽힌다', () => {
    expect(formulaText(ref('coinCount'))).toBe('코인 개수');
    expect(formulaText(ref('coinCount', 'coinPower'))).toBe('코인 개수×코인 위력');
    expect(formulaText(scale(-2, 'coinPower'))).toBe('코인 위력×2');
    expect(amountText(ref('coinCount'))).toBe('+(코인 개수)');
    expect(amountText(scale(-2, 'coinPower'))).toBe('-(코인 위력×2)');
    expect(amountText(scale(-2, 'coinPower'), '\u2212')).toBe('\u2212(코인 위력×2)');
    expect(amountText(3)).toBe('+3');
    expect(amountText(-1)).toBe('-1');
    expect(describeEffect(base(1, ref('coinCount')))).toBe('1스킬 기본 위력 +(코인 개수)');
    expect(describeReward(rw(base(2, ref('coinCount', 'coinPower')), power(2, scale(-2, 'coinPower'))))).toBe(
      '2스킬 기본 위력 +(코인 개수×코인 위력) / 2스킬 코인 위력 -(코인 위력×2)',
    );
  });
});

describe('정신력 보상', () => {
  it('스킬 사용 시 정신력(sanityOnUse)은 그 스킬에만 쌓이고, 음수도 가능하다', () => {
    let spec = applyReward(baseSpec(), rw(onUse(2, 3)));
    expect(spec.skills[2].sanityOnUse).toBe(3);
    expect(spec.skills[1].sanityOnUse).toBe(0);
    expect(spec.skills[3].sanityOnUse).toBe(0);

    spec = applyReward(spec, rw(onUse(2, -5), onUse(3, -1)));
    expect(spec.skills[2].sanityOnUse).toBe(-2); // 하한 없음
    expect(spec.skills[3].sanityOnUse).toBe(-1);
  });

  it('합 승리/패배 정신력 규칙을 바꾼다 (스킬은 건드리지 않는다)', () => {
    const before = baseSpec();
    const result = applyReward(before, rw(win(2), lose(-3)));
    expect(result.sanity.sanityOnClashWin).toBe(before.sanity.sanityOnClashWin + 2);
    expect(result.sanity.sanityOnClashLose).toBe(before.sanity.sanityOnClashLose - 3);
    expect(result.skills).toEqual(before.skills);
  });

  it('정신력 규칙은 하한/상한 없이 쌓인다 (정신력 자체의 범위 제한은 전투에서 적용)', () => {
    let spec = baseSpec();
    for (let i = 0; i < 30; i++) spec = applyReward(spec, rw(win(5), lose(-5)));
    expect(spec.sanity.sanityOnClashWin).toBe(baseSpec().sanity.sanityOnClashWin + 150);
    expect(spec.sanity.sanityOnClashLose).toBe(baseSpec().sanity.sanityOnClashLose - 150);
  });

  it('스킬 효과와 정신력 규칙 효과를 한 보상에 섞을 수 있다', () => {
    const result = applyReward(baseSpec(), rw(base(1, ref('coinCount')), onUse(1, 2), win(1)));
    expect(result.skills[1].basePower).toBe(5);
    expect(result.skills[1].sanityOnUse).toBe(2);
    expect(result.sanity.sanityOnClashWin).toBe(baseSpec().sanity.sanityOnClashWin + 1);
  });

  it('id와 설명 문자열', () => {
    expect(rewardId(4, [win(2)])).toBe('t4:sanityOnClashWin+2');
    expect(rewardId(4, [lose(-1)])).toBe('t4:sanityOnClashLose-1');
    expect(rewardId(4, [onUse(1, 2)])).toBe('t4:1.sanityOnUse+2');
    expect(describeEffect(win(2))).toBe('합 승리시 정신력 +2');
    expect(describeEffect(lose(-1))).toBe('합 패배시 정신력 -1');
    expect(describeEffect(onUse(1, 2))).toBe('1스킬 사용시 정신력 +2');
    expect(describeEffect(onUse(3, -1))).toBe('3스킬 사용시 정신력 -1');
  });
});

describe('보상표에 새 효과 종류를 넣었을 때 (보상표를 임시로 교체해서 확인)', () => {
  const original = REWARD_TABLE[1];
  afterEach(() => {
    REWARD_TABLE[1] = original;
  });

  const customTable = (): RewardEffect[][] => [
    [base(1, ref('coinCount')), power(1, -1)],
    [base(2, ref('coinCount', 'coinPower')), power(2, scale(-2, 'coinPower'))],
    [onUse(3, 2)],
    [win(2)],
    [lose(-1), onUse(1, -1)],
  ];

  it('풀에 그대로 나오고, id가 서로 다르며, 공유 객체는 수정할 수 없다 (식 안쪽까지)', () => {
    REWARD_TABLE[1] = customTable();
    const pool = getRewardPool(1);
    expect(pool).toHaveLength(5);
    expect(new Set(pool.map((r) => r.id)).size).toBe(5);
    expect(pool.map(describeReward)).toEqual([
      '1스킬 기본 위력 +(코인 개수) / 1스킬 코인 위력 -1',
      '2스킬 기본 위력 +(코인 개수×코인 위력) / 2스킬 코인 위력 -(코인 위력×2)',
      '3스킬 사용시 정신력 +2',
      '합 승리시 정신력 +2',
      '합 패배시 정신력 -1 / 1스킬 사용시 정신력 -1',
    ]);

    const [first] = pool;
    const formulaEffect = first.effects[0];
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(formulaEffect)).toBe(true);
    if ('amount' in formulaEffect && typeof formulaEffect.amount !== 'number') {
      expect(Object.isFrozen(formulaEffect.amount)).toBe(true);
      expect(Object.isFrozen(formulaEffect.amount.of)).toBe(true);
    } else {
      throw new Error('첫 보상의 첫 효과는 식이어야 함');
    }
    // 표 원본은 얼려지지 않는다 (복사본을 얼린다)
    expect(Object.isFrozen(REWARD_TABLE[1][0][0])).toBe(false);
  });

  it('선택지 생성과 보상 적용이 새 효과로도 정상 동작하고 원본 표를 바꾸지 않는다', () => {
    REWARD_TABLE[1] = customTable();
    const tableSnapshot = JSON.stringify(REWARD_TABLE[1]);

    for (let seed = 1; seed <= 100; seed++) {
      for (const choice of generateChoices(createRng(seed))) {
        const after = applyReward(baseSpec(), choice);
        expect(after.skills[1].coinCount).toBeGreaterThanOrEqual(1);
        expect(after.skills[2].basePower).toBeGreaterThanOrEqual(0);
      }
    }
    const randomSpec = applyRandomRewards(baseSpec(), 20, createRng(3));
    expect(randomSpec).not.toEqual(baseSpec());
    expect(JSON.stringify(REWARD_TABLE[1])).toBe(tableSnapshot);
  });
});

describe('applyRandomRewards (적 생성용)', () => {
  it('0번 적용하면 스펙이 그대로다', () => {
    expect(applyRandomRewards(baseSpec(), 0, createRng(1))).toEqual(baseSpec());
  });

  it('적용하면 스펙이 달라지고 원본은 변하지 않는다', () => {
    const before = JSON.stringify(baseSpec());
    const input = baseSpec();
    const result = applyRandomRewards(input, 5, createRng(3));
    expect(result).not.toEqual(baseSpec());
    expect(JSON.stringify(input)).toBe(before);
  });

  it('같은 시드면 같은 결과다', () => {
    expect(applyRandomRewards(baseSpec(), 8, createRng(9))).toEqual(
      applyRandomRewards(baseSpec(), 8, createRng(9)),
    );
  });
});
