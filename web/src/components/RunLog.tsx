import { useEffect, useRef } from 'react';
import { makeStyles, tokens } from '@fluentui/react-components';

const useStyles = makeStyles({
  log: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: '12px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    backgroundColor: '#f7f6f4',
    border: '1px solid #edebe8',
    padding: '12px',
    borderRadius: '8px',
    maxHeight: '360px',
    overflowY: 'auto',
    marginTop: '12px'
  }
});

/** Auto-scrolling monospace log view for run output. */
export default function RunLog({ lines }: { lines: string[] }) {
  const styles = useStyles();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines.length]);

  if (lines.length === 0) return null;
  return <div ref={ref} className={styles.log}>{lines.join('\n')}</div>;
}
