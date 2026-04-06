import { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Chip, Collapse, IconButton,
  List, ListItem, ListItemText, LinearProgress, Stack,
  TextField, Select, MenuItem, FormControl, Button,
  Popover, ToggleButton, ToggleButtonGroup, Tooltip,
  CircularProgress,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckIcon from '@mui/icons-material/Check';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { useAllTasks, useTimeSums, useTaskAction } from '../hooks/useApi';
import { CONTEXT_CONFIG, CONTEXT_ORDER, formatMinutes } from '../lib/contexts';

const CTX_OPTIONS = [
  { value: '', label: 'Auto' },
  { value: 'cul', label: '🌱 Cultivo' },
  { value: 'prof', label: '💼 Professional' },
  { value: 'per', label: '🏠 Personal' },
  { value: 'soc', label: '👥 Social' },
  { value: 'proj', label: '🚀 Projects' },
  { value: 'heal', label: '💪 Health' },
  { value: 'us', label: '☀️ Unstructured' },
];

function LevelPopover({ label, value, max, onSelect, pending }) {
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

function ActiveTask({ task, action }) {
  const [elapsed, setElapsed] = useState(0);

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
      <Paper sx={{ p: 2, mb: 3, opacity: 0.6 }}>
        <Typography variant="body2" color="text.secondary">No active task</Typography>
      </Paper>
    );
  }

  const ctx = CONTEXT_CONFIG[task.activityContext] || {};
  const isRoutine = task.sourceType === 'routine';
  const isUs = task.activityContext === 'us';
  const fl = task.focusLevel != null ? task.focusLevel : isUs ? 0 : isRoutine ? 1 : 2;

  return (
    <Paper sx={{ p: 2, mb: 3, borderLeft: `4px solid ${ctx.color || '#666'}` }}>
      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
        <PlayArrowIcon sx={{ color: '#4caf50', animation: 'pulse 1.5s infinite' }} />
        <Typography variant="h6" sx={{ flexGrow: 1 }}>{task.title}</Typography>
        <Chip label={`f:${fl}`} size="small" variant="outlined" sx={{ fontSize: '0.7rem', opacity: task.focusLevel != null ? 1 : 0.5 }} />
        {task.priority != null && (
          <Chip label={`p:${task.priority}`} size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
        )}
        <Chip label={`${ctx.emoji} ${ctx.label}`} size="small" sx={{ bgcolor: ctx.color, color: '#fff' }} />
        <Typography variant="h6" sx={{ fontFamily: 'monospace', minWidth: 70, textAlign: 'right' }}>
          {formatMinutes(elapsed)}
        </Typography>
        <Tooltip title="Complete current task">
          <Button
            size="small"
            variant="contained"
            color="success"
            startIcon={action.isPending ? <CircularProgress size={14} /> : <CheckIcon />}
            onClick={() => action.mutate({ action: 'complete-current' })}
            disabled={action.isPending}
            sx={{ ml: 1 }}
          >
            Complete
          </Button>
        </Tooltip>
      </Stack>
      {task.notes?.length > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {task.notes[task.notes.length - 1]?.text ?? task.notes[task.notes.length - 1]}
        </Typography>
      )}
      <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }`}</style>
    </Paper>
  );
}

function TaskRow({ task, taskN, action }) {
  const [hovered, setHovered] = useState(false);
  const ctx = CONTEXT_CONFIG[task.activityContext] || {};
  const isRoutine = task.sourceType === 'routine';
  const isUs = task.activityContext === 'us';
  const fl = task.focusLevel != null ? task.focusLevel : isUs ? 0 : isRoutine ? 1 : 2;
  const busy = action.isPending;

  return (
    <ListItem
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      sx={{ pl: 2, borderBottom: '1px solid', borderColor: 'divider', pr: 1 }}
      secondaryAction={
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ opacity: hovered ? 1 : 0.3, transition: 'opacity 0.15s' }}>
          <Tooltip title="Switch to this task">
            <IconButton
              size="small"
              onClick={() => action.mutate({ action: 'switch-to', taskN })}
              disabled={busy}
            >
              <PlayArrowIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Complete task">
            <IconButton
              size="small"
              onClick={() => action.mutate({ action: 'complete-task', taskN })}
              disabled={busy}
            >
              <CheckIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete task">
            <IconButton
              size="small"
              color="error"
              onClick={() => action.mutate({ action: 'delete-task', taskN })}
              disabled={busy}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      }
    >
      <ListItemText
        primary={
          <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
            <Typography variant="body2" sx={{ flexGrow: 1 }}>{task.title}</Typography>
            <LevelPopover
              label="f"
              value={fl}
              max={5}
              pending={busy}
              onSelect={(v) => action.mutate({ action: 'set-focus', taskN, level: v })}
            />
            <LevelPopover
              label="p"
              value={task.priority}
              max={5}
              pending={busy}
              onSelect={(v) => action.mutate({ action: 'set-priority', taskN, level: v })}
            />
            {task.jiraTicket && (
              <Chip label={task.jiraTicket} size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
            )}
            {task.timeSpent ? (
              <Chip label={formatMinutes(task.timeSpent)} size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
            ) : null}
          </Stack>
        }
      />
    </ListItem>
  );
}

function ContextGroup({ context, tasks, daySums, action, taskNOffset }) {
  const [open, setOpen] = useState(true);
  const cfg = CONTEXT_CONFIG[context] || {};
  const contextMinutes = daySums?.[context] || 0;

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
              taskN={taskNOffset + i + 1}
              action={action}
            />
          ))}
        </List>
      </Collapse>
    </Paper>
  );
}

function AddTaskForm({ action }) {
  const [title, setTitle] = useState('');
  const [ctx, setCtx] = useState('');
  const busy = action.isPending;

  const submit = () => {
    if (!title.trim()) return;
    action.mutate({ action: 'add-task', title: title.trim(), context: ctx }, {
      onSuccess: () => { setTitle(''); setCtx(''); },
    });
  };

  return (
    <Paper sx={{ p: 2, mb: 3 }}>
      <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>Add Task</Typography>
      <Stack direction="row" spacing={1} alignItems="center">
        <TextField
          size="small"
          placeholder="Task description..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          sx={{ flexGrow: 1 }}
          disabled={busy}
        />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <Select
            value={ctx}
            onChange={(e) => setCtx(e.target.value)}
            displayEmpty
            disabled={busy}
          >
            {CTX_OPTIONS.map(o => (
              <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button
          variant="contained"
          size="small"
          startIcon={busy ? <CircularProgress size={14} /> : <AddIcon />}
          onClick={submit}
          disabled={busy || !title.trim()}
        >
          Add
        </Button>
      </Stack>
    </Paper>
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

  // Build context-ordered flat list to compute per-task numbers (1-indexed, all-tasks view)
  const flatOrdered = CONTEXT_ORDER.flatMap(ctx => grouped[ctx] || []);

  const completedCount = completed.filter((t) => {
    const today = new Date().toISOString().slice(0, 10);
    return t.sessions?.some((s) => s.endedAt?.startsWith(today));
  }).length;

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
        <Typography variant="h5">Today's Tasks</Typography>
        <Chip label={`${completedCount} completed`} color="success" size="small" />
        <Chip label={`${pending.length} pending`} variant="outlined" size="small" />
        <Box sx={{ flexGrow: 1 }} />
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
        // Find the offset in flatOrdered for this context's tasks
        const firstTask = ctxTasks[0];
        const offset = flatOrdered.indexOf(firstTask);
        return (
          <ContextGroup
            key={ctx}
            context={ctx}
            tasks={ctxTasks}
            daySums={daySums}
            action={action}
            taskNOffset={offset}
          />
        );
      })}
    </Box>
  );
}
