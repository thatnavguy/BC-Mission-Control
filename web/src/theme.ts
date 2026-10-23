import { makeStyles, webLightTheme, type Theme } from '@fluentui/react-components';

/**
 * Mission Control light theme: white modern canon at Linear/Vercel craft level.
 * Fluent components stay; the skin is hairline-crisp with one blue action color
 * and a fox-orange dash reserved for brand moments.
 */
export const theme: Theme = {
  ...webLightTheme,
  colorNeutralBackground1: '#ffffff',
  colorNeutralBackground2: '#fafafa',
  colorNeutralBackground3: '#f5f4f2',
  colorNeutralStroke1: '#e6e4e1',
  colorNeutralStroke2: '#edebe8',
  colorNeutralStrokeAccessible: '#d6d3cf',
  borderRadiusMedium: '6px',
  borderRadiusLarge: '10px'
};

/** Mascot-derived accent. Brand moments only — never status or data color. */
export const fox = {
  orange: '#e8722a',
  orangeHover: '#d4641d',
  orangeSoft: '#fdf1e7',
  orangeBorder: '#f5d3b8',
  orangeInk: '#a34d12',
  navy: '#1f3a5f'
};

export const useSharedStyles = makeStyles({
  card: {
    padding: '20px',
    backgroundColor: '#ffffff',
    border: '1px solid #e7e5e1',
    borderRadius: '10px',
    boxShadow: 'none'
  },
  pageDesc: {
    display: 'block',
    marginTop: '-10px',
    color: '#6b6a68'
  },
  stepNum: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    backgroundColor: fox.orangeSoft,
    border: `1px solid ${fox.orangeBorder}`,
    color: fox.orangeInk,
    fontSize: '12px',
    fontWeight: 700,
    marginRight: '8px',
    verticalAlign: '1px'
  },
  codeSurface: {
    backgroundColor: '#f7f6f4',
    border: '1px solid #edebe8',
    borderRadius: '8px'
  }
});
