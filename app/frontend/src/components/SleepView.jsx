'use client';

import { useState, useMemo } from 'react';
import {
  Box, Typography, Paper, Stack, ToggleButtonGroup, ToggleButton,
  Tooltip, LinearProgress, Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import { useSleepHistory, useSaveSleepQuality } from '../hooks/useApi';

// ─── Constants ───────────────────────────────────────────────────────────────
const TARGET_SLEEP = 480; // 8 hours in minutes
const IDEAL_BEDTIME_H = 22; // 10pm
const BAR_HEIGHT = 140;
const QUALITY_COLORS = {
  1: '#ef5350', 2: '#ff7043', 3: '#ffa726', 4: '#66bb6a', 5: '#43a047',
};

function qualityColor(q) {
  if (!q) return 'rgba(150,180,255,0.4)';
  return QUALITY_COLORS[Math.round(q)] || 'rgba(150,180,255,0.4)';
}

function fmtMins(mins) {
  if (mins == null || isNaN(mins)) return '—';
  const h = Math.floor(Math.abs(mins) / 60), m = Math.round(Math.abs(mins) % 60);
  const sign = mins < 0 ? '-' : '';
  if (h === 0) return `${sign}${m}m`;
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h ${m}m`;
}

function fmtTimeFromMins(totalMins) {
  if (totalMins == null) return '—';
  let m = ((totalMins % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const ampm = h >= 12 ? 'pm' : 'am';
  return `${h % 12 || 12}:${String(mm).padStart(2, '0')}${ampm}`;
}

function dateLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[d.getDay()]} ${d.getDate()}`;
}

// ─── Stat Card ───────────────────────────────────────────────────────────────
function SleepStatCard({ label, value, sub, color }) {
  return (
    <Paper sx={{ p: 1.5, flex: 1, minWidth: 100, textAlign: 'center' }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem', display: 'block' }}>{label}</Typography>
      <Typography variant="h6" sx={{ fontFamily: 'monospace', fontWeight: 700, color: color || 'text.primary', fontSize: '1.1rem' }}>{value}</Typography>
      {sub && <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.55rem' }}>{sub}</Typography>}
    </Paper>
  );
}

// ─── Duration Chart ──────────────────────────────────────────────────────────
function DurationChart({ records, period }) {
  if (!records?.length) return <Typography color="text.secondary" variant="body2">No sleep data yet.</Typography>;

  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
  const maxDuration = Math.max(...sorted.map(r => r.durationMinutes), TARGET_SLEEP + 60);
  const targetPct = (TARGET_SLEEP / maxDuration) * 100;

  return (
    <Box>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>Sleep Duration</Typography>
      <Box sx={{ position: 'relative', height: BAR_HEIGHT, display: 'flex', alignItems: 'flex-end', gap: '2px' }}>
        {/* Target line */}
        <Box sx={{
          position: 'absolute', left: 0, right: 0,
          bottom: `${targetPct}%`,
          height: '1px', borderTop: '1px dashed rgba(255,255,255,0.25)', zIndex: 2,
        }}>
          <Typography sx={{ position: 'absolute', right: 0, top: -14, fontSize: '0.5rem', color: 'rgba(255,255,255,0.35)' }}>
            {fmtMins(TARGET_SLEEP)} target
          </Typography>
        </Box>

        {sorted.map((r, i) => {
          const pct = (r.durationMinutes / maxDuration) * 100;
          const qColor = qualityColor(r.quality);
          // Quality-adjusted inner bar
          const adjFactor = r.quality ? r.quality / 5 : 0.6;
          const adjPct = pct * adjFactor;
          const belowTarget = r.durationMinutes < TARGET_SLEEP;

          return (
            <Tooltip
              key={r.date}
              arrow
              placement="top"
              title={
                <Box sx={{ fontSize: '0.65rem', lineHeight: 1.5 }}>
                  <strong>{r.date}</strong><br />
                  Duration: {fmtMins(r.durationMinutes)}<br />
                  Quality: {r.quality ? `${r.quality}/5` : 'unrated'}<br />
                  Adjusted: {fmtMins(Math.round(r.durationMinutes * adjFactor))}<br />
                  {r.sleepStart && <>Bed: {new Date(r.sleepStart).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}<br /></>}
                  Wake: {new Date(r.wakeTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}<br />
                  {r.strategies?.length > 0 && <>Strategies: {r.strategies.join(', ')}</>}
                </Box>
              }
            >
              <Box sx={{
                flex: 1, position: 'relative', minWidth: 0, cursor: 'pointer',
                '&:hover .sleep-bar': { filter: 'brightness(1.3)' },
              }}>
                {/* Outer bar — full duration */}
                <Box className="sleep-bar" sx={{
                  position: 'absolute', bottom: 0, left: '10%', right: '10%',
                  height: `${pct}%`, bgcolor: qColor, opacity: 0.35,
                  borderRadius: '2px 2px 0 0', transition: 'all 0.15s',
                  border: belowTarget ? '1px solid rgba(244,67,54,0.3)' : 'none',
                }} />
                {/* Inner bar — quality-adjusted */}
                <Box sx={{
                  position: 'absolute', bottom: 0, left: '10%', right: '10%',
                  height: `${adjPct}%`, bgcolor: qColor, opacity: 0.8,
                  borderRadius: '2px 2px 0 0', transition: 'all 0.15s',
                }} />
                {/* Day label */}
                <Typography sx={{
                  position: 'absolute', bottom: -16, left: '50%', transform: 'translateX(-50%)',
                  fontSize: '0.45rem', color: 'text.disabled', whiteSpace: 'nowrap',
                }}>
                  {dateLabel(r.date)}
                </Typography>
              </Box>
            </Tooltip>
          );
        })}
      </Box>
      <Box sx={{ mt: 2.5 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Box sx={{ width: 10, height: 10, bgcolor: 'rgba(150,180,255,0.35)', borderRadius: '2px' }} />
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.55rem' }}>Duration</Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Box sx={{ width: 10, height: 10, bgcolor: 'rgba(150,180,255,0.8)', borderRadius: '2px' }} />
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.55rem' }}>Quality-adjusted</Typography>
          </Stack>
        </Stack>
      </Box>
    </Box>
  );
}

// ─── Bed/Wake Consistency ────────────────────────────────────────────────────
function ConsistencyChart({ records }) {
  if (!records?.length) return null;
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));

  // Convert to minutes-from-midnight for bed/wake
  const bedtimes = sorted.map(r => {
    if (!r.sleepStart) return null;
    const d = new Date(r.sleepStart);
    let mins = d.getHours() * 60 + d.getMinutes();
    if (mins < 720) mins += 1440; // after midnight = late
    return mins;
  });
  const waketimes = sorted.map(r => {
    const d = new Date(r.wakeTime);
    return d.getHours() * 60 + d.getMinutes();
  });

  const validBeds = bedtimes.filter(b => b != null);
  const avgBed = validBeds.length ? Math.round(validBeds.reduce((a, b) => a + b, 0) / validBeds.length) : null;
  const avgWake = waketimes.length ? Math.round(waketimes.reduce((a, b) => a + b, 0) / waketimes.length) : null;

  // Variance (stddev in minutes)
  const bedVariance = validBeds.length > 1
    ? Math.round(Math.sqrt(validBeds.reduce((sum, b) => sum + Math.pow(b - avgBed, 2), 0) / validBeds.length))
    : 0;
  const wakeVariance = waketimes.length > 1
    ? Math.round(Math.sqrt(waketimes.reduce((sum, w) => sum + Math.pow(w - avgWake, 2), 0) / waketimes.length))
    : 0;

  // Display range: 8pm (1200) to 10am (600)
  const rangeStart = 1200; // 8pm in shifted space
  const rangeEnd = 1680;   // ~4am next day + wake range ~10am = 600 in shifted
  // For wake: 0-720 range
  const wakeRangeStart = 240;  // 4am
  const wakeRangeEnd = 720;    // noon

  return (
    <Box>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>Sleep Schedule Consistency</Typography>
      <Stack direction="row" spacing={3}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem' }}>
            Avg Bedtime: <strong style={{ color: 'rgba(150,180,255,0.8)' }}>{avgBed != null ? fmtTimeFromMins(avgBed % 1440) : '—'}</strong>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}> ±{bedVariance}m</span>
          </Typography>
          <Box sx={{ mt: 0.5, height: 20, position: 'relative', bgcolor: 'rgba(255,255,255,0.04)', borderRadius: 0.5, overflow: 'hidden' }}>
            {sorted.map((r, i) => {
              if (bedtimes[i] == null) return null;
              const pct = ((bedtimes[i] - rangeStart) / (rangeEnd - rangeStart)) * 100;
              if (pct < 0 || pct > 100) return null;
              return (
                <Tooltip key={r.date} title={`${r.date}: ${fmtTimeFromMins(bedtimes[i] % 1440)}`} arrow>
                  <Box sx={{
                    position: 'absolute', top: 2, bottom: 2, left: `${pct}%`, width: 4,
                    bgcolor: 'rgba(100,130,255,0.7)', borderRadius: 1, transform: 'translateX(-50%)',
                  }} />
                </Tooltip>
              );
            })}
            {/* Avg marker */}
            {avgBed != null && (
              <Box sx={{
                position: 'absolute', top: 0, bottom: 0,
                left: `${((avgBed - rangeStart) / (rangeEnd - rangeStart)) * 100}%`,
                width: 2, bgcolor: 'rgba(255,255,255,0.5)', zIndex: 2,
              }} />
            )}
          </Box>
          <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.25 }}>
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.45rem' }}>8pm</Typography>
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.45rem' }}>4am</Typography>
          </Stack>
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem' }}>
            Avg Wake: <strong style={{ color: 'rgba(150,180,255,0.8)' }}>{avgWake != null ? fmtTimeFromMins(avgWake) : '—'}</strong>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}> ±{wakeVariance}m</span>
          </Typography>
          <Box sx={{ mt: 0.5, height: 20, position: 'relative', bgcolor: 'rgba(255,255,255,0.04)', borderRadius: 0.5, overflow: 'hidden' }}>
            {sorted.map((r, i) => {
              const pct = ((waketimes[i] - wakeRangeStart) / (wakeRangeEnd - wakeRangeStart)) * 100;
              if (pct < 0 || pct > 100) return null;
              return (
                <Tooltip key={r.date} title={`${r.date}: ${fmtTimeFromMins(waketimes[i])}`} arrow>
                  <Box sx={{
                    position: 'absolute', top: 2, bottom: 2, left: `${pct}%`, width: 4,
                    bgcolor: 'rgba(255,193,7,0.6)', borderRadius: 1, transform: 'translateX(-50%)',
                  }} />
                </Tooltip>
              );
            })}
            {avgWake != null && (
              <Box sx={{
                position: 'absolute', top: 0, bottom: 0,
                left: `${((avgWake - wakeRangeStart) / (wakeRangeEnd - wakeRangeStart)) * 100}%`,
                width: 2, bgcolor: 'rgba(255,255,255,0.5)', zIndex: 2,
              }} />
            )}
          </Box>
          <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.25 }}>
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.45rem' }}>4am</Typography>
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.45rem' }}>noon</Typography>
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}

