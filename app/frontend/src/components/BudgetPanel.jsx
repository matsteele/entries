'use client';

import { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, LinearProgress, Stack, Chip, TextField,
  IconButton, CircularProgress,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { useTimeBudget, useUpdateConfig } from '../hooks/useApi';
import { CONTEXT_CONFIG, CONTEXT_ORDER, formatMinutes } from '../lib/contexts';

const CTX_CODE_TO_NAME = {
  cul: 'cultivo', prof: 'professional', per: 'personal',
  soc: 'social', proj: 'projects', heal: 'health', us: 'unstructured',
};

function ContextBudgetRow({ code, cfg, minutesToday, target, focusedMins, onSaveTarget }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(target));
  useEffect(() => { if (!editing) setDraft(String(target)); }, [target, editing]);

  const pct = target > 0 ? Math.min((minutesToday / target) * 100, 100) : (minutesToday > 0 ? 100 : 0);
  const over = target > 0 && minutesToday > target;

  function handleSave() {
    const val = parseInt(draft, 10);
    if (!isNaN(val) && val >= 0) onSaveTarget(code, val);
    setEditing(false);
  }
  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') { setDraft(String(target)); setEditing(false); }
  }

  return (
    <Box sx={{ mb: 1.5 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.4 }}>
        <Typography variant="body2" sx={{ width: 24, textAlign: 'center' }}>{cfg.emoji}</Typography>
        <Typography variant="body2" sx={{ flexGrow: 1, fontWeight: 500 }}>{cfg.label}</Typography>
        <Typography variant="body2" sx={{ fontFamily: 'monospace', minWidth: 60, textAlign: 'right' }}>
          {formatMinutes(minutesToday)}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', px: 0.5 }}>/</Typography>
        {editing ? (
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <TextField
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              size="small"
              sx={{ width: 64 }}
              inputProps={{ style: { fontFamily: 'monospace', padding: '2px 6px', textAlign: 'right' } }}
              autoFocus
            />
            <Typography variant="body2" color="text.secondary">m</Typography>
            <IconButton size="small" onClick={handleSave}><CheckIcon sx={{ fontSize: 16 }} /></IconButton>
            <IconButton size="small" onClick={() => { setDraft(String(target)); setEditing(false); }}>
              <CloseIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Stack>
        ) : (
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Typography
              variant="body2"
              sx={{ fontFamily: 'monospace', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
              onClick={() => setEditing(true)}
            >
              {formatMinutes(target)}
            </Typography>
            <IconButton size="small" onClick={() => setEditing(true)} sx={{ opacity: 0.4, '&:hover': { opacity: 1 } }}>
              <EditIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Stack>
        )}
        <Chip
          label={`${Math.round(pct)}%`}
          size="small"
          sx={{
            fontSize: '0.65rem',
            bgcolor: over ? '#4caf5022' : 'transparent',
            color: over ? '#4caf50' : 'text.secondary',
            minWidth: 44,
          }}
        />
        {focusedMins > 0 && (
          <Chip
            label={`${formatMinutes(focusedMins)} focused`}
            size="small"
            variant="outlined"
            sx={{ fontSize: '0.65rem', color: cfg.color, borderColor: cfg.color }}
          />
        )}
      </Stack>
      <LinearProgress
        variant="determinate"
        value={pct}
        sx={{
          height: 8,
          borderRadius: 1,
          bgcolor: 'rgba(255,255,255,0.06)',
          '& .MuiLinearProgress-bar': {
            bgcolor: over ? '#4caf50' : cfg.color,
            borderRadius: 1,
          },
        }}
      />
    </Box>
  );
}

export default function BudgetPanel() {
  const { data, isLoading, error } = useTimeBudget();
  const { mutate: updateConfig } = useUpdateConfig();

  if (isLoading) return <CircularProgress size={20} />;
  if (error) return <Typography color="error" variant="body2">Budget error: {error.message}</Typography>;
  if (!data) return null;

  const { targets = {}, contextMinutes = {}, focusedMins = 0, focusedByContext = {} } = data;

  const totalMinutesToday = Object.values(contextMinutes).reduce((a, b) => a + b, 0);

  function handleSaveTarget(code, value) {
    const newTargets = { ...targets, [code]: value };
    updateConfig({ key: 'focused_minutes_targets', value: newTargets });
  }

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
        <Typography variant="h6">Context Budgets</Typography>
        <Chip label={`${formatMinutes(totalMinutesToday)} today`} size="small" color="primary" />
        {focusedMins > 0 && (
          <Chip label={`${formatMinutes(focusedMins)} focused`} size="small" color="secondary" />
        )}
      </Stack>

      {CONTEXT_ORDER.map((ctxName) => {
        const cfg = CONTEXT_CONFIG[ctxName];
        if (!cfg) return null;
        const code = cfg.code;
        const minutesToday = contextMinutes[code] || 0;
        const target = targets[code] ?? 0;
        const focused = focusedByContext[code] || 0;
        return (
          <ContextBudgetRow
            key={code}
            code={code}
            cfg={cfg}
            minutesToday={minutesToday}
            target={target}
            focusedMins={focused}
            onSaveTarget={handleSaveTarget}
          />
        );
      })}
    </Paper>
  );
}
