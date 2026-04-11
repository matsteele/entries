import { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, TextField, Button, Chip, Stack,
  Collapse, IconButton, Tooltip, Link,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import FlagIcon from '@mui/icons-material/Flag';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import { useIntentions, useSaveIntentions } from '../hooks/useApi';
import { CONTEXT_CONFIG } from '../lib/contexts';

export default function DailyIntentions({ date, onNavigate }) {
  const { data: intentions } = useIntentions(date);
  const saveIntentions = useSaveIntentions();
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

  const handleSave = () => {
    if (!draft.trim()) return;
    saveIntentions.mutate(
      { date, morning_intention: draft.trim() },
      { onSuccess: () => setEditing(false) }
    );
  };

  const handleGoalClick = (goalId) => {
    if (onNavigate) onNavigate('planning', { goalId });
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
                placeholder="Write your intentions for today in natural language... What do you want to focus on? What matters most?"
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
              {/* Narrative summary */}
              <Typography variant="body2" sx={{
                mt: 1, mb: 1.5, fontSize: 12, lineHeight: 1.6,
                color: 'text.secondary', whiteSpace: 'pre-wrap',
              }}>
                {intentions?.morning_intention}
              </Typography>

              {/* Matched goals */}
              {allocations?.matched?.length > 0 && (
                <Box sx={{ mb: 1.5 }}>
                  <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mb: 0.5 }}>
                    <FlagIcon sx={{ fontSize: 12, mr: 0.5, verticalAlign: 'middle' }} />
                    Matched Goals
                  </Typography>
                  <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                    {allocations.matched.map((g, i) => {
                      const cfg = CONTEXT_CONFIG[g.context] || {};
                      return (
                        <Chip
                          key={g.goalId || i}
                          label={`${cfg.emoji || '🎯'} ${g.title}`}
                          size="small"
                          variant="outlined"
                          onClick={() => handleGoalClick(g.goalId)}
                          sx={{
                            fontSize: '0.7rem',
                            cursor: 'pointer',
                            borderColor: cfg.color || '#666',
                            '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                          }}
                        />
                      );
                    })}
                  </Stack>
                </Box>
              )}

              {/* Suggested goals */}
              {allocations?.suggested?.length > 0 && (
                <Box>
                  <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mb: 0.5 }}>
                    <LightbulbIcon sx={{ fontSize: 12, mr: 0.5, verticalAlign: 'middle' }} />
                    Potential Goals (not yet tracked)
                  </Typography>
                  <Stack spacing={0.25}>
                    {allocations.suggested.map((s, i) => (
                      <Typography key={i} variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem', pl: 1 }}>
                        • {s}
                      </Typography>
                    ))}
                  </Stack>
                </Box>
              )}
            </Box>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}
