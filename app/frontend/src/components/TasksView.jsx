import { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Chip, Collapse, IconButton,
  List, ListItem, ListItemText, LinearProgress, Stack,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { useAllTasks, useTimeSums } from '../hooks/useApi';
import { CONTEXT_CONFIG, CONTEXT_ORDER, formatMinutes } from '../lib/contexts';

function ActiveTask({ task }) {
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

  return (
    <Paper sx={{ p: 2, mb: 3, borderLeft: `4px solid ${ctx.color || '#666'}` }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <PlayArrowIcon sx={{ color: '#4caf50', animation: 'pulse 1.5s infinite' }} />
        <Typography variant="h6" sx={{ flexGrow: 1 }}>{task.title}</Typography>
        {(() => {
          const isRoutine = task.sourceType === 'routine';
          const isUs = task.activityContext === 'us';
          const fl = task.focusLevel != null ? task.focusLevel
            : isUs ? 0 : isRoutine ? 1 : 2;
          return (
            <Chip label={`f:${fl}`} size="small" variant="outlined" sx={{ fontSize: '0.7rem', opacity: task.focusLevel != null ? 1 : 0.5 }} />
          );
        })()}
        {task.priority != null && (
          <Chip label={`p:${task.priority}`} size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
        )}
        <Chip label={`${ctx.emoji} ${ctx.label}`} size="small" sx={{ bgcolor: ctx.color, color: '#fff' }} />
        <Typography variant="h6" sx={{ fontFamily: 'monospace', minWidth: 70, textAlign: 'right' }}>
          {formatMinutes(elapsed)}
        </Typography>
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

function ContextGroup({ context, tasks, daySums }) {
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
            <ListItem
              key={t.id || i}
              sx={{ pl: 4, borderBottom: '1px solid', borderColor: 'divider' }}
            >
              <ListItemText
                primary={t.title}
                secondary={t.timeSpent ? formatMinutes(t.timeSpent) : null}
              />
              {(() => {
                const isRoutine = t.sourceType === 'routine';
                const isUs = t.activityContext === 'us';
                const fl = t.focusLevel != null ? t.focusLevel
                  : isUs ? 0 : isRoutine ? 1 : 2;
                return (
                  <Chip label={`f:${fl}`} size="small" variant="outlined" sx={{ ml: 0.5, fontSize: '0.7rem', opacity: t.focusLevel != null ? 1 : 0.5 }} />
                );
              })()}
              {t.priority != null && (
                <Chip label={`p:${t.priority}`} size="small" variant="outlined" sx={{ ml: 0.5, fontSize: '0.7rem' }} />
              )}
              {t.jiraTicket && (
                <Chip label={t.jiraTicket} size="small" variant="outlined" sx={{ ml: 0.5 }} />
              )}
            </ListItem>
          ))}
        </List>
      </Collapse>
    </Paper>
  );
}

export default function TasksView() {
  const { data, isLoading, error } = useAllTasks();
  const { data: timeData } = useTimeSums();

  if (isLoading) return <LinearProgress />;
  if (error) return <Typography color="error">Error: {error.message}</Typography>;

  const { current, pending, completed } = data;
  const daySums = timeData?.sums?.day || {};

  // Group pending by context
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
        <Chip label={`${completedCount} completed`} color="success" size="small" />
        <Chip label={`${pending.length} pending`} variant="outlined" size="small" />
      </Stack>

      <ActiveTask task={current.task} />

      {CONTEXT_ORDER.map((ctx) => (
        <ContextGroup
          key={ctx}
          context={ctx}
          tasks={grouped[ctx] || []}
          daySums={daySums}
        />
      ))}
    </Box>
  );
}
