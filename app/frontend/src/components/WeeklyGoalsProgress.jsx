'use client';

import { Box, Typography, LinearProgress, Stack } from '@mui/material';
import { useWeeklyGoalProgress } from '../hooks/useApi';
import { CONTEXT_CONFIG } from '../lib/contexts';

function GoalRow({ goal }) {
  const ctx = CONTEXT_CONFIG[goal.context] || {};
  const target = goal.weekly_target_minutes;
  const actual = goal.actual_minutes;
  const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;
  const hasTarget = target > 0;

  const fmtMin = (m) => {
    if (!m) return '0m';
    const h = Math.floor(m / 60);
    const mins = m % 60;
    if (h === 0) return `${mins}m`;
    if (mins === 0) return `${h}h`;
    return `${h}h${mins}m`;
  };

  // Projects with targets
  const projectsWithTargets = (goal.projects || []).filter(p => p.weekly_target_minutes > 0);

  if (!hasTarget && projectsWithTargets.length === 0) return null;

  return (
    <Box sx={{ mb: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
        {ctx.emoji && <span style={{ fontSize: 12 }}>{ctx.emoji}</span>}
        <Typography variant="body2" sx={{ fontSize: 12, fontWeight: 600, flex: 1 }}>
          {goal.title}
        </Typography>
        {hasTarget && (
          <Typography variant="caption" sx={{ fontSize: 11, color: pct >= 100 ? '#4CAF50' : 'text.secondary', fontFamily: 'monospace' }}>
            {fmtMin(actual)}/{fmtMin(target)}
          </Typography>
        )}
      </Box>
      {hasTarget && (
        <LinearProgress
          variant="determinate"
          value={pct}
          sx={{
            height: 6, borderRadius: 3, mb: 0.5,
            bgcolor: 'rgba(255,255,255,0.06)',
            '& .MuiLinearProgress-bar': {
              bgcolor: pct >= 100 ? '#4CAF50' : pct >= 50 ? '#FF9800' : ctx.color || '#90CAF9',
              borderRadius: 3,
            },
          }}
        />
      )}
      {/* Project breakdown */}
      {projectsWithTargets.map(p => {
        const pPct = p.weekly_target_minutes > 0 ? Math.min(100, Math.round((p.actual_minutes / p.weekly_target_minutes) * 100)) : 0;
        return (
          <Box key={p.id} sx={{ ml: 2, mb: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="caption" sx={{ fontSize: 11, flex: 1, color: 'text.secondary' }}>
                {p.title}
              </Typography>
              <Typography variant="caption" sx={{ fontSize: 10, color: 'text.secondary', fontFamily: 'monospace' }}>
                {fmtMin(p.actual_minutes)}/{fmtMin(p.weekly_target_minutes)}
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={pPct}
              sx={{
                height: 3, borderRadius: 2,
                bgcolor: 'rgba(255,255,255,0.04)',
                '& .MuiLinearProgress-bar': {
                  bgcolor: pPct >= 100 ? '#4CAF50' : 'rgba(255,255,255,0.25)',
                  borderRadius: 2,
                },
              }}
            />
          </Box>
        );
      })}
    </Box>
  );
}

export default function WeeklyGoalsProgress() {
  const { data, isLoading } = useWeeklyGoalProgress();

  if (isLoading || !data?.goals) return null;

  // Only show goals or projects that have targets set
  const goalsWithTargets = data.goals.filter(g =>
    g.weekly_target_minutes > 0 || g.projects.some(p => p.weekly_target_minutes > 0)
  );

  if (goalsWithTargets.length === 0) return null;

  return (
    <Box sx={{ mb: 2, p: 1.5, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 1, border: '1px solid rgba(255,255,255,0.06)' }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: 11, mb: 1, display: 'block' }}>
        Weekly Goal Progress
      </Typography>
      {goalsWithTargets.map(g => <GoalRow key={g.id} goal={g} />)}
    </Box>
  );
}
