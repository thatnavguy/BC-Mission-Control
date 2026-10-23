import { makeStyles } from '@fluentui/react-components';
import { fox } from '../theme';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    padding: '36px 24px',
    gap: '4px'
  },
  img: {
    width: '170px',
    height: 'auto',
    borderRadius: '12px',
    border: `1px solid ${fox.orangeBorder}`,
    backgroundColor: fox.orangeSoft,
    marginBottom: '10px'
  },
  title: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#1b1a19'
  },
  hint: {
    fontSize: '13px',
    color: '#6b6a68',
    maxWidth: '46ch'
  }
});

/** Friendly empty state with the mascot — used where a page has nothing to show yet. */
export default function EmptyState({ title, hint }: { title: string; hint?: string }) {
  const styles = useStyles();
  return (
    <div className={styles.root}>
      <img src="/mascot-sleeping.png" alt="" className={styles.img} />
      <div className={styles.title}>{title}</div>
      {hint && <div className={styles.hint}>{hint}</div>}
    </div>
  );
}