// ─── Quality Trend Line ──────────────────────────────────────────────────────
function QualityTrend({ records }) {
  const rated = records?.filter(r => r.quality != null) || [];
  if (!rated.length) return (
    <Box>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>Quality Trend</Typography>
      <Typography variant="body2" color="text.disabled">No quality ratings yet. Use the ⭐ badge on the sleep bar to rate.</Typography>
    </Box>
  );

  const sorted = [...rated].sort((a, b) => a.date.localeCompare(b.date));
  const HEIGHT = 60;

  return (
    <Box>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>Quality Trend</Typography>
      <Box sx={{ position: 'relative', height: HEIGHT }}>
        {/* Grid lines */}
        {[1, 2, 3, 4, 5].map(q => (
          <Box key={q} sx={{
            position: 'absolute', left: 0, right: 0,
            bottom: `${((q - 1) / 4) * 100}%`,
            height: '1px', bgcolor: q === 3 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)',
          }}>
            <Typography sx={{ position: 'absolute', left: -14, top: -6, fontSize: '0.45rem', color: 'text.disabled' }}>{q}</Typography>
          </Box>
        ))}
        {/* SVG line */}
        <svg width="100%" height={HEIGHT} style={{ position: 'absolute', top: 0, left: 0 }}>
          <polyline
            fill="none"
            stroke="rgba(150,180,255,0.6)"
            strokeWidth="1.5"
            points={sorted.map((r, i) => {
              const x = sorted.length === 1 ? 50 : (i / (sorted.length - 1)) * 100;
              const y = HEIGHT - ((r.quality - 1) / 4) * HEIGHT;
              return `${x}%,${y}`;
            }).join(' ')}
          />
          {sorted.map((r, i) => {
            const x = sorted.length === 1 ? 50 : (i / (sorted.length - 1)) * 100;
            const y = HEIGHT - ((r.quality - 1) / 4) * HEIGHT;
            return (
              <circle
                key={r.date}
                cx={`${x}%`} cy={y} r="3"
                fill={qualityColor(r.quality)}
                stroke="rgba(0,0,0,0.3)" strokeWidth="0.5"
              />
            );
          })}
        </svg>
      </Box>
    </Box>
  );
}

