import { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Chip, Collapse, IconButton,
  List, ListItem, ListItemButton, ListItemText, LinearProgress, Stack,
  TextField, Select, MenuItem, FormControl, Button, Drawer, Tabs, Tab,
  Popover, ToggleButton, ToggleButtonGroup, Tooltip,
  CircularProgress, Divider,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckIcon from '@mui/icons-material/Check';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import PauseIcon from '@mui/icons-material/Pause';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import AddIcon from '@mui/icons-material/Add';
import NotesIcon from '@mui/icons-material/Notes';
import { useAllTasks, useTimeSums, useTaskAction } from '../hooks/useApi';
import { CONTEXT_CONFIG, CONTEXT_ORDER, formatMinutes } from '../lib/contexts';

function todayMinutes(task) {
  const today = new Date().toISOString().slice(0, 10);
  const todayStart = new Date(today + 'T00:00:00').getTime();
  const now = Date.now();
  let total = 0;
  for (const s of (task.sessions || [])) {
    if (!s.startedAt) continue;
    const start = Math.max(new Date(s.startedAt).getTime(), todayStart);
    const end = s.endedAt ? Math.min(new Date(s.endedAt).getTime(), now) : now;
    if (end > start) total += end - start;
  }
  return Math.round(total / 60000);
}

const CTX_OPTIONS = [
  { value: '', label: 'Auto' },
  { value: 'cul', label: '🌱 Cultivo' },
  { value: 'prof', label: '💼 Professional' },
  { value: 'per', label: '🏠 Personal' },
  { value: 'soc', label: '👥 Social' },
  { value: 'proj', label: '🚀 Projects' },
  { value: 'heal', label: '💪 Health' },
  { value: 'rest', label: '😴 Rest' },
  { value: 'us', label: '☀️ Unstructured' },
];

export function LevelPopover({ label, value, max, onSelect, pending }) {
  const [anchor, setAnchor] = useState(null);
  const levels = Array.from({ length: max + 1 }, (_, i) => i);
  return (
    <>
      <Chip
        label={`${label}:${value ?? '?'}`}
        size="small"
        variant="outlined"
        onClick={(e) => { e.stopPropagation(); setAnchor(e.currentTarget); }}
        sx={{ fontSize: '0.7rem', cursor: 'pointer', opacity: value != null ? 1 : 0.5 }}
      />
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        onClick={(e) => e.stopPropagation()}
      >
        <Box sx={{ p: 1 }}>
          <ToggleButtonGroup
            exclusive
            value={value}
            onChange={(_, v) => { if (v != null) { onSelect(v); setAnchor(null); } }}
            size="small"
          >
            {levels.map(l => (
              <ToggleButton key={l} value={l} disabled={pending} sx={{ minWidth: 32, fontSize: '0.75rem' }}>
                {l}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
      </Popover>
    </>
  );
}

export function ActiveTask({ task, action, pending, routine, sticky }) {
  const [elapsed, setElapsed] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tab, setTab] = useState(0);
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    if (!task?.startedAt) return;
    const update = () => {
      const ms = Date.now() - new Date(task.startedAt).getTime();
      setElapsed(Math.floor(ms / 60000) + (task.timeSpent || 0));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [task?.startedAt, task?.timeSpent]);

  if (!task) {
    return (
      <Paper sx={{
        p: 1.5, mb: 1, opacity: 0.5,
        background: 'linear-gradient(135deg, rgba(40,40,40,0.95) 0%, rgba(30,30,30,0.95) 100%)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>No active task</Typography>
      </Paper>
    );
  }

  const ctx = CONTEXT_CONFIG[task.activityContext] || {};
  const isRoutine = task.sourceType === 'routine';
  const isUs = task.activityContext === 'us';
  const fl = task.focusLevel != null ? task.focusLevel : isUs ? 0 : isRoutine ? 1 : 2;
  const busy = action.isPending;

  const switchTasks = tab === 0 ? (pending || []) : (routine || []).filter(t => t.title !== 'general');
  const switchFiltered = switchTasks.filter(t => t.id !== task.id);
  const switchGrouped = {};
  for (const t of switchFiltered) {
    const c = t.activityContext || 'unstructured';
    if (!switchGrouped[c]) switchGrouped[c] = [];
    switchGrouped[c].push(t);
  }

  const handleSwitch = (toTask) => {
    action.mutate({ action: 'switch-to', taskId: toTask.id }, { onSuccess: () => setDrawerOpen(false) });
  };

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    action.mutate({ action: 'add-note', text: noteText.trim() }, { onSuccess: () => setNoteText('') });
  };

  return (
    <>
      <Paper elevation={8} sx={{
        p: 2, mb: 1,
        background: `linear-gradient(135deg, ${ctx.color || '#ff9800'} 0%, ${ctx.color || '#ff9800'}88 30%, #111 100%)`,
        borderBottom: `1px solid rgba(255,255,255,0.08)`,
        boxShadow: `0 4px 24px ${ctx.color || '#ff9800'}40, 0 2px 8px rgba(0,0,0,0.6)`,
        borderRadius: 1,
      }}>
        <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap">
          <PlayArrowIcon sx={{
            color: '#fff',
            fontSize: 32,
            animation: 'pulse 1.5s infinite',
            filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.5))',
          }} />
          <Typography variant="h5" sx={{
            flexGrow: 1,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: '#fff',
            textShadow: '0 1px 4px rgba(0,0,0,0.5)',
          }}>{task.title}</Typography>
          <LevelPopover label="f" value={fl} max={5} pending={busy}
            onSelect={(v) => action.mutate({ action: 'set-focus', taskId: task.id, level: v })} />
          <LevelPopover label="p" value={task.priority} max={5} pending={busy}
            onSelect={(v) => action.mutate({ action: 'set-priority', taskId: task.id, level: v })} />
          <Chip label={`${ctx.emoji} ${ctx.label}`} size="small" sx={{ bgcolor: ctx.color, color: '#fff' }} />
          <Typography variant="h5" sx={{
            fontFamily: 'monospace',
            minWidth: 80,
            textAlign: 'right',
            fontWeight: 700,
            color: elapsed > 60 ? '#ff9800' : '#fff',
          }}>
            {formatMinutes(elapsed)}
          </Typography>
          <Tooltip title="Switch task">
            <Button
              size="small"
              variant="outlined"
              startIcon={<SwapHorizIcon />}
              onClick={() => setDrawerOpen(true)}
              sx={{ ml: 1 }}
            >
              Change
            </Button>
          </Tooltip>
          <Tooltip title="Pause (move to pending)">
            <Button
              size="small"
              variant="outlined"
              color="warning"
              startIcon={busy ? <CircularProgress size={14} /> : <PauseIcon />}
              onClick={() => action.mutate({ action: 'pause-current' })}
              disabled={busy}
            >
              Pause
            </Button>
          </Tooltip>
          <Tooltip title="Fill untracked time with unstructured">
            <Button
              size="small"
              variant="outlined"
              onClick={() => action.mutate({ action: 'fill' })}
              disabled={busy}
            >
              Fill
            </Button>
          </Tooltip>
          {!isRoutine && (
            <Tooltip title="Complete current task">
              <Button
                size="small"
                variant="contained"
                color="success"
                startIcon={busy ? <CircularProgress size={14} /> : <CheckIcon />}
                onClick={() => action.mutate({ action: 'complete-current' })}
                disabled={busy}
              >
                Complete
              </Button>
            </Tooltip>
          )}
        </Stack>
        {(task.projectId || task.epicId) && (
          <Typography variant="caption" color="text.disabled" sx={{ mt: 0.75, display: 'block' }}>
            {[task.goalTitle, task.projectTitle, task.epicTitle].filter(Boolean).join(' / ')}
          </Typography>
        )}
        {task.notes?.length > 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {task.notes[task.notes.length - 1]?.text ?? task.notes[task.notes.length - 1]}
          </Typography>
        )}
        <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }`}</style>
      </Paper>

      <Drawer anchor="right" open={drawerOpen} onClose={() => setDrawerOpen(false)}
        PaperProps={{ sx: { width: 360, bgcolor: 'background.default' } }}>
        <Box sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ mb: 0.5 }}>Current Task</Typography>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <Typography sx={{ mr: 0.5 }}>{ctx.emoji}</Typography>
            <Typography variant="body1" sx={{ fontWeight: 600, flexGrow: 1 }}>{task.title}</Typography>
            <Chip label={formatMinutes(elapsed)} size="small" variant="outlined" sx={{ fontFamily: 'monospace' }} />
          </Stack>
          <Stack direction="row" spacing={0.5} sx={{ mb: 2 }}>
            <LevelPopover label="f" value={fl} max={5} pending={busy}
              onSelect={(v) => action.mutate({ action: 'set-focus', taskId: task.id, level: v })} />
            <LevelPopover label="p" value={task.priority} max={5} pending={busy}
              onSelect={(v) => action.mutate({ action: 'set-priority', taskId: task.id, level: v })} />
          </Stack>
        </Box>

        <Divider />

        {/* Notes section */}
        <Box sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Notes</Typography>
          {task.notes?.length > 0 && (
            <Box sx={{ mb: 1.5, maxHeight: 120, overflow: 'auto' }}>
              {task.notes.map((n, i) => (
                <Typography key={i} variant="body2" color="text.secondary" sx={{ mb: 0.5, fontSize: '0.8rem' }}>
                  {n?.text ?? n}
                </Typography>
              ))}
            </Box>
          )}
          <Stack direction="row" spacing={1}>
            <TextField
              size="small"
              placeholder="Add a note..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddNote(); }}
              sx={{ flexGrow: 1 }}
              fullWidth
            />
            <Button size="small" variant="outlined" onClick={handleAddNote} disabled={busy || !noteText.trim()}>
              Add
            </Button>
          </Stack>
        </Box>

        <Divider />

        {/* Task switcher */}
        <Box sx={{ px: 2, pt: 1.5 }}>
          <Typography variant="subtitle2">Switch to:</Typography>
        </Box>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth"
          sx={{ minHeight: 36, '& .MuiTab-root': { minHeight: 36, fontSize: '0.75rem' } }}>
          <Tab label="Novel" />
          <Tab label="Routine" />
        </Tabs>
        <List dense sx={{ overflow: 'auto', flexGrow: 1, py: 0 }}>
          {CONTEXT_ORDER.map(c => {
            const ctxTasks = switchGrouped[c];
            if (!ctxTasks?.length) return null;
            const cfg = CONTEXT_CONFIG[c] || {};
            return ctxTasks.map(t => (
              <ListItemButton key={t.id} onClick={() => handleSwitch(t)} disabled={busy} sx={{ py: 0.5 }}>
                <ListItemText
                  primary={`${cfg.emoji} ${t.title}`}
                  primaryTypographyProps={{ variant: 'body2', fontSize: '0.82rem', noWrap: true }}
                />
                {t.timeSpent > 0 && (
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', ml: 1 }}>
                    {formatMinutes(t.timeSpent)}
                  </Typography>
                )}
              </ListItemButton>
            ));
          })}
          {switchFiltered.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
              No tasks available
            </Typography>
          )}
        </List>
      </Drawer>
    </>
  );
}

export function TaskRow({ task, action, onNavigate }) {
  const busy = action.isPending;
  const hasLineage = task.projectId || task.epicId;
  const [expanded, setExpanded] = useState(false);
  const [noteText, setNoteText] = useState('');
  const notes = task.notes || [];

  const handleBreadcrumbClick = (e) => {
    e.stopPropagation();
    if (!onNavigate) return;
    if (task.epicId) {
      onNavigate('planning', { goalId: task.goalId || task.projectId });
    } else if (task.projectId) {
      onNavigate('planning', { goalId: task.goalId || task.projectId });
    }
  };

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    action.mutate({ action: 'add-note', taskId: task.id, text: noteText.trim() }, {
      onSuccess: () => setNoteText(''),
    });
  };

  return (
    <ListItem
      disableGutters
      sx={{ px: 2, py: 0.5, borderBottom: '1px solid', borderColor: 'divider', flexDirection: 'column', alignItems: 'stretch' }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ width: '100%' }}>
        <Tooltip title="Switch to">
          <IconButton size="small" onClick={() => action.mutate({ action: 'switch-to', taskId: task.id })} disabled={busy}>
            <PlayArrowIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ lineHeight: 1.4 }}>
            {(() => {
              const match = task.title.match(/^(TSP-\d+)(:\s?)/);
              if (!match) return task.title;
              const ticket = match[1];
              const sep = match[2];
              const rest = task.title.slice(match[0].length);
              const url = task.jiraUrl || `https://cultivo.atlassian.net/browse/${ticket}`;
              return (
                <>
                  <a href={url} target="_blank" rel="noopener noreferrer"
                    style={{ color: '#90CAF9', textDecoration: 'none' }}
                    onMouseEnter={e => e.target.style.textDecoration = 'underline'}
                    onMouseLeave={e => e.target.style.textDecoration = 'none'}
                    onClick={e => e.stopPropagation()}
                  >{ticket}</a>{sep}{rest}
                </>
              );
            })()}
          </Typography>
          {hasLineage && (
            <Typography
              variant="caption"
              onClick={handleBreadcrumbClick}
              sx={{
                fontSize: '0.6rem',
                color: 'text.disabled',
                cursor: onNavigate ? 'pointer' : 'default',
                '&:hover': onNavigate ? { color: '#90CAF9', textDecoration: 'underline' } : {},
              }}
            >
              {[task.goalTitle, task.projectTitle, task.epicTitle].filter(Boolean).join(' / ')}
            </Typography>
          )}
          {notes.length > 0 && (
            <Box sx={{ mt: 0.25 }}>
              {notes.map((n, i) => (
                <Typography key={i} variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.75rem', lineHeight: 1.3 }}>
                  {n?.text ?? n}
                </Typography>
              ))}
            </Box>
          )}
        </Box>
        {(() => {
          const dayMins = todayMinutes(task);
          const totalMins = task.timeSpent || 0;
          if (!dayMins && !totalMins) return null;
          return (
            <Stack direction="row" spacing={0.5} alignItems="baseline" sx={{ whiteSpace: 'nowrap' }}>
              {dayMins > 0 && (
                <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                  {formatMinutes(dayMins)}
                </Typography>
              )}
              {totalMins > 0 && totalMins !== dayMins && (
                <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.disabled', fontSize: '0.6rem' }}>
                  ({formatMinutes(totalMins)})
                </Typography>
              )}
            </Stack>
          );
        })()}
        {task.jiraTicket && (
          <Chip
            label={task.jiraTicket}
            size="small"
            variant="outlined"
            component="a"
            href={task.jiraUrl || `https://cultivo.atlassian.net/browse/${task.jiraTicket}`}
            target="_blank"
            rel="noopener noreferrer"
            clickable
            sx={{ fontSize: '0.65rem', height: 18, textDecoration: 'none' }}
          />
        )}
        {task.googleTaskId && !task.jiraTicket && (
          <Tooltip title="From Google Tasks">
            <Chip label="GT" size="small" variant="outlined" sx={{ fontSize: '0.6rem', height: 18, opacity: 0.7 }} />
          </Tooltip>
        )}
        <LevelPopover label="f" value={task.focusLevel} max={5} pending={busy}
          onSelect={(v) => action.mutate({ action: 'set-focus', taskId: task.id, level: v })} />
        <LevelPopover label="p" value={task.priority} max={5} pending={busy}
          onSelect={(v) => action.mutate({ action: 'set-priority', taskId: task.id, level: v })} />
        <Tooltip title="Notes">
          <IconButton size="small" onClick={() => setExpanded(!expanded)} sx={{ opacity: notes.length > 0 ? 0.8 : 0.3, '&:hover': { opacity: 1 } }}>
            <NotesIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Complete">
          <IconButton size="small" onClick={() => action.mutate({ action: 'complete-task', taskId: task.id })} disabled={busy}>
            <CheckIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Defer — remove from today">
          <IconButton size="small" onClick={() => action.mutate({ action: 'delete-task', taskId: task.id })} disabled={busy} sx={{ opacity: 0.4, '&:hover': { opacity: 0.8, color: '#FF9800' } }}>
            <RemoveCircleOutlineIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Stack>
      <Collapse in={expanded}>
        <Stack direction="row" spacing={1} sx={{ pl: 5, pr: 2, py: 1 }}>
          <TextField
            size="small"
            placeholder="Add a note..."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddNote(); }}
            sx={{ flexGrow: 1 }}
            fullWidth
          />
          <Button size="small" variant="outlined" onClick={handleAddNote} disabled={busy || !noteText.trim()}>
            Add
          </Button>
        </Stack>
      </Collapse>
    </ListItem>
  );
}

