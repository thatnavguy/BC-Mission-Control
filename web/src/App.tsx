import { useEffect, useState } from 'react';
import {
  makeStyles, Tab, TabList, tokens
} from '@fluentui/react-components';
import {
  ArrowUpload24Regular, Settings24Regular, History24Regular,
  AppsList24Regular, Grid24Regular, PlugConnected24Regular, Pulse24Regular,
  Cube24Regular, Rocket24Regular, Globe24Regular, ArrowClockwise24Regular,
  Database24Regular, DocumentBulletList24Regular, CalendarSync24Regular,
  PersonDesktopRegular
} from '@fluentui/react-icons';
import { fox } from './theme';
import DeployPage from './pages/DeployPage';
import SetupPage from './pages/SetupPage';
import HistoryPage from './pages/HistoryPage';
import AppsPage from './pages/AppsPage';
import ComparePage from './pages/ComparePage';
import StatusPage from './pages/StatusPage';
import ApiExplorerPage from './pages/ApiExplorerPage';
import ContainersPage from './pages/ContainersPage';
import ContainerDeployPage from './pages/ContainerDeployPage';
import EnvironmentsPage from './pages/EnvironmentsPage';
import UpdatesPage from './pages/UpdatesPage';
import StoragePage from './pages/StoragePage';
import OperationsPage from './pages/OperationsPage';
import UpdateManagementPage from './pages/UpdateManagementPage';
import SessionsPage from './pages/SessionsPage';

const useStyles = makeStyles({
  shell: { display: 'flex', height: '100vh', overflow: 'hidden', backgroundColor: '#ffffff' },
  nav: {
    width: '240px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '16px 10px',
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    overflowY: 'auto',
    '@media (max-width: 720px)': {
      width: '60px',
      padding: '16px 6px',
      '& .fui-Tab__content': { display: 'none' }
    }
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '4px 10px 16px',
    '@media (max-width: 720px)': {
      justifyContent: 'center',
      padding: '4px 0 14px'
    }
  },
  mark: {
    width: '44px',
    height: '44px',
    objectFit: 'cover',
    borderRadius: '10px',
    border: `1px solid ${fox.orangeBorder}`,
    backgroundColor: fox.orangeSoft,
    flexShrink: 0
  },
  wordmark: { fontWeight: 700, fontSize: '15px', lineHeight: '20px', color: '#1b1a19' },
  tagline: { fontSize: '11px', lineHeight: '16px', color: tokens.colorNeutralForeground3 },
  brandText: {
    '@media (max-width: 720px)': { display: 'none' }
  },
  section: {
    padding: '14px 12px 4px',
    fontSize: tokens.fontSizeBase100,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.8px',
    color: tokens.colorNeutralForeground3,
    '@media (max-width: 720px)': { display: 'none' }
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '28px 36px',
    '@media (max-width: 720px)': { padding: '20px 16px' }
  }
});

type PageKey = 'environments' | 'deploy' | 'apps' | 'updates' | 'bcupdates' | 'sessions' | 'compare' | 'status' | 'operations' | 'storage' | 'api' | 'cdeploy' | 'containers' | 'history' | 'setup';

const PAGE_KEYS = ['environments', 'deploy', 'apps', 'updates', 'bcupdates', 'sessions', 'compare', 'status', 'operations', 'storage', 'api', 'cdeploy', 'containers', 'history', 'setup'];

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
          <img src="/mascot-mark.png" alt="" className={styles.mark} />
          <div className={styles.brandText}>
            <div className={styles.wordmark}>BC Mission Control</div>
            <div className={styles.tagline}>Cloud &amp; containers, one console</div>
          </div>
        </div>
        <TabList
          vertical
          appearance="subtle"
          selectedValue={page}
          onTabSelect={(_e, d) => setPage(d.value as PageKey)}
          size="large"
        >
          <div className={styles.section}>Cloud</div>
          <Tab value="environments" icon={<Globe24Regular />}>Environments</Tab>
          <Tab value="deploy" icon={<ArrowUpload24Regular />}>PTE Deployment</Tab>
          <Tab value="apps" icon={<AppsList24Regular />}>Apps</Tab>
          <Tab value="updates" icon={<ArrowClockwise24Regular />}>App Updates</Tab>
          <Tab value="bcupdates" icon={<CalendarSync24Regular />}>BC Updates</Tab>
          <Tab value="sessions" icon={<PersonDesktopRegular />}>Sessions</Tab>
          <Tab value="compare" icon={<Grid24Regular />}>Compare Versions</Tab>
          <Tab value="status" icon={<Pulse24Regular />}>Deployment Status</Tab>
          <Tab value="operations" icon={<DocumentBulletList24Regular />}>App Operations</Tab>
          <Tab value="storage" icon={<Database24Regular />}>Storage</Tab>
          <Tab value="api" icon={<PlugConnected24Regular />}>API Explorer</Tab>
          <div className={styles.section}>Container</div>
          <Tab value="cdeploy" icon={<Rocket24Regular />}>PTE Deployment</Tab>
          <Tab value="containers" icon={<Cube24Regular />}>Containers</Tab>
          <div className={styles.section}>General</div>
          <Tab value="history" icon={<History24Regular />}>History</Tab>
          <Tab value="setup" icon={<Settings24Regular />}>Setup</Tab>
        </TabList>
      </nav>
      <main className={styles.content} key={page}>
        <div className="page-enter">
          {page === 'environments' && <EnvironmentsPage />}
          {page === 'deploy' && <DeployPage />}
          {page === 'apps' && <AppsPage />}
          {page === 'updates' && <UpdatesPage />}
          {page === 'bcupdates' && <UpdateManagementPage />}
          {page === 'sessions' && <SessionsPage />}
          {page === 'compare' && <ComparePage />}
          {page === 'status' && <StatusPage />}
          {page === 'operations' && <OperationsPage />}
          {page === 'storage' && <StoragePage />}
          {page === 'api' && <ApiExplorerPage />}
          {page === 'cdeploy' && <ContainerDeployPage />}
          {page === 'containers' && <ContainersPage />}
          {page === 'history' && <HistoryPage />}
          {page === 'setup' && <SetupPage />}
        </div>
      </main>
    </div>
  );
}
