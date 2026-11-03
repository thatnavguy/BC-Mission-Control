import { useEffect, useState } from 'react';
import {
  Button, Card, Link, makeStyles, MessageBar, MessageBarBody, Spinner,
  Text, Title2, Title3
} from '@fluentui/react-components';
import { api } from '../api';
import { fox, useSharedStyles } from '../theme';
import { AppInfo } from '../types';

const repoUrl = 'https://github.com/thatnavguy/BC-Mission-Control';
const useStyles = makeStyles({
  stack: { display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '800px' },
  brand: { display: 'flex', alignItems: 'center', gap: '20px' },
  mark: {
    width: '80px', height: '80px', objectFit: 'cover', flexShrink: 0,
    borderRadius: '10px', border: `1px solid ${fox.orangeBorder}`
  },
  identity: { display: 'flex', flexDirection: 'column', gap: '8px' },
  links: { display: 'flex', flexWrap: 'wrap', gap: '12px 24px' },
  action: { alignSelf: 'flex-start' }
});

export default function AboutPage() {
  const styles = useStyles();
  const shared = useSharedStyles();
  const [info, setInfo] = useState<AppInfo>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadInfo() {
    setLoading(true);
    setError('');
    try {
      setInfo(await api.get<AppInfo>('/api/about'));
    } catch (e) {
      setError(`Could not load app details. ${e instanceof Error ? e.message : String(e)} Try again.`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadInfo(); }, []);

  return (
    <div className={styles.stack}>
      <Title2>About</Title2>
      <Text className={shared.pageDesc}>Your installed version and useful links.</Text>
      <Card className={shared.card}>
        <div className={styles.brand}>
          <img src="/mascot-mark.png" alt="" className={styles.mark} />
          <div className={styles.identity}>
            <Title3>BC Mission Control</Title3>
            <Text>Manage Business Central cloud tenants and local Docker containers from one console.</Text>
          </div>
        </div>
        <Text>Built by <Link href="https://thatnavguy.com" target="_blank" rel="noopener noreferrer">Teddy Herryanto</Link>.</Text>
      </Card>
      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
      <Card className={shared.card}>
        <Title3>Installed version</Title3>
        {loading ? <Spinner label="Loading installed version..." /> : info ? (
          <Text weight="semibold">{info.version}</Text>
        ) : <Button className={styles.action} onClick={() => void loadInfo()}>Try again</Button>}
      </Card>
      <div className={styles.links}>
        <Link href={`${repoUrl}/blob/main/docs/UserGuide.md`} target="_blank" rel="noopener noreferrer">User guide</Link>
        <Link href={repoUrl} target="_blank" rel="noopener noreferrer">GitHub</Link>
        <Link href={`${repoUrl}/releases/latest`} target="_blank" rel="noopener noreferrer">Latest release</Link>
        <Link href={`${repoUrl}/issues`} target="_blank" rel="noopener noreferrer">Report an issue</Link>
        <Link href={`${repoUrl}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer">MIT license</Link>
      </div>
    </div>
  );
}
