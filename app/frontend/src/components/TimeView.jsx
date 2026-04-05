import { useState } from 'react';
import {
  Box, Typography, Paper, LinearProgress, Stack, Chip, ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  ComposedChart, Line, Legend,
} from 'recharts';
import { useTimeSums, useTimeHistory } from '../hooks/useApi';
import { CONTEXT_CONFIG, CONTEXT_ORDER, formatMinutes } from '../lib/contexts';

function ContextBar({ label, minutes, total, color }) {
  const pct = total > 0 ? (minutes / total) * 100 : 0;
  return (
    <Box sx={{ mb: 1.5 }}>
      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography variant="body2">{label}</Typography>
        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
          {formatMinutes(minutes)} ({Math.round(pct)}%)
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={pct}
        sx={{
          height: 10, borderRadius: 1,
          bgcolor: 'rgba(255,255,255,0.08)',
          '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 1 },
        }}
      />
    </Box>
  );
}

function PeriodBreakdown({ title, sums }) {
  if (!sums) return null;

  const total = Object.values(sums).reduce((a, b) => a + b, 0);

  const chartData = CONTEXT_ORDER
    .filter((ctx) => (sums[ctx] || 0) > 0)
    .map((ctx) => ({
      name: CONTEXT_CONFIG[ctx]?.label || ctx,
      minutes: Math.round(sums[ctx] || 0),
      color: CONTEXT_CONFIG[ctx]?.color || '#666',
    }));

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <Typography variant="h6">{title}</Typography>
        <Chip label={formatMinutes(total)} size="small" color="primary" />
      </Stack>

      {chartData.length > 0 && (
        <Box sx={{ height: 180, mb: 2 }}>
          <ResponsiveContainer>
            <BarChart data={chartData} layout="vertical" margin={{ left: 80 }}>
              <XAxis type="number" tickFormatter={(v) => formatMinutes(v)} />
              <YAxis type="category" dataKey="name" width={80} />
              <Tooltip formatter={(v) => formatMinutes(v)} />
              <Bar dataKey="minutes" radius={[0, 4, 4, 0]}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Box>
      )}

      {CONTEXT_ORDER.map((ctx) => {
        const mins = sums[ctx] || 0;
        if (mins < 1) return null;
        const cfg = CONTEXT_CONFIG[ctx];
        return (
          <ContextBar
            key={ctx}
            label={`${cfg.emoji} ${cfg.label}`}
            minutes={mins}
            total={total}
            color={cfg.color}
          />
        );
      })}
    </Paper>
  );
}

function BudgetCard({ budget }) {
  if (budget == null) return null;
  const positive = budget >= 0;
  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>Time Budget</Typography>
      <Typography
        variant="h4"
        sx={{ fontFamily: 'monospace', color: positive ? '#4caf50' : '#f44336' }}
      >
        {positive ? '+' : ''}{formatMinutes(Math.abs(budget))}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {positive ? 'Earned unstructured time' : 'Unstructured time debt'}
      </Typography>
    </Paper>
  );
}

const PERIOD_LABELS = { day: 'Daily', week: 'Weekly', month: 'Monthly' };
const HISTORY_N = { day: 14, week: 8, month: 6 };

function HistoryChart({ period }) {
  const n = HISTORY_N[period] || 7;
  const { data, isLoading } = useTimeHistory(period, n);

  if (isLoading) return <LinearProgress sx={{ my: 2 }} />;
  if (!data?.results?.length) return null;

  const chartData = data.results.map((r) => {
    const row = { label: r.label, focusedMins: r.focusedMins };
    for (const ctx of CONTEXT_ORDER) {
      const code = CONTEXT_CONFIG[ctx]?.code;
      if (code) row[code] = r.contexts[code] || 0;
    }
    return row;
  });

  // Shorten labels
  const formatLabel = (v) => {
    if (period === 'day') return v.slice(5); // MM-DD
    if (period === 'week') return v.slice(5); // MM-DD
    return v.slice(0, 7); // YYYY-MM
  };

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>{PERIOD_LABELS[period]} History</Typography>
      <Box sx={{ height: 220 }}>
        <ResponsiveContainer>
          <ComposedChart data={chartData} margin={{ left: 0, right: 8 }}>
            <XAxis dataKey="label" tickFormatter={formatLabel} tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v) => `${Math.round(v / 60)}h`} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(v, name) => {
                if (name === 'Focused') return formatMinutes(Math.round(v));
                const cfg = Object.values(CONTEXT_CONFIG).find(c => c.code === name);
                return [formatMinutes(Math.round(v)), cfg?.label || name];
              }}
              labelFormatter={formatLabel}
            />
            <Legend formatter={(v) => {
              if (v === 'Focused') return 'Focused mins';
              const cfg = Object.values(CONTEXT_CONFIG).find(c => c.code === v);
              return cfg ? `${cfg.emoji} ${cfg.label}` : v;
            }} />
            {CONTEXT_ORDER.map((ctx) => {
              const cfg = CONTEXT_CONFIG[ctx];
              return (
                <Bar key={cfg.code} dataKey={cfg.code} stackId="a" fill={cfg.color} name={cfg.code} />
              );
            })}
            <Line
              type="monotone"
              dataKey="focusedMins"
              stroke="#fff"
              strokeWidth={2}
              dot={false}
              name="Focused"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </Box>
    </Paper>
  );
}

export default function TimeView() {
  const { data, isLoading, error } = useTimeSums();
  const [histPeriod, setHistPeriod] = useState('day');

  if (isLoading) return <LinearProgress />;
  if (error) return <Typography color="error">Error: {error.message}</Typography>;

  const { sums, budget } = data;

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>Time Tracking</Typography>
      <BudgetCard budget={budget} />
      <PeriodBreakdown title="Today" sums={sums?.day} />
      <PeriodBreakdown title="This Week" sums={sums?.week} />
      <PeriodBreakdown title="This Month" sums={sums?.month} />

      <Stack direction="row" alignItems="center" spacing={2} sx={{ mt: 3, mb: 1 }}>
        <Typography variant="h6">Historical</Typography>
        <ToggleButtonGroup
          size="small"
          value={histPeriod}
          exclusive
          onChange={(_, v) => v && setHistPeriod(v)}
        >
          <ToggleButton value="day">Daily</ToggleButton>
          <ToggleButton value="week">Weekly</ToggleButton>
          <ToggleButton value="month">Monthly</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <HistoryChart period={histPeriod} />
    </Box>
  );
}
