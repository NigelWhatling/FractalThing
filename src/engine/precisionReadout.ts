/**
 * Splitting a printed coordinate at the point where Float64 stops carrying
 * information.
 *
 * Coordinates in this app are exact decimal coefficient/exponent pairs, so they
 * keep growing digits as you zoom. A double carries about 15.95 significant
 * decimal digits; 17 is the width at which every distinct double still prints
 * distinctly, so digits past the 17th are ones only the BigInt path knows.
 * Rendering them dim shows exactly where ordinary doubles give up.
 */
export const FLOAT64_SIGNIFICANT_DIGITS = 17;

export type PrecisionSplit = Readonly<{
  /** Sign character, always present so columns line up. */
  sign: '+' | '-';
  /** Digits within Float64's reach, sign stripped. */
  head: string;
  /** Digits beyond it. Empty until the view is deep enough to have any. */
  tail: string;
  /** Exponent suffix (`e-30`), kept out of the dim run — it is significant. */
  exponent: string;
}>;

export const splitAtFloat64Boundary = (
  value: string,
  significantDigits: number = FLOAT64_SIGNIFICANT_DIGITS,
): PrecisionSplit => {
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const sign = negative ? '-' : '+';

  const exponentIndex = unsigned.search(/[eE]/);
  const mantissa =
    exponentIndex === -1 ? unsigned : unsigned.slice(0, exponentIndex);
  const exponent = exponentIndex === -1 ? '' : unsigned.slice(exponentIndex);

  let seen = 0;
  let started = false;
  for (let index = 0; index < mantissa.length; index += 1) {
    const character = mantissa[index];
    if (character < '0' || character > '9') {
      continue;
    }
    // Leading zeros carry no significance: 0.00123 has three, not five.
    if (character !== '0') {
      started = true;
    }
    if (!started) {
      continue;
    }
    seen += 1;
    if (seen > significantDigits) {
      return {
        sign,
        head: mantissa.slice(0, index),
        tail: mantissa.slice(index),
        exponent,
      };
    }
  }

  return { sign, head: mantissa, tail: '', exponent };
};
