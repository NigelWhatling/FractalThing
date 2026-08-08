import type { DecimalCoordinate } from '../viewport';

export const LIMB_BASE = 1024;
export const LIMB_COUNT = 12;
const LIMB_HALF = LIMB_BASE / 2;

export type LimbVectors = Readonly<{
  lo: [number, number, number, number];
  mid: [number, number, number, number];
  hi: [number, number, number, number];
}>;

const zeroVectors = (): LimbVectors => ({
  lo: [0, 0, 0, 0],
  mid: [0, 0, 0, 0],
  hi: [0, 0, 0, 0],
});

const buildVectorsFromScaledInteger = (scaledValue: bigint): LimbVectors => {
  if (scaledValue === 0n) {
    return zeroVectors();
  }

  const sign = scaledValue < 0n ? -1 : 1;
  let remaining = scaledValue < 0n ? -scaledValue : scaledValue;
  const limbs = new Array<number>(LIMB_COUNT).fill(0);
  const base = BigInt(LIMB_BASE);
  for (let index = 0; index < LIMB_COUNT; index += 1) {
    limbs[index] = Number(remaining % base) * sign;
    remaining /= base;
  }

  for (let index = 0; index < LIMB_COUNT - 1; index += 1) {
    const carry = Math.floor((limbs[index] + LIMB_HALF) / LIMB_BASE);
    limbs[index] -= carry * LIMB_BASE;
    limbs[index + 1] += carry;
  }
  const carry = Math.floor((limbs[LIMB_COUNT - 1] + LIMB_HALF) / LIMB_BASE);
  limbs[LIMB_COUNT - 1] -= carry * LIMB_BASE;

  return {
    lo: [limbs[0], limbs[1], limbs[2], limbs[3]],
    mid: [limbs[4], limbs[5], limbs[6], limbs[7]],
    hi: [limbs[8], limbs[9], limbs[10], limbs[11]],
  };
};

export const buildLimbVectors = (
  value: number,
  fractionalLimbs: number,
): LimbVectors => {
  if (!Number.isFinite(value) || value === 0) {
    return zeroVectors();
  }
  const scaled = value * LIMB_BASE ** fractionalLimbs;
  if (!Number.isFinite(scaled)) {
    return zeroVectors();
  }
  return buildVectorsFromScaledInteger(BigInt(Math.trunc(scaled)));
};

export const buildDecimalLimbVectors = (
  value: DecimalCoordinate,
  fractionalLimbs: number,
): LimbVectors => {
  const scale = BigInt(LIMB_BASE) ** BigInt(fractionalLimbs);
  const scaled =
    value.exponent >= 0
      ? value.coefficient * 10n ** BigInt(value.exponent) * scale
      : (value.coefficient * scale) / 10n ** BigInt(-value.exponent);
  return buildVectorsFromScaledInteger(scaled);
};