// ─── Sleep Debt Meter ────────────────────────────────────────────────────────
function SleepDebtMeter({ records }) {
  if (!records?.length) return null;

  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));

  // Running debt: cumulative deviation from target
  let debt = 0;
  const points = sorted.map(r => {
    debt += TARGET_SLEEP - r.durationMinutes;
    return { date: r.date, debt };
  });

  const maxDebt = Math.max(...points.map(p => Math.abs(p.debt)), 120);
  const HEIGHT = 50;

  return (
    <Box>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        Sleep Debt
        <Typography component="span" variant="caption" color="text.disabled" sx={{ ml: 1, fontSize: '0.55rem' }}>
          cumulative vs {fmtMins(TARGET_SLEEP)} target
        </Typography>
      </Typography>
      <Box sx={{ position: 'relative', height: HEIGHT }}>
        {/* Zero line */}
        <Box sx={{ position: 'absolute', left: 0, right: 0, top: '50%', height: '1px', bgcolor: 'rgba(255,255,255,0.15)' }}>
          <Typography sx={{ position: 'absolute', left: -14, top: -6, fontSize: '0.45rem', color: 'text.disabled' }}>0</Typography>
        </Box>
        <svg width="100%" height={HEIGHT} style={{ position: 'absolute', top: 0, left: 0 }}>
          {/* Debt area fill */}
          <polyline
            fill="none"
            stroke={debt > 0 ? 'rgba(244,67,54,0.7)' : 'rgba(76,175,80,0.7)'}
            strokeWidth="1.5"
            points={points.map((p, i) => {
              const x = points.length === 1 ? 50 : (i / (points.length - 1)) * 100;
              const y = (HEIGHT / 2) + (p.debt / maxDebt) * (HEIGHT / 2);
              return `${x}%,${y}`;
            }).join(' ')}
          />
        </svg>
      </Box>
      <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.25 }}>
        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.45rem' }}>
          {sorted[0]?.date}
        </Typography>
        <Typography variant="caption" sx={{
          fontSize: '0.55rem',
          color: debt > 0 ? 'rgba(244,67,54,0.8)' : 'rgba(76,175,80,0.8)',
          fontWeight: 600,
        }}>
          {debt > 0 ? `${fmtMins(debt)} debt` : debt < 0 ? `${fmtMins(-debt)} surplus` : 'even'}
        </Typography>
        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.45rem' }}>
          {sorted[sorted.length - 1]?.date}
        </Typography>
      </Stack>
    </Box>
  );
}

