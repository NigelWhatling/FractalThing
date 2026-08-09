import type { SVGProps } from 'react';

/**
 * Inline stroke icons. Emoji were platform-dependent and inherited neither
 * weight nor colour; these take both from `currentColor` and the icon size.
 */
type IconProps = SVGProps<SVGSVGElement>;

const Icon = ({ children, ...props }: IconProps) => (
  <svg
    viewBox='0 0 24 24'
    fill='none'
    stroke='currentColor'
    strokeWidth='1.5'
    strokeLinecap='round'
    strokeLinejoin='round'
    aria-hidden='true'
    focusable='false'
    {...props}
  >
    {children}
  </svg>
);

export const HandIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d='M8 12V5.5a1.5 1.5 0 1 1 3 0V11' />
    <path d='M11 11V4.5a1.5 1.5 0 1 1 3 0V11' />
    <path d='M14 11.5V6.5a1.5 1.5 0 1 1 3 0V15' />
    <path d='M17 10.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-5.06-2.79l-2.2-3.46a1.5 1.5 0 0 1 2.35-1.85L8 14' />
  </Icon>
);

export const MarqueeIcon = (props: IconProps) => (
  <Icon {...props} strokeDasharray='3 2.5'>
    <rect x='3.5' y='3.5' width='17' height='17' rx='1' />
  </Icon>
);

export const ResetIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d='M4 10a8 8 0 1 1 .6 5' />
    <path d='M3.5 4.5V10H9' />
  </Icon>
);

export const InfoIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx='12' cy='12' r='8.5' />
    <path d='M12 11.25V16' />
    <path d='M12 8.25h.01' />
  </Icon>
);

export const ChevronDownIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d='M6.5 9.5 12 15l5.5-5.5' />
  </Icon>
);

export const MenuIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d='M4 7h16' />
    <path d='M4 12h16' />
    <path d='M4 17h16' />
  </Icon>
);

export const CloseIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d='M6 6l12 12' />
    <path d='M18 6 6 18' />
  </Icon>
);

export const LockIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x='4.5' y='10.5' width='15' height='10' rx='1.5' />
    <path d='M8 10.5V7a4 4 0 0 1 8 0v3.5' />
  </Icon>
);

export const ShapesIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx='8' cy='8' r='4.5' />
    <path d='M14 12.5h6.5V19a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2v-4.5a2 2 0 0 1 2-2Z' />
  </Icon>
);

/** Colour: a disc half-filled, the way a palette splits light and dark. */
export const ColourIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx='12' cy='12' r='8.5' />
    <path d='M12 3.5a8.5 8.5 0 0 1 0 17Z' fill='currentColor' stroke='none' />
  </Icon>
);

/** Renderer: a processor die with legs — which engine is doing the work. */
export const ChipIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x='7.5' y='7.5' width='9' height='9' rx='1' />
    <path d='M10.5 3.5v4M13.5 3.5v4M10.5 16.5v4M13.5 16.5v4' />
    <path d='M3.5 10.5h4M3.5 13.5h4M16.5 10.5h4M16.5 13.5h4' />
  </Icon>
);

/** Rail docked to the right: a frame with its strip on the right edge. */
export const PanelRightIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x='3.5' y='4.5' width='17' height='15' rx='1.5' />
    <path d='M15.5 4.5v15' />
  </Icon>
);

export const PanelLeftIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x='3.5' y='4.5' width='17' height='15' rx='1.5' />
    <path d='M8.5 4.5v15' />
  </Icon>
);

export const SlidersIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d='M4 7h6M14 7h6M4 17h10M18 17h2' />
    <circle cx='12' cy='7' r='2' />
    <circle cx='16' cy='17' r='2' />
  </Icon>
);

export const GearIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx='12' cy='12' r='3' />
    <path d='M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1' />
  </Icon>
);

export const LinkIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d='M10.5 13.5a4 4 0 0 0 5.66 0l3-3a4 4 0 1 0-5.66-5.66l-1.5 1.5' />
    <path d='M13.5 10.5a4 4 0 0 0-5.66 0l-3 3a4 4 0 1 0 5.66 5.66l1.5-1.5' />
  </Icon>
);

export const CheckIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d='M5 12.5 10 17.5 19 7' />
  </Icon>
);

/** Pairs with the status colours so a warning never relies on hue alone. */
export const AlertIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d='M12 4.5 21 19.5H3L12 4.5Z' />
    <path d='M12 10v4' />
    <path d='M12 16.75h.01' />
  </Icon>
);

export const SunIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx='12' cy='12' r='4' />
    <path d='M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4' />
  </Icon>
);

export const MoonIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d='M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z' />
  </Icon>
);
