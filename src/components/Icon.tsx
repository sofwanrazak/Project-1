import Svg, { Circle, Path, Rect } from 'react-native-svg';

/** Feather-style 24x24 stroke icons, drawn inline so there is no icon-font dependency. */
const PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  chart: 'M18 20V10M12 20V4M6 20v-6',
  pie: 'M21.21 15.89A10 10 0 1 1 8 2.83M22 12A10 10 0 0 0 12 2v10z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  close: 'M18 6 6 18M6 6l12 12',
  right: 'm9 18 6-6-6-6',
  left: 'm15 18-6-6 6-6',
  down: 'm6 9 6 6 6-6',
  check: 'M20 6 9 17l-5-5',
  trash: 'M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6M10 11v6M14 11v6',
  backspace: 'M21 4H8l-7 8 7 8h13a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1zM18 9l-6 6M12 9l6 6',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z',
  eyeOff: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM3 3l18 18',
  swap: 'M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  edit: 'M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z',
  wallet: 'M20 12V8H6a2 2 0 0 1 0-4h12v4M4 6v12a2 2 0 0 0 2 2h14v-4M18 12a2 2 0 0 0 0 4h4v-4z',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  alert: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
  arrowUp: 'M12 19V5M5 12l7-7 7 7',
  arrowDown: 'M12 5v14M19 12l-7 7-7-7',
  filter: 'M22 3H2l8 9.46V19l4 2v-8.54z',
  tag: 'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01',
  info: 'M12 16v-4M12 8h.01',
} as const;

export type IconName = keyof typeof PATHS | 'search' | 'lock' | 'calendar';

interface Props {
  name: IconName;
  size?: number;
  color: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 22, color, strokeWidth = 2 }: Props) {
  const common = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      {name === 'search' ? (
        <>
          <Circle cx={11} cy={11} r={8} {...common} />
          <Path d="m21 21-4.3-4.3" {...common} />
        </>
      ) : name === 'lock' ? (
        <>
          <Rect x={3} y={11} width={18} height={11} rx={2} {...common} />
          <Path d="M7 11V7a5 5 0 0 1 10 0v4" {...common} />
        </>
      ) : name === 'calendar' ? (
        <>
          <Rect x={3} y={4} width={18} height={18} rx={2} {...common} />
          <Path d="M16 2v4M8 2v4M3 10h18" {...common} />
        </>
      ) : (
        <>
          <Path d={PATHS[name]} {...common} />
          {(name === 'eye' || name === 'eyeOff') && <Circle cx={12} cy={12} r={3} {...common} />}
          {name === 'info' && <Circle cx={12} cy={12} r={10} {...common} />}
        </>
      )}
    </Svg>
  );
}