// ─── Strategy Effectiveness ──────────────────────────────────────────────────
function StrategyTable({ strategyEffectiveness }) {
  if (!strategyEffectiveness?.length) return (
    <Box>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>Strategy Effectiveness</Typography>
      <Typography variant="body2" color="text.disabled">No strategy data yet. Rate sleep quality and log strategies via <code>/t rest</code> + <code>/t wake</code>.</Typography>
    </Box>
  );

  return (
    <Box>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>Strategy Effectiveness</Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontSize: '0.6rem', py: 0.5 }}>Strategy</TableCell>
            <TableCell align="center" sx={{ fontSize: '0.6rem', py: 0.5 }}>Avg Quality</TableCell>
            <TableCell align="center" sx={{ fontSize: '0.6rem', py: 0.5 }}>Used</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {strategyEffectiveness.map(s => (
            <TableRow key={s.name}>
              <TableCell sx={{ fontSize: '0.65rem', py: 0.3 }}>{s.name}</TableCell>
              <TableCell align="center" sx={{ py: 0.3 }}>
                <Box sx={{
                  display: 'inline-block', px: 0.8, py: 0.2, borderRadius: 1,
                  bgcolor: qualityColor(s.avgQuality), fontSize: '0.6rem', fontWeight: 600,
                }}>
                  {s.avgQuality}/5
                </Box>
              </TableCell>
              <TableCell align="center" sx={{ fontSize: '0.6rem', py: 0.3, color: 'text.disabled' }}>{s.usageCount}x</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

// ─── Rest/Nap Summary ────────────────────────────────────────────────────────
function RestSummary({ restRecords, avgRestMinutes }) {
  if (!restRecords?.length) return null;

  const sorted = [...restRecords].sort((a, b) => a.date.localeCompare(b.date));
  const byDate = {};
  for (const r of sorted) {
    if (!byDate[r.date]) byDate[r.date] = [];
    byDate[r.date].push(r);
  }

  return (
    <Box>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        Rest & Naps
        {avgRestMinutes > 0 && (
          <Typography component="span" variant="caption" color="text.disabled" sx={{ ml: 1, fontSize: '0.55rem' }}>
            avg {fmtMins(avgRestMinutes)}/day
          </Typography>
        )}
      </Typography>
      <Stack spacing={0.5}>
        {Object.entries(byDate).slice(-7).map(([date, rests]) => (
          <Stack key={date} direction="row" spacing={1} alignItems="center">
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.55rem', minWidth: 50 }}>{dateLabel(date)}</Typography>
            {rests.map((r, i) => (
              <Tooltip key={i} title={`${new Date(r.restStart).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} – ${new Date(r.restEnd).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`} arrow>
                <Box sx={{
                  px: 0.8, py: 0.2, borderRadius: 1,
                  bgcolor: 'rgba(120,100,200,0.25)', fontSize: '0.55rem', fontFamily: 'monospace',
                }}>
                  {fmtMins(r.durationMinutes)}
                </Box>
              </Tooltip>
            ))}
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

// ─── Main Export ─────────────────────────────────────────────────────────────
export default function SleepView() {
  const [period, setPeriod] = useState(14);
  const { data, isLoading } = useSleepHistory(period);
  const saveQuality = useSaveSleepQuality();

  const records = useMemo(() => {
    if (!data?.records) return [];
    return data.records.filter(r => r.durationMinutes > 60);
  }, [data]);

  if (isLoading) return <LinearProgress />;

  const lastNight = data?.lastNight;
  const avgMins = data?.avgMinutes;
  const avgQuality = data?.avgQuality;
  const qualityAdjusted = data?.qualityAdjustedAvg;
  const sleepDebt = data?.sleepDebt;

  // Best/worst nights
  const best = records.length ? records.reduce((a, b) => {
    const aScore = a.durationMinutes * ((a.quality || 3) / 5);
    const bScore = b.durationMinutes * ((b.quality || 3) / 5);
    return aScore > bScore ? a : b;
  }) : null;
  const worst = records.length ? records.reduce((a, b) => {
    const aScore = a.durationMinutes * ((a.quality || 3) / 5);
    const bScore = b.durationMinutes * ((b.quality || 3) / 5);
    return aScore < bScore ? a : b;
  }) : null;

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
        <Typography variant="h5">Sleep</Typography>
        <ToggleButtonGroup
          value={period}
          exclusive
          onChange={(_, v) => v && setPeriod(v)}
          size="small"
        >
          {[7, 14, 30, 90].map(d => (
            <ToggleButton key={d} value={d} sx={{ px: 1.5, py: 0.25, fontSize: '0.65rem' }}>{d}d</ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>

      {/* Summary cards */}
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
        <SleepStatCard
          label="Last Night"
          value={lastNight ? fmtMins(lastNight.durationMinutes) : '—'}
          sub={lastNight?.quality ? `quality: ${lastNight.quality}/5` : 'unrated'}
          color={lastNight?.durationMinutes >= TARGET_SLEEP ? '#66bb6a' : '#ff7043'}
        />
        <SleepStatCard label="Avg Duration" value={avgMins ? fmtMins(avgMins) : '—'} sub={`${period}d period`} />
        <SleepStatCard label="Avg Quality" value={avgQuality || '—'} sub="out of 5" color={avgQuality >= 4 ? '#66bb6a' : avgQuality >= 3 ? '#ffa726' : '#ef5350'} />
        <SleepStatCard
          label="Quality-Adjusted"
          value={qualityAdjusted ? fmtMins(qualityAdjusted) : '—'}
          sub="duration × (q/5)"
          color="rgba(150,180,255,0.8)"
        />
        <SleepStatCard
          label="Sleep Debt"
          value={sleepDebt != null ? fmtMins(sleepDebt) : '—'}
          sub={`vs ${fmtMins(TARGET_SLEEP)}/night`}
          color={sleepDebt > 120 ? '#ef5350' : sleepDebt > 0 ? '#ffa726' : '#66bb6a'}
        />
      </Stack>

      {/* Duration chart */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <DurationChart records={records} period={period} />
      </Paper>

      {/* Two-column layout */}
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <Paper sx={{ p: 2, flex: 1 }}>
          <ConsistencyChart records={records} />
        </Paper>
        <Paper sx={{ p: 2, flex: 1 }}>
          <QualityTrend records={records} />
        </Paper>
      </Stack>

      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <Paper sx={{ p: 2, flex: 1 }}>
          <SleepDebtMeter records={records} />
        </Paper>
        <Paper sx={{ p: 2, flex: 1 }}>
          <StrategyTable strategyEffectiveness={data?.strategyEffectiveness} />
        </Paper>
      </Stack>

      {/* Rest/nap tracking */}
      {data?.restRecords?.length > 0 && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <RestSummary restRecords={data.restRecords} avgRestMinutes={data.avgRestMinutes} />
        </Paper>
      )}

      {/* Best/worst summary */}
      {records.length > 1 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>Notable Nights</Typography>
          <Stack spacing={0.5}>
            {best && (
              <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'rgba(76,175,80,0.8)' }}>
                Best: {best.date} — {fmtMins(best.durationMinutes)}{best.quality ? ` · q:${best.quality}` : ''}
                {best.strategies?.length > 0 ? ` (${best.strategies.join(', ')})` : ''}
              </Typography>
            )}
            {worst && worst.date !== best?.date && (
              <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'rgba(244,67,54,0.7)' }}>
                Worst: {worst.date} — {fmtMins(worst.durationMinutes)}{worst.quality ? ` · q:${worst.quality}` : ''}
              </Typography>
            )}
          </Stack>
        </Paper>
      )}
    </Box>
  );
}
