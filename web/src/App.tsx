import { useEffect, useState } from 'react';
import {
  makeStyles, Tab, TabList, Title3, tokens
} from '@fluentui/react-components';
import {
  ArrowUpload24Regular, Settings24Regular, History24Regular,
  AppsList24Regular, Grid24Regular, PlugConnected24Regular, Pulse24Regular,
  Cube24Regular, Rocket24Regular
} from '@fluentui/react-icons';
import DeployPage from './pages/DeployPage';
import SetupPage from './pages/SetupPage';
import HistoryPage from './pages/HistoryPage';
import AppsPage from './pages/AppsPage';
import ComparePage from './pages/ComparePage';
import StatusPage from './pages/StatusPage';
import ApiExplorerPage from './pages/ApiExplorerPage';
import ContainersPage from './pages/ContainersPage';
import ContainerDeployPage from './pages/ContainerDeployPage';

const useStyles = makeStyles({
  shell: { display: 'flex', height: '100vh', overflow: 'hidden' },
  nav: {
    width: '230px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '16px 8px',
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    overflowY: 'auto'
  },
  brand: { padding: '4px 12px 16px', fontWeight: 600 },
  section: {
    padding: '12px 12px 4px',
    fontSize: tokens.fontSizeBase100,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: tokens.colorNeutralForeground3
  },
  content: { flex: 1, overflowY: 'auto', padding: '24px 32px' }
});

type PageKey = 'deploy' | 'apps' | 'compare' | 'status' | 'api' | 'cdeploy' | 'containers' | 'history' | 'setup';

const PAGE_KEYS = ['deploy', 'apps', 'compare', 'status', 'api', 'cdeploy', 'containers', 'history', 'setup'];

export default function App() {
  const styles = useStyles();
  const [page, setPage] = useState<PageKey>(() => (location.hash.replace('#', '') as PageKey) || 'deploy');

  useEffect(() => {
    location.hash = page;
  }, [page]);

  useEffect(() => {
    const onHash = () => {
      const p = location.hash.replace('#', '') as PageKey;
      if (PAGE_KEYS.includes(p)) setPage(p);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <div className={styles.shell}>
      <nav className={styles.nav}>
        <div className={styles.brand}>
          <Title3>BC Mission Control</Title3>
        </div>
        <TabList
          vertical
          selectedValue={page}
          onTabSelect={(_e, d) => setPage(d.value as PageKey)}
          size="large"
        >
          <div className={styles.section}>Cloud</div>
          <Tab value="deploy" icon={<ArrowUpload24Regular />}>PTE Deployment</Tab>
          <Tab value="apps" icon={<AppsList24Regular />}>Apps</Tab>
          <Tab value="compare" icon={<Grid24Regular />}>Compare Versions</Tab>
          <Tab value="status" icon={<Pulse24Regular />}>Deployment Status</Tab>
          <Tab value="api" icon={<PlugConnected24Regular />}>API Explorer</Tab>
          <div className={styles.section}>Container</div>
          <Tab value="cdeploy" icon={<Rocket24Regular />}>PTE Deployment</Tab>
          <Tab value="containers" icon={<Cube24Regular />}>Containers</Tab>
          <div className={styles.section}>General</div>
          <Tab value="history" icon={<History24Regular />}>History</Tab>
          <Tab value="setup" icon={<Settings24Regular />}>Setup</Tab>
        </TabList>
      </nav>
      <main className={styles.content}>
        {page === 'deploy' && <DeployPage />}
        {page === 'apps' && <AppsPage />}
        {page === 'compare' && <ComparePage />}
        {page === 'status' && <StatusPage />}
        {page === 'api' && <ApiExplorerPage />}
        {page === 'cdeploy' && <ContainerDeployPage />}
        {page === 'containers' && <ContainersPage />}
        {page === 'history' && <HistoryPage />}
        {page === 'setup' && <SetupPage />}
      </main>
    </div>
  );
}
