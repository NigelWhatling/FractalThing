import { useLayoutEffect, useState } from 'react';

export type SafeAreaInsets = Readonly<{
  top: number;
  right: number;
  bottom: number;
  left: number;
}>;

const ZERO_INSETS: SafeAreaInsets = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

const readSafeAreaInsets = (): SafeAreaInsets => {
  const probe = document.createElement('div');
  probe.style.position = 'fixed';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  probe.style.paddingTop = 'env(safe-area-inset-top)';
  probe.style.paddingRight = 'env(safe-area-inset-right)';
  probe.style.paddingBottom = 'env(safe-area-inset-bottom)';
  probe.style.paddingLeft = 'env(safe-area-inset-left)';
  document.body.appendChild(probe);

  const style = globalThis.getComputedStyle(probe);
  const read = (value: string) => Number.parseFloat(value) || 0;
  const insets = {
    top: read(style.paddingTop),
    right: read(style.paddingRight),
    bottom: read(style.paddingBottom),
    left: read(style.paddingLeft),
  };
  probe.remove();
  return insets;
};

/** Numeric safe-area values shared by canvas and fixed chrome geometry. */
export const useSafeAreaInsets = (): SafeAreaInsets => {
  const [insets, setInsets] = useState<SafeAreaInsets>(ZERO_INSETS);

  useLayoutEffect(() => {
    const update = () => {
      const next = readSafeAreaInsets();
      setInsets((current) =>
        current.top === next.top &&
        current.right === next.right &&
        current.bottom === next.bottom &&
        current.left === next.left
          ? current
          : next,
      );
    };

    update();
    globalThis.addEventListener('resize', update);
    return () => globalThis.removeEventListener('resize', update);
  }, []);

  return insets;
};