export function CompletedStrip({ completed }) {
  const [anchor, setAnchor] = useState(null);
  const [activeTask, setActiveTask] = useState(null);

  const today = new Date().toISOString().slice(0, 10);
  const todayCompleted = (completed || []).filter(t =>
    t.sessions?.some(s => s.endedAt?.startsWith(today))
  );

  if (!todayCompleted.length) return null;

  const handleEnter = (e, task) => {
    setAnchor(e.currentTarget);
    setActiveTask(task);
  };
  const handleLeave = () => {
    setAnchor(null);
    setActiveTask(null);
  };

  const activeCfg = activeTask ? (CONTEXT_CONFIG[activeTask.activityContext] || {}) : {};

  return (
    <Box sx={{ mt: 2.5 }}>
      <Typography variant="caption" color="text.disabled" sx={{ mb: 1, display: 'block' }}>
        {todayCompleted.length} completed
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {todayCompleted.map((t, i) => {
          const cfg = CONTEXT_CONFIG[t.activityContext] || {};
          return (
            <Box
              key={t.id || i}
              onMouseEnter={(e) => handleEnter(e, t)}
              onMouseLeave={handleLeave}
              sx={{
                width: 120,
                height: 48,
                borderRadius: 1.5,
                border: `1.5px dashed ${cfg.color || '#555'}`,
                bgcolor: 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0.35,
                cursor: 'default',
                transition: 'opacity 0.15s',
                '&:hover': { opacity: 0.8 },
                overflow: 'hidden',
                px: 1,
              }}
            >
              <Typography variant="caption" noWrap sx={{ fontSize: '0.65rem', color: cfg.color || '#888' }}>
                {cfg.emoji} {t.title}
              </Typography>
            </Box>
          );
        })}
      </Box>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={handleLeave}
        disableRestoreFocus
        sx={{ pointerEvents: 'none' }}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {activeTask && (
          <Box sx={{ p: 1.5, maxWidth: 300 }}>
            <Stack direction="row" alignItems="center" spacing={0.75}>
              <Typography sx={{ fontSize: '0.9rem' }}>{activeCfg.emoji}</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{activeTask.title}</Typography>
            </Stack>
            <Stack direction="row" spacing={1.5} sx={{ mt: 0.75 }}>
              <Chip label={activeCfg.label} size="small" sx={{ bgcolor: activeCfg.color, color: '#fff', fontSize: '0.65rem', height: 20 }} />
              {activeTask.timeSpent > 0 && (
                <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                  {formatMinutes(activeTask.timeSpent)}
                </Typography>
              )}
              {activeTask.category && activeTask.category !== 'General' && (
                <Typography variant="caption" color="text.secondary">{activeTask.category}</Typography>
              )}
            </Stack>
          </Box>
        )}
      </Popover>
    </Box>
  );
}

