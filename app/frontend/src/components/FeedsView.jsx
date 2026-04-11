import { useState, useMemo } from 'react';
import {
  Box, Typography, Paper, Chip, Collapse, IconButton,
  List, ListItem, ListItemText, LinearProgress, Stack, Tab, Tabs, Button,
  Tooltip, Select, MenuItem,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useGoogleTasks, useJiraTickets, useAllTasks, useTaskAction, useConfig, useUpdateConfig } from '../hooks/useApi';
import { CONTEXT_CONFIG, CONTEXT_ORDER } from '../lib/contexts';

const PRIORITY_COLORS = {
  Highest: '#f44336',
  High: '#ff9800',
  Medium: '#ffc107',
  Low: '#4caf50',
  Lowest: '#8bc34a',
};

const STATUS_COLORS = {
  'In Progress': '#2196f3',
  'In Review': '#9c27b0',
  'Ready': '#ff9800',
  'Untriaged': '#9e9e9e',
};

function titleMatch(feedTitle, pendingTasks) {
  const lower = feedTitle.toLowerCase();
  return pendingTasks.some(t => {
    const tl = (t.title || '').toLowerCase();
    return tl.includes(lower) || lower.includes(tl);
  });
}

function JiraTicketList({ tickets, pendingTasks, action }) {
  const [collapsed, setCollapsed] = useState({});

  if (!tickets || tickets.length === 0) {
    return (
      <Paper sx={{ p: 2, opacity: 0.6 }}>
        <Typography variant="body2" color="text.secondary">No active Jira tickets</Typography>
      </Paper>
    );
  }

  // Group by status
  const byStatus = {};
  for (const ticket of tickets) {
    const status = ticket.status || 'Unknown';
    if (!byStatus[status]) byStatus[status] = [];
    byStatus[status].push(ticket);
  }

  const statusOrder = ['In Progress', 'In Review', 'Ready', 'Untriaged'];
  const orderedStatuses = statusOrder.filter(s => byStatus[s]).concat(
    Object.keys(byStatus).filter(s => !statusOrder.includes(s))
  );

  return (
    <Box>
      {orderedStatuses.map(status => {
        const isOpen = collapsed[status] !== false;
        return (
          <Paper key={status} sx={{ mb: 1.5 }}>
            <Box
              onClick={() => setCollapsed(p => ({ ...p, [status]: !isOpen }))}
              sx={{
                display: 'flex', alignItems: 'center', p: 1.5, cursor: 'pointer',
                borderLeft: `4px solid ${STATUS_COLORS[status] || '#666'}`,
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <Typography variant="subtitle1" sx={{ flexGrow: 1, fontWeight: 600 }}>
                {status}
              </Typography>
              <Chip label={byStatus[status].length} size="small" color="primary" sx={{ mr: 1 }} />
              <IconButton size="small">{isOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}</IconButton>
            </Box>
            <Collapse in={isOpen}>
              <List dense disablePadding>
                {byStatus[status].map(ticket => {
                  const alreadyAdded = titleMatch(ticket.summary, pendingTasks);
                  const title = `${ticket.key}: ${ticket.summary}`;
                  return (
                    <ListItem
                      key={ticket.key}
                      sx={{ pl: 4, borderBottom: '1px solid', borderColor: 'divider' }}
                      secondaryAction={
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          {alreadyAdded ? (
                            <Tooltip title="Already in today's tasks">
                              <CheckCircleIcon fontSize="small" color="success" />
                            </Tooltip>
                          ) : (
                            <Tooltip title="Add to today">
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={<AddIcon />}
                                onClick={() => action.mutate({ action: 'add-from-feed', title, context: 'cul' })}
                                disabled={action.isPending}
                                sx={{ fontSize: '0.7rem', py: 0.25 }}
                              >
                                Add
                              </Button>
                            </Tooltip>
                          )}
                          <IconButton size="small" component="a" href={ticket.url} target="_blank">
                            <OpenInNewIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      }
                    >
                      <ListItemText
                        primary={
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <Chip
                              label={ticket.key}
                              size="small"
                              variant="outlined"
                              sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                            />
                            <Typography variant="body2">{ticket.summary}</Typography>
                          </Stack>
                        }
                        secondaryTypographyProps={{ component: 'div' }}
                        secondary={
                          <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                            {ticket.priority && (
                              <Chip
                                label={ticket.priority}
                                size="small"
                                sx={{
                                  bgcolor: PRIORITY_COLORS[ticket.priority] || '#666',
                                  color: '#fff',
                                  fontSize: '0.65rem',
                                  height: 20,
                                }}
                              />
                            )}
                            {ticket.type && (
                              <Chip label={ticket.type} size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />
                            )}
                          </Stack>
                        }
                      />
                    </ListItem>
                  );
                })}
              </List>
            </Collapse>
          </Paper>
        );
      })}
    </Box>
  );
}

// Auto-guess context from a Google Task list name
function guessContext(listName) {
  const lower = listName.toLowerCase();
  for (const ctx of CONTEXT_ORDER) {
    const cfg = CONTEXT_CONFIG[ctx];
    if (!cfg) continue;
    if (lower === ctx || lower === cfg.code || lower === cfg.label.toLowerCase()) return cfg.code;
  }
  // fuzzy: list name contains context label or vice versa
  for (const ctx of CONTEXT_ORDER) {
    const cfg = CONTEXT_CONFIG[ctx];
    if (!cfg) continue;
    const label = cfg.label.toLowerCase();
    if (lower.includes(label) || label.includes(lower)) return cfg.code;
  }
  return '';
}

function GoogleTaskList({ tasks, pendingTasks, action, listMapping, onMapList }) {
  const [collapsed, setCollapsed] = useState({});

  if (!tasks || tasks.length === 0) {
    return (
      <Paper sx={{ p: 2, opacity: 0.6 }}>
        <Typography variant="body2" color="text.secondary">No Google Tasks found</Typography>
      </Paper>
    );
  }

  // Group by list
  const byList = {};
  for (const task of tasks) {
    const list = task.listName || 'Other';
    if (!byList[list]) byList[list] = [];
    byList[list].push(task);
  }

  const today = new Date().toISOString().slice(0, 10);

  // Context options for the dropdown
  const contextOptions = CONTEXT_ORDER
    .filter(ctx => CONTEXT_CONFIG[ctx] && ctx !== 'rest')
    .map(ctx => ({ code: CONTEXT_CONFIG[ctx].code, label: CONTEXT_CONFIG[ctx].label, emoji: CONTEXT_CONFIG[ctx].emoji }));

  return (
    <Box>
      {Object.entries(byList).map(([listName, listTasks]) => {
        const isOpen = collapsed[listName] !== false;
        const mappedCode = listMapping[listName] || '';
        const borderColor = mappedCode
          ? (CONTEXT_CONFIG[CONTEXT_ORDER.find(c => CONTEXT_CONFIG[c]?.code === mappedCode)]?.color || '#4285f4')
          : '#4285f4';

        return (
          <Paper key={listName} sx={{ mb: 1.5 }}>
            <Box
              sx={{
                display: 'flex', alignItems: 'center', p: 1.5, cursor: 'pointer',
                borderLeft: `4px solid ${borderColor}`,
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <Box onClick={() => setCollapsed(p => ({ ...p, [listName]: !isOpen }))} sx={{ flexGrow: 1, display: 'flex', alignItems: 'center' }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {listName}
                </Typography>
              </Box>
              <Select
                size="small"
                value={mappedCode}
                displayEmpty
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onMapList(listName, e.target.value)}
                sx={{ minWidth: 120, height: 28, fontSize: '0.75rem', mr: 1 }}
              >
                <MenuItem value=""><em>auto-detect</em></MenuItem>
                {contextOptions.map(opt => (
                  <MenuItem key={opt.code} value={opt.code}>{opt.emoji} {opt.label}</MenuItem>
                ))}
              </Select>
              <Chip label={listTasks.length} size="small" color="primary" sx={{ mr: 1 }} />
              <IconButton size="small" onClick={() => setCollapsed(p => ({ ...p, [listName]: !isOpen }))}>
                {isOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            </Box>
            <Collapse in={isOpen}>
              <List dense disablePadding>
                {listTasks.map(task => {
                  const dueToday = task.due && task.due.startsWith(today);
                  const overdue = task.due && task.due.slice(0, 10) < today;
                  const alreadyAdded = titleMatch(task.title, pendingTasks);
                  const contextForAdd = mappedCode || undefined;
                  return (
                    <ListItem
                      key={task.id}
                      sx={{ pl: 4, borderBottom: '1px solid', borderColor: 'divider', pr: 14 }}
                      secondaryAction={
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          {alreadyAdded ? (
                            <Tooltip title="Already in today's tasks">
                              <CheckCircleIcon fontSize="small" color="success" />
                            </Tooltip>
                          ) : (
                            <Tooltip title="Add to today">
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={<AddIcon />}
                                onClick={() => action.mutate({
                                  action: 'add-from-feed',
                                  title: task.title,
                                  ...(contextForAdd && { context: contextForAdd }),
                                  googleTaskId: task.id,
                                  googleTaskListId: task.listId,
                                })}
                                disabled={action.isPending}
                                sx={{ fontSize: '0.7rem', py: 0.25 }}
                              >
                                Add
                              </Button>
                            </Tooltip>
                          )}
                        </Stack>
                      }
                    >
                      <ListItemText
                        primary={
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <Typography variant="body2">{task.title}</Typography>
                            {dueToday && <Chip label="Today" size="small" color="warning" sx={{ height: 20, fontSize: '0.65rem' }} />}
                            {overdue && <Chip label="Overdue" size="small" color="error" sx={{ height: 20, fontSize: '0.65rem' }} />}
                          </Stack>
                        }
                        secondaryTypographyProps={{ component: 'div' }}
                        secondary={
                          <>
                            {task.due && (
                              <Typography variant="caption" color="text.secondary">
                                Due: {new Date(task.due).toLocaleDateString()}
                              </Typography>
                            )}
                            {task.notes && (
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                                {task.notes.length > 100 ? task.notes.slice(0, 100) + '...' : task.notes}
                              </Typography>
                            )}
                          </>
                        }
                      />
                    </ListItem>
                  );
                })}
              </List>
            </Collapse>
          </Paper>
        );
      })}
    </Box>
  );
}

export default function FeedsView() {
  const [tab, setTab] = useState(0);
  const { data: googleData, isLoading: gLoading, error: gError } = useGoogleTasks();
  const { data: jiraData, isLoading: jLoading, error: jError } = useJiraTickets();
  const { data: tasksData } = useAllTasks();
  const action = useTaskAction();
  const { data: config } = useConfig();
  const updateConfig = useUpdateConfig();

  const googleCount = googleData?.tasks?.length || 0;
  const jiraCount = jiraData?.tickets?.length || 0;
  const pendingTasks = tasksData?.pending || [];

  // List mapping: Google Task list name → local context code
  const savedMapping = useMemo(() => {
    const raw = config?.google_task_list_mapping;
    if (!raw) return {};
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  }, [config?.google_task_list_mapping]);

  // Auto-guess for any lists not yet in the saved mapping
  const listNames = useMemo(() => {
    if (!googleData?.tasks) return [];
    const names = new Set();
    for (const t of googleData.tasks) if (t.listName) names.add(t.listName);
    return [...names];
  }, [googleData?.tasks]);

  const listMapping = useMemo(() => {
    const merged = { ...savedMapping };
    for (const name of listNames) {
      if (!(name in merged)) merged[name] = guessContext(name);
    }
    return merged;
  }, [savedMapping, listNames]);

  const handleMapList = (listName, contextCode) => {
    const next = { ...listMapping, [listName]: contextCode };
    updateConfig.mutate({ key: 'google_task_list_mapping', value: next });
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>Task Feeds</Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label={
          <Stack direction="row" alignItems="center" spacing={1}>
            <span>Jira</span>
            {jiraCount > 0 && <Chip label={jiraCount} size="small" color="primary" sx={{ height: 20 }} />}
          </Stack>
        } />
        <Tab label={
          <Stack direction="row" alignItems="center" spacing={1}>
            <span>Google Tasks</span>
            {googleCount > 0 && <Chip label={googleCount} size="small" color="primary" sx={{ height: 20 }} />}
          </Stack>
        } />
      </Tabs>

      {tab === 0 && (
        <>
          {jLoading && <LinearProgress />}
          {jError && <Typography color="error">Error loading Jira: {jError.message}</Typography>}
          {jiraData?.error && !jiraData.tickets?.length && (
            <Paper sx={{ p: 2, opacity: 0.6 }}>
              <Typography variant="body2" color="text.secondary">{jiraData.error}</Typography>
            </Paper>
          )}
          {jiraData?.tickets && (
            <JiraTicketList tickets={jiraData.tickets} pendingTasks={pendingTasks} action={action} />
          )}
        </>
      )}

      {tab === 1 && (
        <>
          {gLoading && <LinearProgress />}
          {gError && <Typography color="error">Error loading Google Tasks: {gError.message}</Typography>}
          {googleData?.error && !googleData.tasks?.length && (
            <Paper sx={{ p: 2, opacity: 0.6 }}>
              <Typography variant="body2" color="text.secondary">{googleData.error}</Typography>
            </Paper>
          )}
          {googleData?.tasks && (
            <GoogleTaskList
              tasks={googleData.tasks}
              pendingTasks={pendingTasks}
              action={action}
              listMapping={listMapping}
              onMapList={handleMapList}
            />
          )}
        </>
      )}
    </Box>
  );
}
