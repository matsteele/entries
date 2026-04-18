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
import { CONTEXT_CONFIG } from '../lib/contexts';

const TYPE_LABELS = {
  routine: '🔄',
  action: '⚡',
  epic: '🏔️',
  project: '🚀',
  goal: '🎯',
  jira: '🎫',
  'google-task': '📋',
  pending: '📌',
  none: '•',
};

function IntentionRow({ item, onNavigate, taskAction }) {
  const cfg = CONTEXT_CONFIG[item.matchContext] || {};
  const typeIcon = TYPE_LABELS[item.matchType] || '•';
  const actions = item.actions || [];
  const busy = taskAction?.isPending;

  const handleLink = () => {
    const id = item.goalId || item.matchId;
    if (id && onNavigate) onNavigate('planning', { goalId: id });
  };

  const resolvedCtx = cfg.code || CONTEXT_CONFIG[item.matchContext]?.code || item.matchContext || 'proj';

  const handleAdd = () => {
    taskAction?.mutate({ action: 'add-task', title: item.matchTitle || item.intention, context: resolvedCtx });
  };

  const handleStart = () => {
    taskAction?.mutate({ action: 'add-switch', title: item.matchTitle || item.intention, context: resolvedCtx });
  };

  const isLinkable = item.matchId || item.goalId;

  return (
    <Box sx={{ py: 0.5, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <Stack direction="row" alignItems="flex-start" spacing={0.75}>
        <Typography sx={{ fontSize: 12, mt: 0.1, minWidth: 16 }}>{typeIcon}</Typography>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontSize: 12, lineHeight: 1.4 }}>
            {item.intention}
          </Typography>
          {/* Match breadcrumb */}
          {item.breadcrumb && (
            <Typography
              variant="caption"
              onClick={isLinkable ? handleLink : undefined}
              sx={{
                fontSize: '0.6rem',
                color: cfg.color || 'text.disabled',
                cursor: isLinkable ? 'pointer' : 'default',
                '&:hover': isLinkable ? { textDecoration: 'underline' } : {},
                display: 'block',
                mt: 0.15,
              }}
            >
              {cfg.emoji} {item.breadcrumb}
            </Typography>
          )}
          {item.matchType === 'routine' && item.matchTitle && (
            <Typography variant="caption" sx={{ fontSize: '0.6rem', color: '#81C784', display: 'block', mt: 0.15 }}>
              🔄 {item.matchTitle}
            </Typography>
          )}
          {item.matchType === 'jira' && item.matchTitle && (
            <Typography variant="caption" component="a"
              href={item.jiraUrl || '#'} target="_blank" rel="noopener noreferrer"
              sx={{ fontSize: '0.6rem', color: '#90CAF9', display: 'block', mt: 0.15, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
              🎫 {item.matchTitle}
            </Typography>
          )}
          {item.matchType === 'google-task' && item.matchTitle && (
            <Typography variant="caption" sx={{ fontSize: '0.6rem', color: '#CE93D8', display: 'block', mt: 0.15 }}>
              📋 {item.matchTitle}
            </Typography>
          )}
          {item.matchType === 'pending' && item.matchTitle && (
            <Typography variant="caption" sx={{ fontSize: '0.6rem', color: '#FFB74D', display: 'block', mt: 0.15 }}>
              📌 {item.matchTitle} (already in docket)
            </Typography>
          )}
          {item.matchType === 'none' && (() => {
            const noCfg = CONTEXT_CONFIG[item.matchContext] || {};
            return (
              <Typography variant="caption" sx={{ color: noCfg.color || 'text.disabled', fontSize: '0.55rem' }}>
                {noCfg.emoji ? `${noCfg.emoji} ${noCfg.label} · ` : ''}no match
              </Typography>
            );
          })()}
        </Box>
        {/* Action buttons */}
        <Stack direction="row" spacing={0} sx={{ mt: 0.1 }}>
          {actions.includes('switch') && (
            <Tooltip title="Switch to routine">
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
              <IconButton size="small" sx={{ p: 0.25 }} disabled={busy} onClick={handleStart}>
                <PlayArrowIcon sx={{ fontSize: 13, color: '#4CAF50' }} />
              </IconButton>
            </Tooltip>
          )}
          {actions.includes('add-novel') && (
            <Tooltip title="Add as new task">
              <IconButton size="small" sx={{ p: 0.25 }} disabled={busy} onClick={handleAdd}>
                <AddIcon sx={{ fontSize: 13 }} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Stack>
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
    // Save narrative only — the API auto-analyzes into outline
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
          <Chip label={`${outline.length} items`} size="small" variant="outlined"
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
                  {saveIntentions.isPending ? 'Analyzing...' : 'Save & Analyze'}
                </Button>
                <Button size="small" onClick={() => { setEditing(false); setDraft(intentions?.morning_intention || ''); }}>
                  Cancel
                </Button>
              </Stack>
            </Box>
          ) : (
            <Box>
              {/* Narrative — shown as muted italic */}
              <Typography variant="body2" sx={{
                mt: 1, mb: 1, fontSize: 11, lineHeight: 1.5,
                color: 'text.disabled', fontStyle: 'italic',
              }}>
                {intentions?.morning_intention}
              </Typography>

              {/* Analyzed outline */}
              {outline.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  {outline.map((item, i) => (
                    <IntentionRow key={i} item={item} onNavigate={onNavigate} taskAction={taskAction} />
                  ))}
                </Box>
              )}

              {/* No outline yet — offer to re-analyze */}
              {!outline.length && hasIntention && (
                <Button
                  size="small"
                  variant="outlined"
                  sx={{ mt: 1, fontSize: '0.7rem' }}
                  disabled={saveIntentions.isPending}
                  onClick={() => saveIntentions.mutate({ date, morning_intention: intentions.morning_intention })}
                >
                  {saveIntentions.isPending ? 'Analyzing...' : 'Analyze'}
                </Button>
              )}
            </Box>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}
