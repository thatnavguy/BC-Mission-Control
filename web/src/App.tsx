import { lazy, Suspense, useEffect, useState } from 'react';
import {
  makeStyles, Spinner, Tab, TabList, tokens
} from '@fluentui/react-components';
import {
  ArrowUpload24Regular, Settings24Regular, History24Regular,
  AppsList24Regular, Grid24Regular, PlugConnected24Regular, Pulse24Regular,
  Cube24Regular, Rocket24Regular, Globe24Regular, ArrowClockwise24Regular,
  Database24Regular, DocumentBulletList24Regular, CalendarSync24Regular,
  PersonDesktopRegular, ToggleLeft24Regular, MailAlert24Regular
} from '@fluentui/react-icons';
import { fox } from './theme';
const DeployPage = lazy(() => import('./pages/DeployPage'));
const SetupPage = lazy(() => import('./pages/SetupPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const AppsPage = lazy(() => import('./pages/AppsPage'));
const ComparePage = lazy(() => import('./pages/ComparePage'));
const StatusPage = lazy(() => import('./pages/StatusPage'));
const ApiExplorerPage = lazy(() => import('./pages/ApiExplorerPage'));
const ContainersPage = lazy(() => import('./pages/ContainersPage'));
const ContainerDeployPage = lazy(() => import('./pages/ContainerDeployPage'));
const EnvironmentsPage = lazy(() => import('./pages/EnvironmentsPage'));
const UpdatesPage = lazy(() => import('./pages/UpdatesPage'));
const StoragePage = lazy(() => import('./pages/StoragePage'));
const OperationsPage = lazy(() => import('./pages/OperationsPage'));
const UpdateManagementPage = lazy(() => import('./pages/UpdateManagementPage'));
const SessionsPage = lazy(() => import('./pages/SessionsPage'));
const FeaturesPage = lazy(() => import('./pages/FeaturesPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));

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

const PAGE_KEYS = ['environments', 'deploy', 'apps', 'updates', 'bcupdates', 'features', 'sessions', 'notifications', 'compare', 'status', 'operations', 'storage', 'api', 'cdeploy', 'containers', 'history', 'setup'] as const;

type PageKey = (typeof PAGE_KEYS)[number];

function pageFromHash(): PageKey | undefined {
  const p = location.hash.replace('#', '');
  return (PAGE_KEYS as readonly string[]).includes(p) ? (p as PageKey) : undefined;
}

export default function App() {
  const styles = useStyles();
  const [page, setPage] = useState<PageKey>(() => pageFromHash() ?? 'deploy');

  useEffect(() => {
    location.hash = page;
  }, [page]);

  useEffect(() => {
    const onHash = () => {
      const p = pageFromHash();
      if (p) setPage(p);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <div className={styles.shell}>
      <nav className={styles.nav} aria-label="Primary navigation">
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
          <Tab value="environments" icon={<Globe24Regular />} aria-label="Cloud: Environments" title="Cloud: Environments">Environments</Tab>
          <Tab value="deploy" icon={<ArrowUpload24Regular />} aria-label="Cloud: PTE Deployment" title="Cloud: PTE Deployment">PTE Deployment</Tab>
          <Tab value="apps" icon={<AppsList24Regular />} aria-label="Cloud: Apps" title="Cloud: Apps">Apps</Tab>
          <Tab value="updates" icon={<ArrowClockwise24Regular />} aria-label="Cloud: App Updates" title="Cloud: App Updates">App Updates</Tab>
          <Tab value="bcupdates" icon={<CalendarSync24Regular />} aria-label="Cloud: BC Updates" title="Cloud: BC Updates">BC Updates</Tab>
          <Tab value="features" icon={<ToggleLeft24Regular />} aria-label="Cloud: Features" title="Cloud: Features">Features</Tab>
          <Tab value="sessions" icon={<PersonDesktopRegular />} aria-label="Cloud: Sessions" title="Cloud: Sessions">Sessions</Tab>
          <Tab value="notifications" icon={<MailAlert24Regular />} aria-label="Cloud: Notifications" title="Cloud: Notifications">Notifications</Tab>
          <Tab value="compare" icon={<Grid24Regular />} aria-label="Cloud: Compare Versions" title="Cloud: Compare Versions">Compare Versions</Tab>
          <Tab value="status" icon={<Pulse24Regular />} aria-label="Cloud: Deployment Status" title="Cloud: Deployment Status">Deployment Status</Tab>
          <Tab value="operations" icon={<DocumentBulletList24Regular />} aria-label="Cloud: App Operations" title="Cloud: App Operations">App Operations</Tab>
          <Tab value="storage" icon={<Database24Regular />} aria-label="Cloud: Storage" title="Cloud: Storage">Storage</Tab>
          <Tab value="api" icon={<PlugConnected24Regular />} aria-label="Cloud: API Explorer" title="Cloud: API Explorer">API Explorer</Tab>
          <div className={styles.section}>Container</div>
          <Tab value="cdeploy" icon={<Rocket24Regular />} aria-label="Container: PTE Deployment" title="Container: PTE Deployment">PTE Deployment</Tab>
          <Tab value="containers" icon={<Cube24Regular />} aria-label="Container: Containers" title="Container: Containers">Containers</Tab>
          <div className={styles.section}>General</div>
          <Tab value="history" icon={<History24Regular />} aria-label="General: History" title="General: History">History</Tab>
          <Tab value="setup" icon={<Settings24Regular />} aria-label="General: Setup" title="General: Setup">Setup</Tab>
        </TabList>
      </nav>
      <main className={styles.content} key={page}>
        <Suspense fallback={<Spinner />}>
          <div className="page-enter">
            {page === 'environments' && <EnvironmentsPage />}
            {page === 'deploy' && <DeployPage />}
            {page === 'apps' && <AppsPage />}
            {page === 'updates' && <UpdatesPage />}
            {page === 'bcupdates' && <UpdateManagementPage />}
            {page === 'features' && <FeaturesPage />}
            {page === 'sessions' && <SessionsPage />}
            {page === 'notifications' && <NotificationsPage />}
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
        </Suspense>
      </main>
    </div>
  );
}
