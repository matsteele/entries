import { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, TextField, Button, Chip, Stack,
  Collapse, IconButton, Tooltip,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import AddIcon from '@mui/icons-material/Add';
import { useIntentions, useSaveIntentions, useTaskAction } from '../hooks/useApi';
import { CONTEXT_CONFIG, TYPE_ICONS } from '../lib/contexts';

function IntentionRow({ item, onNavigate, taskAction }) {
  const cfg = CONTEXT_CONFIG[item.matchContext] || {};
  const typeIcon = TYPE_ICONS[item.matchType] || '•';
  const actions = item.actions || [];
  const busy = taskAction?.isPending;

  const handleLink = () => {
    const id = item.goalId || item.matchId;
    if (id && onNavigate) onNavigate('planning', { goalId: id });
  };

  const handleAdd = () => {
    const ctx = cfg.code || item.matchContext || 'proj';
    taskAction?.mutate({ action: 'add-task', title: item.matchTitle || item.intention, context: ctx });
  };

  const isLinkable = item.matchId || item.goalId;

  return (
    <Box sx={{ py: 0.6, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <Stack direction="row" alignItems="center" spacing={0.75}>
        {/* Intention text */}
        <Typography variant="body2" sx={{ fontSize: 12, lineHeight: 1.3 }}>
          {item.intention}
        </Typography>

        {/* Action buttons — right next to text */}
        {actions.includes('switch') && (
          <Tooltip title="Switch to">
            <IconButton size="small" sx={{ p: 0.25 }} disabled={busy}
              onClick={() => taskAction?.mutate({ action: 'switch-to-search', query: item.routineTitle })}>
              <PlayArrowIcon sx={{ fontSize: 13, color: '#4CAF50' }} />
            </IconButton>
          </Tooltip>
        )}
        {actions.includes('add') && (
          <Tooltip title="Add to docket">
            <IconButton size="small" sx={{ p: 0.25 }} disabled={busy} onClick={handleAdd}>
              <AddIcon sx={{ fontSize: 13 }} />
            </IconButton>
          </Tooltip>
        )}
        {actions.includes('start') && (
          <Tooltip title="Start now">
            <IconButton size="small" sx={{ p: 0.25 }} disabled={busy} onClick={handleAdd}>
              <PlayArrowIcon sx={{ fontSize: 13, color: '#4CAF50' }} />
            </IconButton>
          </Tooltip>
        )}
        {actions.includes('add-novel') && (
          <Tooltip title="Add as novel task">
            <IconButton size="small" sx={{ p: 0.25 }} disabled={busy} onClick={handleAdd}>
              <AddIcon sx={{ fontSize: 13 }} />
            </IconButton>
          </Tooltip>
        )}
      </Stack>

      {/* Match tag — clickable chip below intention */}
      {item.matchTitle && (
        <Chip
          icon={<span style={{ fontSize: 11, marginLeft: 6 }}>{typeIcon}</span>}
          label={`${cfg.emoji || ''} ${item.matchTitle}${item.note ? ` — ${item.note}` : ''}`}
          size="small"
          variant="outlined"
          onClick={isLinkable ? handleLink : undefined}
          sx={{
            mt: 0.25,
            fontSize: '0.65rem',
            height: 20,
            cursor: isLinkable ? 'pointer' : 'default',
            borderColor: cfg.color || '#555',
            color: 'rgba(255,255,255,0.85)',
            '&:hover': isLinkable ? { bgcolor: 'rgba(255,255,255,0.08)' } : {},
          }}
        />
      )}
      {item.matchType === 'none' && (
        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: 10, ml: 0.5 }}>
          no match in hierarchy
        </Typography>
      )}
    </Box>
  );
}

export default function DailyIntentions({ date, onNavigate }) {
  const { data: intentions } = useIntentions(date);
  const saveIntentions = useSaveIntentions();
  const taskAction = useTaskAction();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (intentions?.morning_intention) {
      setDraft(intentions.morning_intention);
    }
  }, [intentions?.morning_intention]);

  const hasIntention = !!intentions?.morning_intention;
  const allocations = intentions?.goal_allocations
    ? (typeof intentions.goal_allocations === 'string'
      ? JSON.parse(intentions.goal_allocations)
      : intentions.goal_allocations)
    : null;

  const outline = allocations?.outline || [];

  const handleSave = () => {
    if (!draft.trim()) return;
    saveIntentions.mutate(
      { date, morning_intention: draft.trim() },
      { onSuccess: () => setEditing(false) }
    );
  };

  if (!hasIntention && !editing) {
    return (
      <Paper sx={{ p: 2, mb: 2, border: '1px dashed rgba(255,255,255,0.15)', bgcolor: 'transparent' }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <LightbulbIcon sx={{ color: 'text.disabled', fontSize: 20 }} />
          <Typography variant="body2" color="text.disabled" sx={{ flexGrow: 1 }}>
            Set your intentions for today
          </Typography>
          <Button size="small" variant="outlined" onClick={() => setEditing(true)}
            sx={{ fontSize: '0.7rem' }}>
            Write
          </Button>
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper sx={{ mb: 2, overflow: 'hidden' }}>
      <Box
        onClick={() => !editing && setExpanded(!expanded)}
        sx={{
          display: 'flex', alignItems: 'center', p: 1.5, cursor: editing ? 'default' : 'pointer',
          borderLeft: '4px solid #FFB74D',
          '&:hover': editing ? {} : { bgcolor: 'action.hover' },
        }}
      >
        <LightbulbIcon sx={{ color: '#FFB74D', fontSize: 20, mr: 1 }} />
        <Typography variant="subtitle2" sx={{ flexGrow: 1, color: '#FFB74D' }}>
          Daily Intentions
        </Typography>
        {outline.length > 0 && !editing && (
          <Chip label={`${outline.length} matched`} size="small" variant="outlined"
            sx={{ fontSize: '0.6rem', height: 18, mr: 0.5 }} />
        )}
        {hasIntention && !editing && (
          <Tooltip title="Edit">
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); setEditing(true); }}>
              <EditIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}
        {!editing && (
          <IconButton size="small">
            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        )}
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ px: 2, pb: 2 }}>
          {editing ? (
            <Box>
              <TextField
                multiline
                minRows={3}
                maxRows={10}
                fullWidth
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write your intentions for today in natural language..."
                sx={{ mt: 1, '& textarea': { fontSize: 13, lineHeight: 1.6 } }}
                autoFocus
              />
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <Button size="small" variant="contained" startIcon={<SaveIcon />}
                  onClick={handleSave} disabled={!draft.trim() || saveIntentions.isPending}>
                  Save
                </Button>
                <Button size="small" onClick={() => { setEditing(false); setDraft(intentions?.morning_intention || ''); }}>
                  Cancel
                </Button>
              </Stack>
            </Box>
          ) : (
            <Box>
              {/* Narrative */}
              <Typography variant="body2" sx={{
                mt: 1, mb: 1, fontSize: 11, lineHeight: 1.5,
                color: 'text.disabled', fontStyle: 'italic',
              }}>
                {intentions?.morning_intention}
              </Typography>

              {/* Outline with matches */}
              {outline.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  {outline.map((item, i) => (
                    <IntentionRow key={i} item={item} onNavigate={onNavigate} taskAction={taskAction} />
                  ))}
                </Box>
              )}

              {/* Legacy format backwards compat */}
              {!outline.length && allocations?.matched?.length > 0 && (
                <Stack direction="row" spacing={0.75} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
                  {allocations.matched.map((g, i) => {
                    const cfg = CONTEXT_CONFIG[g.context] || {};
                    return (
                      <Chip key={g.goalId || i}
                        label={`${cfg.emoji || '🎯'} ${g.title}`} size="small" variant="outlined"
                        onClick={() => onNavigate?.('planning', { goalId: g.goalId })}
                        sx={{ fontSize: '0.7rem', cursor: 'pointer', borderColor: cfg.color || '#666' }}
                      />
                    );
                  })}
                </Stack>
              )}
            </Box>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}