export function ContextGroup({ context, tasks, daySums, action, onNavigate }) {
  const [open, setOpen] = useState(true);
  const cfg = CONTEXT_CONFIG[context] || {};
  const contextMinutes = tasks.reduce((sum, t) => sum + todayMinutes(t), 0);

  if (!tasks.length) return null;

  return (
    <Paper sx={{ mb: 1.5 }}>
      <Box
        onClick={() => setOpen(!open)}
        sx={{
          display: 'flex', alignItems: 'center', p: 1.5, cursor: 'pointer',
          borderLeft: `4px solid ${cfg.color || '#666'}`,
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <Typography sx={{ mr: 1 }}>{cfg.emoji}</Typography>
        <Typography variant="subtitle1" sx={{ flexGrow: 1, fontWeight: 600 }}>
          {cfg.label}
        </Typography>
        <Chip label={formatMinutes(contextMinutes)} size="small" variant="outlined" sx={{ mr: 1 }} />
        <Chip label={tasks.length} size="small" color="primary" />
        <IconButton size="small">{open ? <ExpandLessIcon /> : <ExpandMoreIcon />}</IconButton>
      </Box>
      <Collapse in={open}>
        <List dense disablePadding>
          {tasks.map((t, i) => (
            <TaskRow
              key={t.id || i}
              task={t}
              action={action}
              onNavigate={onNavigate}
            />
          ))}
        </List>
      </Collapse>
    </Paper>
  );
}

export function AddTaskForm({ action }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [ctx, setCtx] = useState('');
  const busy = action.isPending;

  const submit = () => {
    if (!title.trim()) return;
    action.mutate({ action: 'add-task', title: title.trim(), context: ctx }, {
      onSuccess: () => { setTitle(''); setCtx(''); setOpen(false); },
    });
  };

  return (
    <Box sx={{ mb: 2 }}>
      {!open ? (
        <Button
          size="small"
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => setOpen(true)}
          sx={{ color: 'text.secondary', borderColor: 'rgba(255,255,255,0.12)', fontSize: '0.75rem' }}
        >
          Add Task
        </Button>
      ) : (
        <Paper sx={{ p: 1.5 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              autoFocus
              size="small"
              placeholder="Task description..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false); }}
              sx={{ flexGrow: 1 }}
              disabled={busy}
            />
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <Select value={ctx} onChange={(e) => setCtx(e.target.value)} displayEmpty disabled={busy}>
                {CTX_OPTIONS.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </Select>
            </FormControl>
            <Button size="small" variant="contained"
              startIcon={busy ? <CircularProgress size={14} /> : <AddIcon />}
              onClick={submit} disabled={busy || !title.trim()}>Add</Button>
            <Button size="small" onClick={() => setOpen(false)} sx={{ minWidth: 0, px: 1 }}>✕</Button>
          </Stack>
        </Paper>
      )}
    </Box>
  );
}

export default function TasksView() {
  const { data, isLoading, error } = useAllTasks();
  const { data: timeData } = useTimeSums();
  const action = useTaskAction();

  if (isLoading) return <LinearProgress />;
  if (error) return <Typography color="error">Error: {error.message}</Typography>;

  const { current, pending, completed } = data;
  const allPending = [...(pending || []), ...(data.routine || [])];
  const daySums = timeData?.sums?.day || {};

  // Group pending by context (use full pending list for display)
  const grouped = {};
  for (const ctx of CONTEXT_ORDER) {
    grouped[ctx] = [];
  }
  for (const task of pending) {
    const ctx = task.activityContext || 'unstructured';
    if (!grouped[ctx]) grouped[ctx] = [];
    grouped[ctx].push(task);
  }

  const completedCount = completed.filter((t) => {
    const today = new Date().toISOString().slice(0, 10);
    return t.sessions?.some((s) => s.endedAt?.startsWith(today));
  }).length;

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
        <Typography variant="h5">Today's Tasks</Typography>
        <Chip label={`${pending.length} pending`} variant="outlined" size="small" />
        <Box sx={{ flexGrow: 1 }} />
        <Button
          size="small"
          variant="outlined"
          onClick={() => action.mutate({ action: 'fill' })}
          disabled={action.isPending}
        >
          Fill
        </Button>
        <Button
          size="small"
          variant="outlined"
          onClick={() => action.mutate({ action: 'pull-goog' })}
          disabled={action.isPending}
        >
          Pull Google Tasks
        </Button>
        <Button
          size="small"
          variant="outlined"
          onClick={() => action.mutate({ action: 'pull-jira' })}
          disabled={action.isPending}
        >
          Pull Jira
        </Button>
      </Stack>

      <ActiveTask task={current.task} action={action} />

      <AddTaskForm action={action} />

      {CONTEXT_ORDER.map((ctx) => {
        const ctxTasks = grouped[ctx] || [];
        if (!ctxTasks.length) return null;
        return (
          <ContextGroup
            key={ctx}
            context={ctx}
            tasks={ctxTasks}
            daySums={daySums}
            action={action}
          />
        );
      })}

      <CompletedStrip completed={completed} />
    </Box>
  );
}
