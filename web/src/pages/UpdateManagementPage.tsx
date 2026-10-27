import { useCallback, useEffect, useState } from 'react';
import {
  Badge, Button, Card, Checkbox, Dialog, DialogActions, DialogBody,
  DialogContent, DialogSurface, DialogTitle, Dropdown, Field, Input,
  makeStyles, MessageBar, MessageBarBody, Option, Spinner, Table, TableBody,
  TableCell, TableHeader, TableHeaderCell, TableRow, Text, Title2, tokens
} from '@fluentui/react-components';
import { ArrowSync24Regular, Edit24Regular } from '@fluentui/react-icons';
import { api } from '../api';
import { getCached, setCached } from '../pageCache';
import EmptyState from '../components/EmptyState';
import { useSharedStyles } from '../theme';
import {
  EnvironmentUpdateInfo, Settings, TimeZoneInfo, UpdateManagementResponse
} from '../types';

const useStyles = makeStyles({
  stack: { display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1100px' },
  cardWide: {
    padding: '20px',
    overflowX: 'auto',
    backgroundColor: '#ffffff',
    border: '1px solid #e7e5e1',
    borderRadius: '10px',
    boxShadow: 'none'
  },
  row: { display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' },
  form: { display: 'flex', flexDirection: 'column', gap: '12px' },
  windowSummary: { display: 'flex', gap: '32px', alignItems: 'center', flexWrap: 'wrap', marginTop: '8px' },
  big: { fontSize: '20px', fontWeight: 700 },
  nowrap: { whiteSpace: 'nowrap' }
});

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDateTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function rolloutBadge(status?: string) {
  const s = (status ?? '').toLowerCase();
  if (!status) return <Text style={{ color: tokens.colorNeutralForeground4 }}>—</Text>;
  if (s === 'active') return <Badge appearance="filled" color="success">{status}</Badge>;
  if (s === 'postponed' || s === 'undermaintenance') return <Badge appearance="filled" color="warning">{status}</Badge>;
  return <Badge appearance="outline">{status}</Badge>;
}

export default function UpdateManagementPage() {
  const styles = useStyles();
  const shared = useSharedStyles();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tenantId, setTenantId] = useState('');
  const [environment, setEnvironment] = useState('');
  const [data, setData] = useState<UpdateManagementResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Update window editor
  const [windowOpen, setWindowOpen] = useState(false);
  const [timezones, setTimezones] = useState<TimeZoneInfo[] | null>(null);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [timeZoneId, setTimeZoneId] = useState('');

  // Target version scheduling
  const [scheduleTarget, setScheduleTarget] = useState<EnvironmentUpdateInfo | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [ignoreWindow, setIgnoreWindow] = useState(false);

  const [saving, setSaving] = useState(false);

  const restore = (tid: string, env: string) => {
    setData(getCached<UpdateManagementResponse>(`updmgmt:${tid}|${env}`) ?? null);
  };

  useEffect(() => {
    api.get<Settings>('/api/settings').then(s => {
      setSettings(s);
      const first = s.tenants.find(t => Object.values(t.environments).some(Boolean));
      if (first) {
        setTenantId(first.id);
        const firstEnv = Object.entries(first.environments).find(([, e]) => e);
        if (firstEnv) {
          setEnvironment(firstEnv[0]);
          restore(first.id, firstEnv[0]);
        }
      }
    }).catch(e => setError(e.message));
  }, []);

  const refresh = useCallback(async () => {
    if (!tenantId || !environment) return;
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const resp = await api.get<UpdateManagementResponse>(`/api/update-management?tenantId=${encodeURIComponent(tenantId)}&environment=${encodeURIComponent(environment)}`);
      setData(resp);
      setCached(`updmgmt:${tenantId}|${environment}`, resp);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId, environment]);

  const tenant = settings?.tenants.find(t => t.id === tenantId);
  const envNames = tenant ? Object.entries(tenant.environments).filter(([, e]) => e).map(([n]) => n) : [];

  const openWindowEditor = async () => {
    setError('');
    setStartTime(data?.window?.preferredStartTime ?? '');
    setEndTime(data?.window?.preferredEndTime ?? '');
    setTimeZoneId(data?.window?.timeZoneId ?? '');
    setWindowOpen(true);
    if (!timezones) {
      try {
        setTimezones(await api.get<TimeZoneInfo[]>(`/api/timezones?tenantId=${encodeURIComponent(tenantId)}`));
      } catch (e: any) {
        setError(e.message);
      }
    }
  };

  const saveWindow = async () => {
    setError('');
    setSaving(true);
    try {
      await api.put('/api/update-window', {
        tenantId, environment,
        preferredStartTime: startTime,
        preferredEndTime: endTime,
        timeZoneId
      });
      setWindowOpen(false);
      setNotice('Update window saved.');
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const saveSchedule = async () => {
    if (!scheduleTarget) return;
    setError('');
    setSaving(true);
    try {
      await api.post('/api/updates/select', {
        tenantId,
        environment,
        targetVersion: scheduleTarget.targetVersion,
        ...(scheduleDate ? { selectedDateTime: scheduleDate } : {}),
        ignoreUpdateWindow: ignoreWindow
      });
      setScheduleTarget(null);
      setNotice(`Update to ${scheduleTarget.targetVersion} selected.`);
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const w = data?.window;

  return (
    <div className={styles.stack}>
      <Title2>Environment Updates</Title2>
      <Text size={300} className={shared.pageDesc}>
        Scheduled BC version updates and the maintenance window per environment.
      </Text>
      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
      {notice && <MessageBar intent="success"><MessageBarBody>{notice}</MessageBarBody></MessageBar>}

      <Card className={styles.cardWide}>
        <div className={styles.row}>
          <Field label="Tenant">
            <Dropdown
              value={tenant?.name ?? ''}
              selectedOptions={tenantId ? [tenantId] : []}
              onOptionSelect={(_e, d) => {
                const id = String(d.optionValue ?? '');
                setTenantId(id);
                const t = settings?.tenants.find(x => x.id === id);
                const firstEnv = t ? Object.entries(t.environments).find(([, en]) => en) : undefined;
                const env = firstEnv ? firstEnv[0] : '';
                setEnvironment(env);
                restore(id, env);
              }}
            >
              {settings?.tenants.map(t => <Option key={t.id} value={t.id}>{t.name}</Option>)}
            </Dropdown>
          </Field>
          <Field label="Environment">
            <Dropdown
              value={environment}
              selectedOptions={environment ? [environment] : []}
              onOptionSelect={(_e, d) => {
                const env = String(d.optionValue ?? '');
                setEnvironment(env);
                restore(tenantId, env);
              }}
            >
              {envNames.map(n => <Option key={n} value={n}>{n}</Option>)}
            </Dropdown>
          </Field>
          <Button
            appearance="primary"
            icon={loading ? <Spinner size="tiny" /> : <ArrowSync24Regular />}
            disabled={loading || !tenantId || !environment}
            onClick={refresh}
          >
            {data ? 'Refresh' : 'Load update settings'}
          </Button>
        </div>
      </Card>

      {!data && !loading && (
        <Card className={styles.cardWide}>
          <EmptyState
            title="Nothing loaded yet"
            hint="Pick a tenant and environment, then click Load update settings — nothing is fetched until you ask."
          />
        </Card>
      )}

      {loading && <Spinner label="Loading update settings..." />}

      {data && !loading && (
        <>
          <Card className={styles.cardWide}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <Text weight="semibold">Update window</Text>
              <Button size="small" icon={<Edit24Regular />} onClick={openWindowEditor}>
                Edit window
              </Button>
            </div>
            {w?.preferredStartTime && w?.preferredEndTime ? (
              <div className={styles.windowSummary}>
                <div>
                  <span className={styles.big}>{w.preferredStartTime} – {w.preferredEndTime}</span>
                  <Text block size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    {w.timeZoneId ?? 'local time'}
                  </Text>
                </div>
                {w.preferredStartTimeUtc && w.preferredEndTimeUtc && (
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    Next occurrence: {fmtDateTime(w.preferredStartTimeUtc)} → {fmtDateTime(w.preferredEndTimeUtc)}
                  </Text>
                )}
              </div>
            ) : (
              <Text size={300} style={{ color: tokens.colorNeutralForeground3, marginTop: '8px', display: 'block' }}>
                No update window is configured.
              </Text>
            )}
            {data.currentVersion && (
              <Text block size={200} style={{ marginTop: '12px', color: tokens.colorNeutralForeground3 }}>
                Current version: {data.currentVersion}
              </Text>
            )}
          </Card>

          <Card className={styles.cardWide}>
            <Text weight="semibold">Target versions</Text>
            {data.updates.length === 0 ? (
              <Text block size={300} style={{ marginTop: '8px', color: tokens.colorNeutralForeground3 }}>
                No upcoming updates are listed for this environment.
              </Text>
            ) : (
              <Table size="small" style={{ marginTop: '8px' }}>
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Version</TableHeaderCell>
                    <TableHeaderCell>Type</TableHeaderCell>
                    <TableHeaderCell>Availability</TableHeaderCell>
                    <TableHeaderCell>Scheduled for</TableHeaderCell>
                    <TableHeaderCell>Latest selectable date</TableHeaderCell>
                    <TableHeaderCell>Rollout</TableHeaderCell>
                    <TableHeaderCell>Action</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.updates.map(u => (
                    <TableRow key={`${u.targetVersion}-${u.targetVersionType ?? ''}`}>
                      <TableCell>
                        <Text weight="semibold">{u.targetVersion}</Text>{' '}
                        {u.selected && <Badge appearance="filled" color="brand">Selected</Badge>}
                      </TableCell>
                      <TableCell>{u.targetVersionType ?? 'GA'}</TableCell>
                      <TableCell>
                        {u.available
                          ? <Badge appearance="outline" color="success">Released</Badge>
                          : u.expectedAvailability
                            ? <Text>Expected {MONTHS[(u.expectedAvailability.month ?? 1) - 1]} {u.expectedAvailability.year}</Text>
                            : <Text style={{ color: tokens.colorNeutralForeground4 }}>Not yet released</Text>}
                      </TableCell>
                      <TableCell><span className={styles.nowrap}>{fmtDateTime(u.scheduleDetails?.selectedDateTime)}</span></TableCell>
                      <TableCell><span className={styles.nowrap}>{fmtDateTime(u.scheduleDetails?.latestSelectableDateTime)}</span></TableCell>
                      <TableCell>{rolloutBadge(u.scheduleDetails?.rolloutStatus)}</TableCell>
                      <TableCell>
                        {u.available && !u.selected && (
                          <Button
                            size="small"
                            onClick={() => { setScheduleTarget(u); setScheduleDate(''); setIgnoreWindow(false); }}
                          >
                            Select
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </>
      )}

      <Dialog open={windowOpen} onOpenChange={(_e, d) => setWindowOpen(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Update window for {environment}</DialogTitle>
            <DialogContent>
              <div className={styles.form}>
                <Field label="Start (24-hour)">
                  <Input type="time" value={startTime} onChange={(_e, d) => setStartTime(d.value)} />
                </Field>
                <Field label="End (24-hour)">
                  <Input type="time" value={endTime} onChange={(_e, d) => setEndTime(d.value)} />
                </Field>
                <Field label="Time zone">
                  <Dropdown
                    value={timezones?.find(t => t.id === timeZoneId)?.displayName ?? timeZoneId}
                    selectedOptions={timeZoneId ? [timeZoneId] : []}
                    onOptionSelect={(_e, d) => setTimeZoneId(String(d.optionValue ?? ''))}
                  >
                    {(timezones ?? []).map(t => (
                      <Option key={t.id} value={t.id}>{t.displayName}</Option>
                    ))}
                  </Dropdown>
                </Field>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  Updates and scheduled app installs run inside this window. The window must be at least 6 hours.
                </Text>
              </div>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setWindowOpen(false)}>Cancel</Button>
              <Button
                appearance="primary"
                disabled={saving || !startTime || !endTime || !timeZoneId}
                onClick={saveWindow}
              >
                {saving ? 'Saving...' : 'Save window'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={!!scheduleTarget} onOpenChange={(_e, d) => { if (!d.open) setScheduleTarget(null); }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Schedule update to {scheduleTarget?.targetVersion}</DialogTitle>
            <DialogContent>
              <div className={styles.form}>
                <Field label="Date (optional)" hint="If the time falls outside the update window, the update runs in the next window instead.">
                  <Input type="date" value={scheduleDate} onChange={(_e, d) => setScheduleDate(d.value)} />
                </Field>
                <Checkbox
                  label="Ignore the update window"
                  checked={ignoreWindow}
                  onChange={(_e, d) => setIgnoreWindow(d.checked === true)}
                />
                {scheduleTarget?.scheduleDetails?.latestSelectableDateTime && (
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    Must be scheduled by {fmtDateTime(scheduleTarget.scheduleDetails.latestSelectableDateTime)}.
                  </Text>
                )}
              </div>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setScheduleTarget(null)}>Cancel</Button>
              <Button appearance="primary" disabled={saving} onClick={saveSchedule}>
                {saving ? 'Selecting...' : 'Select this version'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
