'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import {
  Box, Typography, Paper, Stack, Tooltip, Button, LinearProgress,
  Slider, Popover, Table, TableBody,
  TableCell, TableHead, TableRow,
} from '@mui/material';
import {
  useSleepHistory, useSaveSleepQuality,
  useUpdateSleepSession, useAddSleepSession, useDeleteSleepSession,
} from '../hooks/useApi';

// ─── Design tokens (resting/violet theme) ─────────────────────────────────────
const C = {
  base:    '#7c3aed',          // violet-600
  bright:  '#a78bfa',          // violet-400
  dim:     'rgba(109,40,217,0.55)',
  glow:    'rgba(124,58,237,0.22)',
  ideal:   'rgba(139,92,246,0.12)',
  late:    '#ea580c',          // orange – started late / woke early
  early:   '#059669',          // emerald – started early / slept in
  grid:    'rgba(167,139,250,0.08)',
  gridMid: 'rgba(167,139,250,0.2)',
  avgBed:  'rgba(96,165,250,0.85)',   // blue  – avg bedtime
  avgWake: 'rgba(251,191,36,0.85)',   // amber – avg wake
  sdBed:   'rgba(96,165,250,0.1)',
  sdWake:  'rgba(251,191,36,0.08)',
};
const QCOL = { 1:'#dc2626', 2:'#ea580c', 3:'#d97706', 4:'#16a34a', 5:'#059669' };

// Layout
const ROW_H   = 44;
const BAR_H   = 26;
const REST_H  = 10;
const LBL_W   = 56;
const STAT_W  = 100;
const SCORE_W = 72;
const HIST_H  = 68;
const HIST_N  = 96;   // 15-min slots × 24h

// Ideal: 10 pm → 6:30 am
const IDEAL_START_H = 22;
const IDEAL_END_H   = 6.5;
const TARGET_MINS   = 480;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10); }
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00'); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function noonBefore(wakeDate) {          // ms of noon the day before wakeDate
  const d = new Date(wakeDate + 'T12:00:00'); d.setDate(d.getDate() - 1);
  return d.getTime();
}
function toPct(isoOrMs, wakeDate) {
  const ms = typeof isoOrMs === 'number' ? isoOrMs : new Date(isoOrMs).getTime();
  return ((ms - noonBefore(wakeDate)) / 86400000) * 100;
}
function hourToPct(h) { return (((h - 12) + 24) % 24 / 24) * 100; }
function fmtD(m) {
  if (m == null || isNaN(m)) return '—';
  const h = Math.floor(m / 60), mm = Math.round(m % 60);
  return mm ? `${h}h ${mm}m` : `${h}h`;
}
function fmtH(h) {
  if (h == null) return '—';
  const hn = ((h % 24) + 24) % 24;
  const hh = Math.floor(hn), mm = Math.round((hn - hh) * 60);
  return `${hh % 12 || 12}:${String(mm).padStart(2, '0')}${hh >= 12 ? 'pm' : 'am'}`;
}
function fmtT(iso) {
  if (!iso) return '?';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function dayLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return ['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()] + ' ' + d.getDate();
}
function fmtRange(dates) {
  if (!dates.length) return '';
  const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(dates[dates.length - 1])} – ${fmt(dates[0])}`;
}
function fmtSd(sd) { return sd < 1 ? `${Math.round(sd * 60)}m` : `${sd.toFixed(1)}h`; }
function fmtDev(mins) {
  const abs = Math.abs(Math.round(mins));
  if (abs < 60) return `${abs}m`;
  const h = Math.floor(abs / 60), m = abs % 60;
  return m ? `${h}h${m}m` : `${h}h`;
}

// Ideal start/end for a given wakeDate row
function idealForRow(wakeDate) {
  const prevDate = addDays(wakeDate, -1);
  const startedAt = new Date(`${prevDate}T${String(IDEAL_START_H).padStart(2,'0')}:00:00`).toISOString();
  const endedAt   = new Date(`${wakeDate}T${String(Math.floor(IDEAL_END_H)).padStart(2,'0')}:${String(Math.round((IDEAL_END_H % 1) * 60)).padStart(2,'0')}:00`).toISOString();
  return { startedAt, endedAt };
}

// Compute deviation of a session from ideal (minutes)
function deviation(session, wakeDate) {
  const ideal = idealForRow(wakeDate);
  const bedDev  = (new Date(session.sleepStart) - new Date(ideal.startedAt)) / 60000; // + = late
  const wakeDev = (new Date(session.wakeTime)   - new Date(ideal.endedAt))   / 60000; // + = slept in
  return { bedDev, wakeDev };
}

// Bar gradient based on deviation
function barGradient(bedDev, wakeDev, quality) {
  // Unrated: translucent neutral grey-violet
  if (quality == null) {
    const base = 'rgba(140,140,170,0.28)';
    return `linear-gradient(to right, ${base} 0%, rgba(120,120,155,0.32) 50%, ${base} 100%)`;
  }
  const qBright = (quality / 5) * 0.4 + 0.55;
  const baseR = Math.round(124 + (1 - qBright) * 20);
  const baseG = Math.round(58  * qBright);
  const baseB = Math.round(237 * qBright);
  const base  = `rgba(${baseR},${baseG},${baseB},${qBright})`;

  const leftCol  = Math.abs(bedDev)  < 20 ? base : bedDev  > 20 ? `rgba(234,88,12,0.75)` : `rgba(5,150,105,0.75)`;
  const rightCol = Math.abs(wakeDev) < 20 ? base : wakeDev < -20 ? `rgba(234,88,12,0.75)` : `rgba(5,150,105,0.75)`;
  return `linear-gradient(to right, ${leftCol} 0%, ${base} 40%, ${base} 60%, ${rightCol} 100%)`;
}

// ─── Sleep Score (0–100) ───────────────────────────────────────────────────────
// quality × capped_duration × window_factor, normalized to 100
// window_factor: 1.0 = all sleep inside ideal window, 0.5 = all outside
function sleepScore(session, wakeDate) {
  if (!session.sleepStart || !session.wakeTime) return null;
  const q = session.quality || 3; // default q=3 if unrated
  const startMs = new Date(session.sleepStart).getTime();
  const endMs   = new Date(session.wakeTime).getTime();
  const durationMins = (endMs - startMs) / 60000;
  if (durationMins < 30) return null;

  const ideal = idealForRow(wakeDate);
  const idealStartMs = new Date(ideal.startedAt).getTime();
  const idealEndMs   = new Date(ideal.endedAt).getTime();
  const insideMins = Math.max(0, (Math.min(endMs, idealEndMs) - Math.max(startMs, idealStartMs)) / 60000);
  const insideFrac = durationMins > 0 ? insideMins / durationMins : 0;

  // 0.5 (all outside) → 1.0 (all inside)
  const windowFactor = 0.5 + insideFrac * 0.5;
  const cappedMins   = Math.min(durationMins, TARGET_MINS);
  const MAX_SCORE    = 5 * TARGET_MINS; // 2400
  return Math.round((q * cappedMins * windowFactor) / MAX_SCORE * 100);
}

// ─── Time Axis ─────────────────────────────────────────────────────────────────
function TimeAxis() {
  const marks = [
    { h: 12, l: '12pm' }, { h: 15, l: '3pm' }, { h: 18, l: '6pm' },
    { h: 21, l: '9pm'  }, { h: 0,  l: '12am'}, { h: 3,  l: '3am' },
    { h: 6,  l: '6am'  }, { h: 9,  l: '9am' }, { h: 12, l: '12pm'},
  ];
  return (
    <Box sx={{ display:'flex', mb:0.25 }}>
      <Box sx={{ width:SCORE_W, flexShrink:0, display:'flex', alignItems:'flex-end', pb:0.5 }}>
        <Typography sx={{ fontSize:'0.42rem', color:'rgba(94,234,212,0.35)', lineHeight:1, pl:0.5 }}>score</Typography>
      </Box>
      <Box sx={{ width:LBL_W, flexShrink:0 }} />
      <Box sx={{ flex:1, position:'relative', height:18 }}>
        {marks.map(({ h, l }, i) => {
          const p = i === 8 ? 100 : hourToPct(h);
          return (
            <Typography key={`${h}-${i}`} sx={{
              position:'absolute', left:`${p}%`, transform:'translateX(-50%)',
              fontSize:'0.55rem', lineHeight:1, top:4, whiteSpace:'nowrap',
              color: h === 0 ? 'rgba(167,139,250,0.7)' : 'rgba(255,255,255,0.22)',
              fontWeight: h === 0 ? 600 : 400,
            }}>{l}</Typography>
          );
        })}
      </Box>
      <Box sx={{ width:STAT_W, flexShrink:0 }} />
    </Box>
  );
}

// ─── Bed/Wake Time Distribution (KDE + rug plot) ─────────────────────────────
const DIST_H = 32;
const TICK_H = 6;
const TOTAL_DIST_H = DIST_H + TICK_H;
function TimeDistribution({ bedCounts, wakeCounts, bedTicks, wakeTicks, n, avgBedH, avgWakeH }) {
  if (n < 2) return null;
  const N = bedCounts.length;
  const globalMax = Math.max(...bedCounts, ...wakeCounts, 0.1);
  const avgBedX  = avgBedH  != null ? (hourToPct(avgBedH  % 24) / 100) * N : null;
  const avgWakeX = avgWakeH != null ? (hourToPct(avgWakeH % 24) / 100) * N : null;
  // Current time as position
  const now = new Date();
  const nowH = now.getHours() + now.getMinutes() / 60;
  const nowX = (hourToPct(nowH) / 100) * N;

  const areaPath = (counts) => [
    `0,${DIST_H}`,
    ...counts.map((c, i) => `${(i + 0.5)},${DIST_H - (c / globalMax) * (DIST_H - 3)}`),
    `${N},${DIST_H}`,
  ].join(' ');

  const linePts = (counts) =>
    counts.map((c, i) => `${(i + 0.5)},${DIST_H - (c / globalMax) * (DIST_H - 3)}`).join(' ');

  return (
    <Box sx={{ display:'flex', mb:0.25 }}>
      <Box sx={{ width:SCORE_W, flexShrink:0 }} />
      <Box sx={{ width:LBL_W, flexShrink:0, display:'flex', alignItems:'flex-end', pb:0.25 }}>
        <Typography sx={{ fontSize:'0.42rem', color:'rgba(167,139,250,0.3)', lineHeight:1 }}>
          times
        </Typography>
      </Box>
      <Box sx={{ flex:1, position:'relative' }}>
        <svg
          viewBox={`0 0 ${N} ${TOTAL_DIST_H}`}
          width="100%" height={TOTAL_DIST_H}
          preserveAspectRatio="none"
          style={{ display:'block' }}
        >
          <defs>
            <linearGradient id="bedDist" x1="0" y1="0" x2="0" y2={DIST_H} gradientUnits="userSpaceOnUse">
              <stop offset="0%"   stopColor="rgba(96,165,250,0.55)" />
              <stop offset="100%" stopColor="rgba(96,165,250,0.02)" />
            </linearGradient>
            <linearGradient id="wakeDist" x1="0" y1="0" x2="0" y2={DIST_H} gradientUnits="userSpaceOnUse">
              <stop offset="0%"   stopColor="rgba(251,191,36,0.5)" />
              <stop offset="100%" stopColor="rgba(251,191,36,0.02)" />
            </linearGradient>
          </defs>
          {/* KDE curves */}
          <polygon points={areaPath(bedCounts)} fill="url(#bedDist)" />
          <polyline points={linePts(bedCounts)} fill="none" stroke="rgba(96,165,250,0.5)" strokeWidth="0.5" />
          <polygon points={areaPath(wakeCounts)} fill="url(#wakeDist)" />
          <polyline points={linePts(wakeCounts)} fill="none" stroke="rgba(251,191,36,0.45)" strokeWidth="0.5" />
          {/* Baseline */}
          <line x1="0" y1={DIST_H} x2={N} y2={DIST_H} stroke="rgba(167,139,250,0.15)" strokeWidth="0.3" />
          {/* Rug plot: individual ticks below the baseline */}
          {bedTicks.map((pct, i) => {
            const x = (pct / 100) * N;
            return <line key={`b${i}`} x1={x} y1={DIST_H + 1} x2={x} y2={DIST_H + TICK_H}
              stroke="rgba(96,165,250,0.55)" strokeWidth="0.6" />;
          })}
          {wakeTicks.map((pct, i) => {
            const x = (pct / 100) * N;
            return <line key={`w${i}`} x1={x} y1={DIST_H + 1} x2={x} y2={DIST_H + TICK_H}
              stroke="rgba(251,191,36,0.5)" strokeWidth="0.6" />;
          })}
          {/* Avg bed line + label */}
          {avgBedX != null && <>
            <line x1={avgBedX} y1={0} x2={avgBedX} y2={DIST_H} stroke="rgba(96,165,250,0.7)" strokeWidth="0.5" strokeDasharray="1.5,1" />
          </>}
          {/* Avg wake line + label */}
          {avgWakeX != null && <>
            <line x1={avgWakeX} y1={0} x2={avgWakeX} y2={DIST_H} stroke="rgba(251,191,36,0.65)" strokeWidth="0.5" strokeDasharray="1.5,1" />
          </>}
          {/* Now marker */}
          <line x1={nowX} y1={0} x2={nowX} y2={TOTAL_DIST_H} stroke="rgba(255,255,255,0.35)" strokeWidth="0.4" />
        </svg>
        {/* Overlay labels (HTML for crisp text) */}
        {avgBedX != null && (
          <Typography sx={{ position:'absolute', bottom: TICK_H + 1, left:`${(avgBedX/N)*100}%`, transform:'translateX(-50%)',
            fontSize:'0.48rem', color:'#fff', lineHeight:1, zIndex:1, textShadow:'0 1px 6px rgba(0,0,0,1), 0 0 3px rgba(96,165,250,0.6)', whiteSpace:'nowrap', fontWeight:700 }}>
            avg {fmtH(avgBedH)}
          </Typography>
        )}
        {avgWakeX != null && (
          <Typography sx={{ position:'absolute', bottom: TICK_H + 1, left:`${(avgWakeX/N)*100}%`, transform:'translateX(-50%)',
            fontSize:'0.48rem', color:'#fff', lineHeight:1, zIndex:1, textShadow:'0 1px 6px rgba(0,0,0,1), 0 0 3px rgba(251,191,36,0.6)', whiteSpace:'nowrap', fontWeight:700 }}>
            avg {fmtH(avgWakeH)}
          </Typography>
        )}
        <Typography sx={{ position:'absolute', top:0, left:`${(nowX/N)*100}%`, transform:'translateX(-50%)',
          fontSize:'0.38rem', color:'rgba(255,255,255,0.45)', lineHeight:1, zIndex:1, whiteSpace:'nowrap' }}>
          now
        </Typography>
        <Typography sx={{ position:'absolute', top:1, left:'35%', fontSize:'0.42rem', color:'rgba(255,255,255,0.7)', lineHeight:1, zIndex:1, textShadow:'0 0 4px rgba(0,0,0,0.8)' }}>
          bedtimes
        </Typography>
        <Typography sx={{ position:'absolute', top:1, right:'15%', fontSize:'0.42rem', color:'rgba(255,255,255,0.7)', lineHeight:1, zIndex:1, textShadow:'0 0 4px rgba(0,0,0,0.8)' }}>
          wake times
        </Typography>
      </Box>
      <Box sx={{ width:STAT_W, flexShrink:0 }} />
    </Box>
  );
}

// ─── Sleep Row ────────────────────────────────────────────────────────────────
function SleepRow({ wakeDate, sessions, rests, works, isToday, getOverride, onDragStart, onAddSleep, onDeleteSleep, onBarClick, avgQuality }) {
  const ideal = idealForRow(wakeDate);
  const idealLp = Math.max(0, toPct(ideal.startedAt, wakeDate));
  const idealRp = Math.min(100, toPct(ideal.endedAt, wakeDate));

  const totalMins = sessions.reduce((s, sess, idx) => {
    const ov = getOverride(idx);
    const start = ov ? ov.startedAt : sess.sleepStart;
    const end   = ov ? ov.endedAt   : sess.wakeTime;
    return s + Math.round((new Date(end) - new Date(start)) / 60000);
  }, 0);

  return (
    <Box sx={{
      display:'flex', alignItems:'center', height:ROW_H,
      borderBottom: '1px solid rgba(255,255,255,0.03)',
      '&:hover': { bgcolor:'rgba(124,58,237,0.03)' },
      '&:hover .add-hint': { opacity:1 },
    }}>
      {/* Score column — filled by ScoreSparkline overlay */}
      <Box sx={{ width:SCORE_W, flexShrink:0 }} />
      {/* Day label */}
      <Box sx={{ width:LBL_W, flexShrink:0, pr:1, textAlign:'right' }}>
        <Typography sx={{
          fontSize:'0.63rem', lineHeight:1.3, whiteSpace:'nowrap',
          color: isToday ? C.bright : 'rgba(255,255,255,0.35)',
          fontWeight: isToday ? 700 : 400,
        }}>{dayLabel(wakeDate)}</Typography>
        {isToday && <Box sx={{ width:6, height:6, borderRadius:'50%', bgcolor:C.bright, ml:'auto', mt:0.25 }} />}
      </Box>

      {/* Timeline */}
      <Box sx={{ flex:1, height:ROW_H, position:'relative' }}>
        {/* Ghost ideal zone (only for real sessions — defaults already are the ideal) */}
        {!sessions[0]?._isDefault && (
          <Box sx={{
            position:'absolute', left:`${idealLp}%`, width:`${Math.max(0, idealRp - idealLp)}%`,
            top:(ROW_H - BAR_H)/2, height:BAR_H,
            border:`1px dashed rgba(167,139,250,0.18)`, borderRadius:1,
            pointerEvents:'none', zIndex:1,
          }} />
        )}

        {/* Deviation hairlines: thin line through row center from ideal → actual, label at bar edge */}
        {sessions.map((s, idx) => {
          if (s._isDefault) return null;
          const ov = getOverride(idx);
          const rawL = toPct(ov?.startedAt || s.sleepStart, wakeDate);
          const rawR = toPct(ov?.endedAt   || s.wakeTime,   wakeDate);
          // Skip sessions fully outside the visible noon-to-noon window
          if (rawL > 100 || rawR < 0) return null;
          const barL = Math.max(0, Math.min(100, rawL));
          const barR = Math.max(0, Math.min(100, rawR));
          if (barR - barL < 0.5) return null; // invisible bar
          const { bedDev, wakeDev } = deviation(s, wakeDate);
          const cy = ROW_H / 2;

          return <Box key={`dev-${idx}`} sx={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:3 }}>
            {/* Bed side: blue line from idealLp to barL, label at barL */}
            {Math.abs(bedDev) > 5 && (() => {
              const lineL = Math.min(idealLp, barL);
              const lineR = Math.max(idealLp, barL);
              if (lineR - lineL < 0.2) return null;
              return <>
                <Box sx={{
                  position:'absolute',
                  left: `${lineL}%`, width: `${lineR - lineL}%`,
                  top: cy - 0.5, height: '1px',
                  bgcolor: C.avgBed, opacity: 0.85,
                }} />
                <Typography sx={{
                  position:'absolute',
                  left: `${barL}%`, top: cy - 8,
                  transform:'translateX(-50%)',
                  fontSize:'0.38rem', color: C.avgBed, lineHeight:1,
                  whiteSpace:'nowrap', fontWeight:700,
                  textShadow:'0 0 5px rgba(0,0,0,1)',
                }}>
                  {bedDev > 0 ? '+' : ''}{fmtDev(bedDev)}
                </Typography>
              </>;
            })()}
            {/* Wake side: amber line from barR to idealRp, label at barR */}
            {Math.abs(wakeDev) > 5 && (() => {
              const lineL = Math.min(idealRp, barR);
              const lineR = Math.max(idealRp, barR);
              if (lineR - lineL < 0.2) return null;
              return <>
                <Box sx={{
                  position:'absolute',
                  left: `${lineL}%`, width: `${lineR - lineL}%`,
                  top: cy - 0.5, height: '1px',
                  bgcolor: C.avgWake, opacity: 0.85,
                }} />
                <Typography sx={{
                  position:'absolute',
                  left: `${barR}%`, top: cy + 3,
                  transform:'translateX(-50%)',
                  fontSize:'0.38rem', color: C.avgWake, lineHeight:1,
                  whiteSpace:'nowrap', fontWeight:700,
                  textShadow:'0 0 5px rgba(0,0,0,1)',
                }}>
                  {wakeDev > 0 ? '+' : ''}{fmtDev(wakeDev)}
                </Typography>
              </>;
            })()}
          </Box>;
        })}

        {/* Sleep bars */}
        {sessions.map((s, idx) => {
          const isDef = s._isDefault;
          const ov = getOverride(idx);
          const startIso = ov?.startedAt || s.sleepStart;
          const endIso   = ov?.endedAt   || s.wakeTime;
          const lp = Math.max(0, toPct(startIso, wakeDate));
          const rp = Math.min(100, toPct(endIso,   wakeDate));
          const wp = Math.max(0, rp - lp);
          if (wp < 0.05) return null;
          const { bedDev, wakeDev } = deviation(s, wakeDate);
          const grad = isDef ? 'rgba(124,58,237,0.15)' : barGradient(bedDev, wakeDev, s.quality);
          const qualBorderColor = s.quality ? QCOL[s.quality] : 'transparent';

          // Violin taper: quality 5 = rectangle, quality 1 = true point (50%)
          // Unrated: uses avgQuality for the period as proxy taper
          const effectiveQ = s.quality ?? avgQuality ?? null;
          // Q5→0% (rect), Q4→12.5%, Q3→25%, Q2→37.5%, Q1→50% (true point at center)
          const taper = isDef ? 0 : (effectiveQ != null ? ((5 - effectiveQ) / 4) * 50 : 0);
          const clipViol = taper > 0
            ? `polygon(0% ${taper}%, 100% 0%, 100% 100%, 0% ${100 - taper}%)`
            : undefined;

          return (
            <Tooltip key={idx} followCursor placement="top" title={isDef
              ? 'Ideal sleep — drag to adjust, then it saves'
              : <Box sx={{ fontSize:'0.65rem', lineHeight:1.6 }}>
                  <strong>{dayLabel(wakeDate)}</strong><br/>
                  {fmtT(startIso)} – {fmtT(endIso)}<br/>
                  {fmtD(Math.round((new Date(endIso)-new Date(startIso))/60000))}
                  {s.quality ? ` · ★${s.quality}/5` : ''}<br/>
                  <span style={{ color: Math.abs(bedDev) < 20 ? '#a3e635' : bedDev > 0 ? '#fb923c' : '#34d399' }}>
                    bed {bedDev > 0 ? `+${Math.round(bedDev)}m late` : `${Math.round(-bedDev)}m early`}
                  </span><br/>
                  <span style={{ color: Math.abs(wakeDev) < 20 ? '#a3e635' : wakeDev < 0 ? '#fb923c' : '#34d399' }}>
                    wake {wakeDev > 0 ? `+${Math.round(wakeDev)}m late` : `${Math.round(-wakeDev)}m early`}
                  </span>
                </Box>
            }>
              <Box
                onClick={e => { e.stopPropagation(); if (!isDef) onBarClick(e, wakeDate, idx, s); }}
                sx={{
                  position:'absolute', left:`${lp}%`, width:`${wp}%`,
                  top:(ROW_H - BAR_H)/2, height:BAR_H, zIndex:2,
                  cursor:'pointer',
                  '&:hover .bar-fill': { filter: isDef ? 'brightness(1.6)' : 'brightness(1.15)' },
                  '&:hover': { zIndex:4 },
                  '&:hover .drag-l, &:hover .drag-r': { opacity:1 },
                  '&:hover .del-btn': { opacity: isDef ? 0 : 1 },
                }}
              >
                {/* Violin-shaped fill layer (clipped, non-interactive) */}
                <Box className="bar-fill" sx={{
                  position:'absolute', inset:0,
                  background: grad, borderRadius:'3px',
                  ...(clipViol ? { clipPath: clipViol } : {}),
                  border: isDef ? '1px dashed rgba(167,139,250,0.3)' : 'none',
                  borderTop: isDef ? '1px dashed rgba(167,139,250,0.3)' : `2px solid ${qualBorderColor}`,
                  boxShadow: isToday && !isDef ? `0 0 12px ${C.glow}` : 'none',
                  transition:'filter 0.1s',
                  pointerEvents:'none',
                }} />

                {/* (deviation shown via external hairlines, not inside bar) */}

                {/* Left drag */}
                <Box className="drag-l" onMouseDown={e => { e.stopPropagation(); onDragStart(e, wakeDate, idx, 'left', s.sleepStart, s.wakeTime, isDef); }}
                  sx={{ position:'absolute', left:0, top:0, bottom:0, width:8, cursor:'ew-resize',
                    bgcolor:'rgba(255,255,255,0.15)', opacity:0, borderRadius:'3px 0 0 3px', zIndex:5 }} />
                {/* Right drag */}
                <Box className="drag-r" onMouseDown={e => { e.stopPropagation(); onDragStart(e, wakeDate, idx, 'right', s.sleepStart, s.wakeTime, isDef); }}
                  sx={{ position:'absolute', right:0, top:0, bottom:0, width:8, cursor:'ew-resize',
                    bgcolor:'rgba(255,255,255,0.15)', opacity:0, borderRadius:'0 3px 3px 0', zIndex:5 }} />
                {/* Delete */}
                {!isDef && <Box className="del-btn" onClick={e => { e.stopPropagation(); onDeleteSleep(s.sleepStart); }}
                  sx={{ position:'absolute', top:2, right:10, width:13, height:13, borderRadius:'50%',
                    bgcolor:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:'0.45rem', color:'rgba(255,130,130,0.9)', opacity:0, cursor:'pointer', zIndex:6,
                    transition:'opacity .15s', '&:hover': { bgcolor:'rgba(200,0,0,0.5)' } }}>✕</Box>}
                {/* Quality stars (rated) */}
                {s.quality && wp > 8 && (
                  <Box sx={{ position:'absolute', left:'50%', top:'50%', transform:'translate(-50%,-50%)',
                    fontSize:'0.5rem', color:'rgba(255,255,255,0.75)', pointerEvents:'none', lineHeight:1 }}>
                    {'★'.repeat(s.quality)}
                  </Box>
                )}
                {/* Avg quality callout (unrated, non-default) */}
                {!s.quality && !isDef && avgQuality != null && wp > 8 && (
                  <Box sx={{ position:'absolute', left:'50%', top:'50%', transform:'translate(-50%,-50%)',
                    fontSize:'0.42rem', color:'rgba(180,180,200,0.55)', pointerEvents:'none', lineHeight:1, whiteSpace:'nowrap' }}>
                    avg ★{avgQuality.toFixed(1)}
                  </Box>
                )}
                {/* Default label */}
                {isDef && wp > 8 && (
                  <Box sx={{ position:'absolute', left:'50%', top:'50%', transform:'translate(-50%,-50%)',
                    fontSize:'0.48rem', color:'rgba(167,139,250,0.5)', pointerEvents:'none', lineHeight:1, whiteSpace:'nowrap' }}>
                    ideal
                  </Box>
                )}
              </Box>
            </Tooltip>
          );
        })}

        {/* Work session ghost backdrop — very subtle, details on hover */}
        {(works || []).map((w, idx) => {
          const lp = Math.max(0, Math.min(100, toPct(w.startedAt, wakeDate)));
          const rp = Math.max(0, Math.min(100, toPct(w.endedAt,   wakeDate)));
          const wp = rp - lp;
          if (wp < 0.2) return null;
          const durMins = Math.round((new Date(w.endedAt) - new Date(w.startedAt)) / 60000);
          return (
            <Tooltip key={`ws${idx}`} followCursor placement="top"
              title={`Work: ${fmtT(w.startedAt)}–${fmtT(w.endedAt)} (${fmtD(durMins)})`}>
              <Box sx={{
                position:'absolute', left:`${lp}%`, width:`${wp}%`,
                top: (ROW_H - 5) / 2, height: 5, zIndex: 1,
                bgcolor: 'rgba(167,139,250,0.07)',
                borderTop: '1px solid rgba(167,139,250,0.10)',
                borderBottom: '1px solid rgba(167,139,250,0.10)',
              }} />
            </Tooltip>
          );
        })}

        {/* Rest/nap bars */}
        {rests.map((r, idx) => {
          const lp = Math.max(0, toPct(r.restStart, wakeDate));
          const rp = Math.min(100, toPct(r.restEnd,  wakeDate));
          const wp = Math.max(0, rp - lp);
          if (wp < 0.05) return null;
          return (
            <Tooltip key={`r${idx}`} followCursor placement="top"
              title={`Rest: ${fmtT(r.restStart)}–${fmtT(r.restEnd)} (${fmtD(r.durationMinutes)})`}>
              <Box sx={{
                position:'absolute', left:`${lp}%`, width:`${wp}%`,
                top: (ROW_H + BAR_H)/2 - REST_H + 2, height:REST_H, zIndex:2,
                bgcolor:'rgba(91,33,182,0.45)', borderRadius:'2px',
                border:'1px solid rgba(124,58,237,0.3)',
              }} />
            </Tooltip>
          );
        })}
      </Box>

      {/* Stats column reserved for DurationSparkline overlay */}
      <Box sx={{ width:STAT_W, flexShrink:0 }} />
    </Box>
  );
}

// ─── Sleep Density Histogram ──────────────────────────────────────────────────
function SleepHistogram({ counts, total, days }) {
  const max = Math.max(...counts, 1);
  const H = HIST_H;
  const N = counts.length;

  // Polygon: grows downward from top baseline (flipped)
  const pts = [
    `0,0`,
    ...counts.map((c, i) => `${(i + 0.5)},${(c / max) * (H - 6)}`),
    `${N},0`,
  ].join(' ');

  const maxPct = Math.round((max / Math.max(total, 1)) * 100);

  return (
    <Box sx={{ display:'flex', mt:0.5, pt:0.5, borderTop:`1px solid rgba(167,139,250,0.1)` }}>
      <Box sx={{ width:SCORE_W, flexShrink:0 }} />
      <Box sx={{ width:LBL_W, flexShrink:0, display:'flex', flexDirection:'column', justifyContent:'space-between', pt:0.5 }}>
        <Typography sx={{ fontSize:'0.46rem', color:'rgba(167,139,250,0.4)', lineHeight:1 }}>
          0
        </Typography>
        <Typography sx={{ fontSize:'0.46rem', color:'rgba(167,139,250,0.4)', lineHeight:1 }}>
          {maxPct}%
        </Typography>
      </Box>
      <Box sx={{ flex:1, position:'relative' }}>
        <svg
          viewBox={`0 0 ${N} ${H}`}
          width="100%" height={HIST_H}
          preserveAspectRatio="none"
          style={{ display:'block' }}
        >
          <defs>
            <linearGradient id="hGrad" x1="0" y1="0" x2="0" y2={H} gradientUnits="userSpaceOnUse">
              <stop offset="0%"   stopColor="rgba(91,33,182,0.05)" />
              <stop offset="40%"  stopColor="rgba(109,40,217,0.35)" />
              <stop offset="100%" stopColor="rgba(167,139,250,0.75)" />
            </linearGradient>
          </defs>
          {/* Top baseline */}
          <line x1="0" y1="0.5" x2={N} y2="0.5"
            stroke="rgba(167,139,250,0.15)" strokeWidth="0.5" />
          <polygon points={pts} fill="url(#hGrad)" />
          <polyline
            points={counts.map((c,i) => `${(i+0.5)},${(c/max)*(H-6)}`).join(' ')}
            fill="none" stroke="rgba(167,139,250,0.4)" strokeWidth="0.4"
          />
        </svg>
        <Typography sx={{
          position:'absolute', bottom:3, right:4,
          fontSize:'0.46rem', color:'rgba(167,139,250,0.4)', lineHeight:1,
        }}>
          n={total} nights · {days}d window
        </Typography>
        <Typography sx={{
          position:'absolute', top:2, left:'50%', transform:'translateX(-50%)',
          fontSize:'0.44rem', color:'rgba(167,139,250,0.3)', lineHeight:1,
        }}>
          sleep density
        </Typography>
      </Box>
      <Box sx={{ width:STAT_W, flexShrink:0 }} />
    </Box>
  );
}

// ─── Score Sparkline (left-side overlay, mirrors DurationSparkline) ───────────
function ScoreSparkline({ rowDates, sessionsByDate }) {
  const scoreColor = (s) => {
    if (s == null) return 'rgba(167,139,250,0.2)';
    if (s >= 80) return '#86efac';
    if (s >= 60) return '#a3e635';
    if (s >= 40) return '#fdba74';
    return '#f87171';
  };

  const rows = rowDates.map(wd => {
    const sessions = sessionsByDate[wd] || [];
    if (sessions[0]?._isDefault) return { score: null, isDef: true, wd };
    const scores = sessions
      .filter(s => s.sleepStart && s.wakeTime)
      .map(s => sleepScore(s, wd))
      .filter(s => s != null);
    const score = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    return { score, isDef: false, wd };
  });

  const H = rows.length * ROW_H;
  const W = SCORE_W;
  // Map score 0–100 to x position: left pad 4, right pad 12 (leaves room for label)
  const scoreX = (s) => s != null ? (s / 100) * (W - 16) + 4 : 4;

  const pts = rows.map((r, i) => ({ x: scoreX(r.score), y: i * ROW_H + ROW_H / 2, ...r }));
  const validPts = pts.filter(p => !p.isDef && p.score != null);

  const areaPoints = validPts.length > 1
    ? [`4,0`, ...pts.map(p => `${p.x},${p.y}`), `4,${H}`].join(' ')
    : null;

  return (
    <Box sx={{ position:'absolute', top:0, left:0, width:W, height:H, pointerEvents:'none', zIndex:3 }}>
      <svg width={W} height={H} style={{ position:'absolute', top:0, left:0 }}>
        <defs>
          <linearGradient id="scoreAreaGrad" x1="0" y1="0" x2={W} y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%"  stopColor="rgba(94,234,212,0.02)" />
            <stop offset="100%" stopColor="rgba(94,234,212,0.3)" />
          </linearGradient>
        </defs>
        {areaPoints && <polygon points={areaPoints} fill="url(#scoreAreaGrad)" opacity="0.35" />}
        {/* Score=70 reference (dashed) */}
        <line x1={scoreX(70)} y1={0} x2={scoreX(70)} y2={H}
          stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" strokeDasharray="3,3" />
        {/* Connecting line through valid points */}
        {validPts.length > 1 && (
          <polyline
            points={validPts.map(p => `${p.x},${p.y}`).join(' ')}
            fill="none" stroke="rgba(94,234,212,0.3)" strokeWidth="0.8"
          />
        )}
        {/* Dots */}
        {pts.map((p, i) => p.isDef || p.score == null ? null : (
          <circle key={i} cx={p.x} cy={p.y} r="2.5"
            fill={scoreColor(p.score)} stroke="rgba(0,0,0,0.4)" strokeWidth="0.5" />
        ))}
      </svg>
      {/* Score labels (pointer events enabled per-row so tooltip works) */}
      {pts.map((p, i) => (
        <Box key={i} sx={{
          position:'absolute', top: i * ROW_H, height: ROW_H, left: 4,
          display:'flex', alignItems:'center', pointerEvents:'auto',
        }}>
          {!p.isDef && p.score != null && (
            <Tooltip
              placement="right"
              title={
                <Box sx={{ fontSize:'0.6rem', lineHeight:1.6 }}>
                  <strong>Sleep score: {p.score}/100</strong><br/>
                  quality × duration × window fit
                </Box>
              }
            >
              <Typography sx={{
                fontSize:'0.62rem', fontFamily:'monospace', fontWeight:700, lineHeight:1,
                color: scoreColor(p.score), textShadow:'0 0 6px rgba(0,0,0,0.9)',
                cursor:'default',
              }}>{p.score}</Typography>
            </Tooltip>
          )}
          {p.isDef && (
            <Typography sx={{ fontSize:'0.5rem', color:'rgba(94,234,212,0.2)', fontStyle:'italic' }}>—</Typography>
          )}
        </Box>
      ))}
    </Box>
  );
}

// ─── Duration Sparkline (right-side overlay) ──────────────────────────────────
function DurationSparkline({ rowDates, sessionsByDate }) {
  // Build per-row durations
  const rows = rowDates.map(wd => {
    const sessions = sessionsByDate[wd] || [];
    const isDef = sessions[0]?._isDefault;
    if (isDef) return { mins: 0, quality: null, isDef: true, wd };
    const mins = sessions.reduce((s, sess) => {
      if (!sess.sleepStart || !sess.wakeTime) return s;
      return s + Math.round((new Date(sess.wakeTime) - new Date(sess.sleepStart)) / 60000);
    }, 0);
    return { mins, quality: sessions[0]?.quality || null, isDef: false, wd };
  });

  const maxMins = Math.max(...rows.map(r => r.mins), TARGET_MINS + 60);
  const H = rows.length * ROW_H;
  const W = STAT_W;

  // Build area polygon points (x = duration mapped to width, y = row center)
  // Area fills from the right edge leftward
  const pts = rows.map((r, i) => {
    const y = i * ROW_H + ROW_H / 2;
    const x = W - (r.mins / maxMins) * (W - 8);
    return { x, y, ...r };
  });

  // Polygon: right edge → each point → right edge (fills rightward)
  const areaPoints = [
    `${W},0`,
    ...pts.map(p => `${p.x},${p.y}`),
    `${W},${H}`,
  ].join(' ');

  // Target line x position
  const targetX = W - (TARGET_MINS / maxMins) * (W - 8);

  return (
    <Box sx={{ position:'absolute', top:0, right:0, width:W, height:H, pointerEvents:'none', zIndex:3 }}>
      <svg width={W} height={H} style={{ position:'absolute', top:0, left:0 }}>
        <defs>
          <linearGradient id="durGrad" x1="0" y1="0" x2={W} y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%"  stopColor="rgba(167,139,250,0.5)" />
            <stop offset="100%" stopColor="rgba(167,139,250,0.03)" />
          </linearGradient>
        </defs>
        {/* Filled area (very subtle — ribbon is the primary visual) */}
        <polygon points={areaPoints} fill="url(#durGrad)" opacity="0.25" />
        {/* Quality-width ribbon: dense sampling, exact width at every point */}
        {(() => {
          const maxThick = 14;
          const minThick = 2;
          const halfAt = (q) => q != null ? minThick + ((q - 1) / 4) * (maxThick - minThick) : minThick;

          const data = pts.map(p => ({ x: p.x, y: p.y, hw: halfAt(p.quality) }));
          if (data.length < 2) return null;

          // Dense resampling: hw is exact at data points, linearly interpolates between.
          // The width at each row's y-center = that row's quality. Between rows it transitions.
          const samples = [];
          const STEPS = 24;
          for (let i = 0; i < data.length - 1; i++) {
            const a = data[i], b = data[i + 1];
            for (let s = 0; s <= (i === data.length - 2 ? STEPS : STEPS - 1); s++) {
              const t = s / STEPS;
              // Simple linear lerp for hw — guaranteed exact at endpoints
              const hw = a.hw + (b.hw - a.hw) * t;
              // Cubic hermite for x (smooth center line path)
              const prevTan = i > 0 ? (data[i + 1].x - data[i - 1].x) * 0.25 : (b.x - a.x) * 0.5;
              const nextTan = i < data.length - 2 ? (data[i + 2].x - data[i].x) * 0.25 : (b.x - a.x) * 0.5;
              const t2 = t * t, t3 = t2 * t;
              const h00 = 2*t3 - 3*t2 + 1, h10 = t3 - 2*t2 + t, h01 = -2*t3 + 3*t2, h11 = t3 - t2;
              samples.push({
                x:  h00 * a.x + h10 * prevTan + h01 * b.x + h11 * nextTan,
                y:  a.y + (b.y - a.y) * t,
                hw,
              });
            }
          }

          // Build outline: offset perpendicular to the curve direction
          const perp = samples.map((s, i) => {
            // Compute tangent direction from neighbors
            const prev = samples[Math.max(0, i - 1)];
            const next = samples[Math.min(samples.length - 1, i + 1)];
            let dx = next.x - prev.x;
            let dy = next.y - prev.y;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            dx /= len; dy /= len;
            // Perpendicular: rotate 90° → (-dy, dx)
            return { nx: -dy, ny: dx };
          });

          const upperPts = samples.map((s, i) =>
            `${(s.x + perp[i].nx * s.hw).toFixed(1)},${(s.y + perp[i].ny * s.hw).toFixed(1)}`);
          const lowerPts = [...samples].reverse().map((s, i) => {
            const j = samples.length - 1 - i;
            return `${(s.x - perp[j].nx * s.hw).toFixed(1)},${(s.y - perp[j].ny * s.hw).toFixed(1)}`;
          });
          const centerPts = samples.map(s => `${s.x.toFixed(1)},${s.y.toFixed(1)}`);

          return <>
            <defs>
              <linearGradient id="ribbonGrad" x1="0" y1="0" x2={W} y2="0" gradientUnits="userSpaceOnUse">
                <stop offset="0%"  stopColor="rgba(45,212,191,0.7)" />
                <stop offset="100%" stopColor="rgba(45,212,191,0.15)" />
              </linearGradient>
            </defs>
            <polygon points={[...upperPts, ...lowerPts].join(' ')} fill="url(#ribbonGrad)" />
            <polyline points={centerPts.join(' ')} fill="none" stroke="rgba(94,234,212,0.6)" strokeWidth="1" />
          </>;
        })()}
        {/* Target reference line */}
        <line x1={targetX} y1={0} x2={targetX} y2={H}
          stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" strokeDasharray="3,3" />
        {/* Dots at each point */}
        {pts.map((p, i) => p.isDef ? null : (
          <circle key={i} cx={p.x} cy={p.y} r="2.5"
            fill={p.mins >= TARGET_MINS ? '#86efac' : '#fdba74'}
            stroke="rgba(0,0,0,0.3)" strokeWidth="0.5"
          />
        ))}
      </svg>
      {/* Text labels */}
      {pts.map((p, i) => (
        <Box key={i} sx={{
          position:'absolute', top: i * ROW_H, height: ROW_H, right:4,
          display:'flex', flexDirection:'column', alignItems:'flex-end', justifyContent:'center',
        }}>
          {p.isDef ? (
            <Typography sx={{ fontSize:'0.5rem', color:'rgba(167,139,250,0.3)', fontStyle:'italic' }}>ideal</Typography>
          ) : (
            <Typography sx={{
              fontSize:'0.62rem', fontFamily:'monospace', fontWeight:600, lineHeight:1.2,
              color: p.mins >= TARGET_MINS ? '#86efac' : p.mins > 0 ? '#fdba74' : 'rgba(255,255,255,0.2)',
              textShadow:'0 0 6px rgba(0,0,0,0.9)',
            }}>{fmtD(p.mins)}</Typography>
          )}
          {p.quality && (
            <Typography sx={{ fontSize:'0.42rem', color: QCOL[p.quality], lineHeight:1, textShadow:'0 0 4px rgba(0,0,0,0.8)' }}>
              {'★'.repeat(p.quality)}{'☆'.repeat(5 - p.quality)}
            </Typography>
          )}
        </Box>
      ))}
    </Box>
  );
}

// ─── Quality Popover ───────────────────────────────────────────────────────────
function QualityPopover({ anchorEl, session, wakeDate, onClose, onSelect }) {
  const labels = { 1:'Awful', 2:'Poor', 3:'Okay', 4:'Good', 5:'Great' };
  return (
    <Popover open={Boolean(anchorEl)} anchorEl={anchorEl} onClose={onClose}
      anchorOrigin={{ vertical:'top', horizontal:'center' }}
      transformOrigin={{ vertical:'bottom', horizontal:'center' }}
      slotProps={{ paper: { sx: { bgcolor:'#1a1a2e', border:'1px solid rgba(167,139,250,0.2)' } } }}
    >
      <Box sx={{ p:1.5, minWidth:200 }}>
        <Typography variant="caption" sx={{ color:'rgba(167,139,250,0.7)', display:'block', mb:1, fontWeight:600 }}>
          {session ? `${fmtT(session.sleepStart)} – ${fmtT(session.wakeTime)}` : 'Rate this night'}
        </Typography>
        <Stack direction="row" spacing={0.5} sx={{ mb:0.75 }}>
          {[1,2,3,4,5].map(q => (
            <Box key={q} onClick={() => onSelect(q)} sx={{
              flex:1, height:30, borderRadius:1, cursor:'pointer',
              bgcolor: session?.quality === q ? QCOL[q] : 'rgba(167,139,250,0.08)',
              border:`1px solid ${session?.quality === q ? QCOL[q] : 'rgba(167,139,250,0.15)'}`,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:'0.7rem', fontWeight:700,
              color: session?.quality === q ? '#fff' : 'rgba(255,255,255,0.4)',
              '&:hover': { bgcolor: QCOL[q] + 'cc', color:'#fff' },
              transition:'all .15s',
            }}>{q}</Box>
          ))}
        </Stack>
        <Typography sx={{ fontSize:'0.55rem', color: session?.quality ? QCOL[session.quality] : 'rgba(255,255,255,0.3)', textAlign:'center' }}>
          {session?.quality ? `${labels[session.quality]} — ★${session.quality}/5` : 'Tap 1–5 to rate'}
        </Typography>
      </Box>
    </Popover>
  );
}

// ─── Strategy Table ───────────────────────────────────────────────────────────
function StrategyTable({ data }) {
  if (!data?.length) return null;
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ color:'rgba(167,139,250,0.6)', mb:1, fontSize:'0.7rem' }}>
        Strategy Effectiveness
      </Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontSize:'0.58rem', py:0.4, color:'rgba(255,255,255,0.3)', borderColor:'rgba(167,139,250,0.1)' }}>Strategy</TableCell>
            <TableCell align="center" sx={{ fontSize:'0.58rem', py:0.4, color:'rgba(255,255,255,0.3)', borderColor:'rgba(167,139,250,0.1)' }}>Avg Quality</TableCell>
            <TableCell align="center" sx={{ fontSize:'0.58rem', py:0.4, color:'rgba(255,255,255,0.3)', borderColor:'rgba(167,139,250,0.1)' }}>Used</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.map(s => (
            <TableRow key={s.name}>
              <TableCell sx={{ fontSize:'0.62rem', py:0.3, color:'rgba(255,255,255,0.6)', borderColor:'rgba(167,139,250,0.06)' }}>{s.name}</TableCell>
              <TableCell align="center" sx={{ py:0.3, borderColor:'rgba(167,139,250,0.06)' }}>
                <Box sx={{ display:'inline-block', px:0.8, py:0.1, borderRadius:1, bgcolor: QCOL[Math.round(s.avgQuality)] + '33', fontSize:'0.6rem', fontWeight:600, color: QCOL[Math.round(s.avgQuality)] }}>
                  {s.avgQuality}/5
                </Box>
              </TableCell>
              <TableCell align="center" sx={{ fontSize:'0.6rem', py:0.3, color:'rgba(255,255,255,0.3)', borderColor:'rgba(167,139,250,0.06)' }}>{s.usageCount}x</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

// ─── Main Export ───────────────────────────────────────────────────────────────
export default function SleepView() {
  const [displayDays, setDisplayDays] = useState(14);
  const [sliderVal, setSliderVal]     = useState(14); // local slider value, committed on release
  const [overrides, setOverrides]     = useState({});
  const [qPopover, setQPopover]       = useState(null); // { anchorEl, wakeDate, session, idx }

  const dragRef      = useRef(null);
  const wasDraggingRef = useRef(false);
  const containerRef = useRef(null);

  const { data, isLoading } = useSleepHistory(displayDays + 2);
  const updateSession = useUpdateSleepSession();
  const addSession    = useAddSleepSession();
  const deleteSession = useDeleteSleepSession();
  const saveQuality   = useSaveSleepQuality();

  const today = todayStr();

  const rowDates = useMemo(() => {
    const dates = [];
    for (let i = 0; i < displayDays; i++) dates.push(addDays(today, -i));
    return dates;
  }, [displayDays, today]);

  const sessionsByDate = useMemo(() => {
    const m = {};
    for (const r of data?.records || []) { if (!m[r.date]) m[r.date] = []; m[r.date].push(r); }
    // Fill empty days with ideal default (virtual, not persisted)
    for (const wd of rowDates) {
      if (!m[wd]?.length) {
        const prev = addDays(wd, -1);
        m[wd] = [{
          date: wd,
          sleepStart: new Date(`${prev}T${String(IDEAL_START_H).padStart(2,'0')}:00:00`).toISOString(),
          wakeTime:   new Date(`${wd}T${String(Math.floor(IDEAL_END_H)).padStart(2,'0')}:${String(Math.round((IDEAL_END_H % 1) * 60)).padStart(2,'0')}:00`).toISOString(),
          durationMinutes: (IDEAL_END_H + 24 - IDEAL_START_H) * 60,
          quality: null,
          strategies: [],
          _isDefault: true,  // marker for rendering
        }];
      }
    }
    return m;
  }, [data?.records, rowDates]);

  const restsByDate = useMemo(() => {
    const m = {};
    for (const r of data?.restRecords || []) { if (!m[r.date]) m[r.date] = []; m[r.date].push(r); }
    return m;
  }, [data?.restRecords]);

  const worksByDate = useMemo(() => {
    // Group by the wakeDate whose noon-to-noon window contains the session.
    // Sessions starting >= noon belong to the NEXT day's row; < noon to same day's row.
    const m = {};
    for (const w of data?.workSessions || []) {
      const d = new Date(w.startedAt);
      const base = d.toLocaleDateString('en-CA');
      let key = base;
      if (d.getHours() >= 12) {
        const next = new Date(d); next.setDate(next.getDate() + 1);
        key = next.toLocaleDateString('en-CA');
      }
      if (!m[key]) m[key] = [];
      m[key].push(w);
    }
    // Coalesce overlapping / close sessions (gap ≤ 15 min) into single spans
    const coalesce = (sessions, gapMs = 15 * 60 * 1000) => {
      if (!sessions.length) return [];
      const sorted = [...sessions].sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));
      const out = [{ startedAt: sorted[0].startedAt, endedAt: sorted[0].endedAt }];
      for (let i = 1; i < sorted.length; i++) {
        const last = out[out.length - 1];
        if (new Date(sorted[i].startedAt) - new Date(last.endedAt) <= gapMs) {
          if (sorted[i].endedAt > last.endedAt) last.endedAt = sorted[i].endedAt;
        } else {
          out.push({ startedAt: sorted[i].startedAt, endedAt: sorted[i].endedAt });
        }
      }
      return out;
    };
    const result = {};
    for (const [k, v] of Object.entries(m)) result[k] = coalesce(v);
    return result;
  }, [data?.workSessions]);

  // Stats
  const stats = useMemo(() => {
    const recs = (data?.records || []).filter(r => r.durationMinutes > 60);
    if (!recs.length) return {};
    const beds  = recs.filter(r=>r.sleepStart).map(r => { let h = new Date(r.sleepStart).getHours() + new Date(r.sleepStart).getMinutes()/60; if (h<12) h+=24; return h; });
    const wakes = recs.filter(r=>r.wakeTime).map(r => new Date(r.wakeTime).getHours() + new Date(r.wakeTime).getMinutes()/60);
    const avg = a => a.length ? a.reduce((s,x)=>s+x,0)/a.length : null;
    const sd  = (a,m) => a.length > 1 ? Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/a.length) : 0;
    const avgBed  = avg(beds);  const bedSd  = sd(beds,  avgBed);
    const avgWake = avg(wakes); const wakeSd = sd(wakes, avgWake);
    const avgDur  = avg(recs.map(r=>r.durationMinutes));
    const avgQ    = avg(recs.filter(r=>r.quality).map(r=>r.quality));
    const debt    = recs.reduce((d,r)=>d+Math.max(0,TARGET_MINS-r.durationMinutes),0);
    return { avgBed, bedSd, avgWake, wakeSd, avgDur, avgQ, debt, n: recs.length };
  }, [data?.records]);

  // Sleep density histogram
  const histogram = useMemo(() => {
    const counts = new Array(HIST_N).fill(0);
    for (const wd of rowDates) {
      for (const s of sessionsByDate[wd] || []) {
        if (!s.sleepStart || !s.wakeTime || s._isDefault) continue;
        const sp = Math.max(0, toPct(s.sleepStart, wd));
        const ep = Math.min(100, toPct(s.wakeTime, wd));
        for (let i = 0; i < HIST_N; i++) {
          if (sp < ((i+1)/HIST_N)*100 && ep > (i/HIST_N)*100) counts[i]++;
        }
      }
    }
    const total = rowDates.filter(d => sessionsByDate[d]?.some(s => !s._isDefault)).length;
    return { counts, total };
  }, [rowDates, sessionsByDate]);

  // Bed/wake time distribution (KDE + raw ticks for rug plot)
  const timeDist = useMemo(() => {
    const SLOTS = HIST_N;
    const bedCounts  = new Array(SLOTS).fill(0);
    const wakeCounts = new Array(SLOTS).fill(0);
    const bedTicks  = []; // raw % positions for rug plot
    const wakeTicks = [];
    let n = 0;
    const SIGMA = 6; // ~1.5h spread (6 slots × 15min)
    const RADIUS = Math.ceil(SIGMA * 3);
    for (const wd of rowDates) {
      for (const s of sessionsByDate[wd] || []) {
        if (!s.sleepStart || !s.wakeTime || s._isDefault) continue;
        n++;
        const bedPct  = Math.max(0, Math.min(100, toPct(s.sleepStart, wd)));
        const wakePct = Math.max(0, Math.min(100, toPct(s.wakeTime,   wd)));
        bedTicks.push(bedPct);
        wakeTicks.push(wakePct);
        const bedSlot  = (bedPct  / 100) * SLOTS;
        const wakeSlot = (wakePct / 100) * SLOTS;
        for (let d = -RADIUS; d <= RADIUS; d++) {
          const w = Math.exp(-(d * d) / (2 * SIGMA * SIGMA));
          const bi = Math.round(bedSlot + d);
          const wi = Math.round(wakeSlot + d);
          if (bi >= 0 && bi < SLOTS)  bedCounts[bi]  += w;
          if (wi >= 0 && wi < SLOTS)  wakeCounts[wi] += w;
        }
      }
    }
    return { bedCounts, wakeCounts, bedTicks, wakeTicks, n };
  }, [rowDates, sessionsByDate]);

  // Drag
  const handleDragStart = useCallback((e, wakeDate, idx, side, origStart, origEnd, isDef) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const chartW = rect.width - SCORE_W - LBL_W - STAT_W;
    dragRef.current = {
      wakeDate, idx, side, isDef: !!isDef,
      origStartMs: new Date(origStart).getTime(),
      origEndMs:   new Date(origEnd).getTime(),
      origStart, origEnd, startX: e.clientX, chartW, cur: null,
    };

    wasDraggingRef.current = false;

    const onMove = ev => {
      const d = dragRef.current; if (!d) return;
      wasDraggingRef.current = true;
      const dMs = ((ev.clientX - d.startX) / d.chartW) * 86400000;
      const key = `${d.wakeDate}:${d.idx}`;
      const newStart = d.side === 'left'
        ? new Date(Math.min(d.origStartMs + dMs, d.origEndMs - 1800000)).toISOString() : d.origStart;
      const newEnd = d.side === 'right'
        ? new Date(Math.max(d.origEndMs + dMs, d.origStartMs + 1800000)).toISOString() : d.origEnd;
      d.cur = { startedAt: newStart, endedAt: newEnd };
      setOverrides(p => ({ ...p, [key]: d.cur }));
    };

    const onUp = () => {
      const d = dragRef.current; if (!d) return;
      if (d.cur) {
        const { wakeDate, idx, origStart, origEnd, cur, side, isDef } = d;
        const clearKey = () => setOverrides(p => { const n={...p}; delete n[`${wakeDate}:${idx}`]; return n; });
        if (isDef) {
          // Default bar dragged — persist as a new real session
          addSession.mutate({
            type: 'sleep',
            startedAt: side === 'left' ? cur.startedAt : origStart,
            endedAt:   side === 'right' ? cur.endedAt : origEnd,
          }, { onSuccess: clearKey });
        } else {
          updateSession.mutate({
            type: 'sleep', startedAt: origStart,
            ...(side === 'left'  ? { newStartedAt: cur.startedAt } : {}),
            ...(side === 'right' ? { newEndedAt:   cur.endedAt   } : {}),
          }, { onSuccess: clearKey });
        }
      }
      dragRef.current = null;
      setTimeout(() => { wasDraggingRef.current = false; }, 100);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }, [updateSession, addSession]);

  const handleAddSleep = useCallback(wakeDate => {
    const recs = (data?.records || []).sort((a,b) => b.date.localeCompare(a.date));
    let sh = IDEAL_START_H, sm = 0, eh = Math.floor(IDEAL_END_H), em = 30;
    if (recs.length) {
      const ls = new Date(recs[0].sleepStart), le = new Date(recs[0].wakeTime);
      sh = ls.getHours(); sm = ls.getMinutes(); eh = le.getHours(); em = le.getMinutes();
    }
    const prev = addDays(wakeDate, -1);
    addSession.mutate({
      type: 'sleep',
      startedAt: new Date(`${prev}T${String(sh).padStart(2,'0')}:${String(sm).padStart(2,'0')}:00`).toISOString(),
      endedAt:   new Date(`${wakeDate}T${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}:00`).toISOString(),
    });
  }, [data?.records, addSession]);

  const handleDelete = useCallback(startedAt => {
    deleteSession.mutate({ type:'sleep', startedAt });
  }, [deleteSession]);

  // handleAddSleep is also used when user clicks empty area;
  // default bars auto-populate via sessionsByDate, no fill-default needed

  if (isLoading) return (
    <Box sx={{ p:3 }}>
      <LinearProgress sx={{ bgcolor:'rgba(167,139,250,0.1)', '& .MuiLinearProgress-bar':{ bgcolor:C.base } }} />
    </Box>
  );

  const avgBedPct  = stats.avgBed  != null ? hourToPct(stats.avgBed  % 24) : null;
  const avgWakePct = stats.avgWake != null ? hourToPct(stats.avgWake % 24) : null;
  const bedSdPct   = stats.bedSd   != null ? (stats.bedSd  / 24) * 100 : 0;
  const wakeSdPct  = stats.wakeSd  != null ? (stats.wakeSd / 24) * 100 : 0;
  const chartH     = rowDates.length * ROW_H;
  const idealLp    = hourToPct(IDEAL_START_H);
  const idealRp    = hourToPct(IDEAL_END_H);

  return (
    <Box>
      {/* ── Header ── */}
      <Stack direction="row" alignItems="center" flexWrap="wrap" spacing={1} sx={{ mb:1.5, gap:0.5 }}>
        <Typography variant="h5" sx={{ color:'#e9d5ff', mr:0.5 }}>Sleep</Typography>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth:140 }}>
          <Typography sx={{ fontSize:'0.6rem', color:'rgba(167,139,250,0.5)', whiteSpace:'nowrap' }}>{sliderVal}d</Typography>
          <Slider
            value={sliderVal}
            onChange={(_, v) => setSliderVal(v)}
            onChangeCommitted={(_, v) => setDisplayDays(v)}
            min={7} max={90} step={1}
            valueLabelDisplay="auto"
            valueLabelFormat={v => `${v}d`}
            sx={{
              color: C.base, height:4,
              '& .MuiSlider-thumb': { width:14, height:14, bgcolor:C.bright, '&:hover':{ boxShadow:`0 0 6px ${C.glow}` } },
              '& .MuiSlider-rail': { bgcolor:'rgba(167,139,250,0.15)' },
              '& .MuiSlider-track': { bgcolor:C.base },
              '& .MuiSlider-valueLabel': { bgcolor:'rgba(30,15,60,0.9)', fontSize:'0.6rem', borderRadius:1 },
            }}
          />
        </Stack>
        {/* Stat pills */}
        <Box sx={{ flex:1 }} />
        {stats.avgDur != null && (
          <Typography sx={{ fontSize:'0.65rem', color:'rgba(233,213,255,0.8)', fontWeight:600 }}>
            {fmtD(Math.round(stats.avgDur))}
          </Typography>
        )}
        {stats.avgBed != null && (() => {
          const devMins = Math.round((stats.avgBed - IDEAL_START_H) * 60);
          const devCol = Math.abs(devMins) < 20 ? '#86efac' : devMins > 0 ? '#fb923c' : '#34d399';
          return (
            <Typography sx={{ fontSize:'0.6rem', color:C.avgBed }}>
              🌙 {fmtH(stats.avgBed)} <span style={{ opacity:0.6 }}>±{fmtSd(stats.bedSd)}</span>
              {' '}<span style={{ color: devCol, fontSize:'0.52rem' }}>
                ({devMins > 0 ? '+' : ''}{devMins}m vs ideal)
              </span>
            </Typography>
          );
        })()}
        {stats.avgWake != null && (() => {
          const devMins = Math.round((stats.avgWake - IDEAL_END_H) * 60);
          const devCol = Math.abs(devMins) < 20 ? '#86efac' : devMins > 0 ? '#34d399' : '#fb923c';
          return (
            <Typography sx={{ fontSize:'0.6rem', color:C.avgWake }}>
              ☀️ {fmtH(stats.avgWake)} <span style={{ opacity:0.6 }}>±{fmtSd(stats.wakeSd)}</span>
              {' '}<span style={{ color: devCol, fontSize:'0.52rem' }}>
                ({devMins > 0 ? '+' : ''}{devMins}m vs ideal)
              </span>
            </Typography>
          );
        })()}
        {stats.avgQ != null && (
          <Typography sx={{ fontSize:'0.6rem', color: QCOL[Math.round(stats.avgQ)] }}>
            ★{stats.avgQ.toFixed(1)}
          </Typography>
        )}
        {stats.debt > 0 && (
          <Typography sx={{ fontSize:'0.6rem', color:'rgba(251,146,60,0.8)' }}>
            debt {fmtD(stats.debt)}
          </Typography>
        )}
      </Stack>

      {/* ── Date range ── */}
      <Typography sx={{ fontSize:'0.65rem', color:'rgba(167,139,250,0.45)', mb:1, textAlign:'center', letterSpacing:2, textTransform:'uppercase' }}>
        {fmtRange(rowDates)}
      </Typography>

      {/* ── Main chart ── */}
      <Paper sx={{ p:1.5, bgcolor:'rgba(15,10,30,0.6)', border:'1px solid rgba(167,139,250,0.1)', borderRadius:2, overflow:'hidden' }}>
        <TimeAxis />
        <TimeDistribution bedCounts={timeDist.bedCounts} wakeCounts={timeDist.wakeCounts} bedTicks={timeDist.bedTicks} wakeTicks={timeDist.wakeTicks} n={timeDist.n} avgBedH={stats.avgBed} avgWakeH={stats.avgWake} />

        <Box ref={containerRef} sx={{ position:'relative', userSelect:'none' }}>
          {/* ── Full-height overlays (positioned absolutely, behind rows) ── */}
          <Box sx={{ position:'absolute', top:0, left:SCORE_W + LBL_W, right:STAT_W, height:chartH, pointerEvents:'none', zIndex:0 }}>
            {/* Ideal sleep zone */}
            <Box sx={{
              position:'absolute', left:`${idealLp}%`,
              width:`${Math.max(0, idealRp - idealLp)}%`,
              top:0, height:'100%',
              background:`linear-gradient(to bottom, ${C.ideal}, rgba(139,92,246,0.06))`,
              borderLeft:`1px solid rgba(139,92,246,0.2)`,
              borderRight:`1px solid rgba(139,92,246,0.2)`,
            }} />

            {/* Vertical grid lines (every 3h) */}
            {[15,18,21,0,3,6,9].map(h => (
              <Box key={h} sx={{
                position:'absolute', left:`${hourToPct(h)}%`, top:0, height:'100%',
                width:'1px',
                bgcolor: h === 0 ? C.gridMid : C.grid,
              }} />
            ))}

            {/* Ideal bed line (10pm) — coral/rose tint */}
            <Box sx={{
              position:'absolute', left:`${idealLp}%`, top:0, height:'100%',
              width:'2px', bgcolor:'rgba(244,114,182,0.7)',
              boxShadow:'0 0 8px rgba(244,114,182,0.4)',
            }} />
            {/* Ideal wake line (6:30am) — warm peach tint */}
            <Box sx={{
              position:'absolute', left:`${idealRp}%`, top:0, height:'100%',
              width:'2px', bgcolor:'rgba(251,146,60,0.7)',
              boxShadow:'0 0 8px rgba(251,146,60,0.4)',
            }} />
            {/* Ideal labels */}
            <Typography sx={{ position:'absolute', left:`${idealLp}%`, bottom:2, transform:'translateX(-50%)',
              fontSize:'0.46rem', color:'#fff', whiteSpace:'nowrap', lineHeight:1, fontWeight:700,
              textShadow:'0 1px 6px rgba(0,0,0,1), 0 0 3px rgba(244,114,182,0.6)' }}>
              ideal bed {fmtH(IDEAL_START_H)}
            </Typography>
            <Typography sx={{ position:'absolute', left:`${idealRp}%`, bottom:2, transform:'translateX(-50%)',
              fontSize:'0.46rem', color:'#fff', whiteSpace:'nowrap', lineHeight:1, fontWeight:700,
              textShadow:'0 1px 6px rgba(0,0,0,1), 0 0 3px rgba(251,146,60,0.6)' }}>
              ideal wake {fmtH(IDEAL_END_H)}
            </Typography>

            {/* Deviation fill: gap between ideal bed and avg bed */}
            {avgBedPct != null && Math.abs(avgBedPct - idealLp) > 0.5 && (
              <Box sx={{
                position:'absolute',
                left: `${Math.min(avgBedPct, idealLp)}%`,
                width: `${Math.abs(avgBedPct - idealLp)}%`,
                top:0, height:'100%',
                bgcolor: avgBedPct > idealLp ? 'rgba(234,88,12,0.06)' : 'rgba(5,150,105,0.06)',
                borderLeft: `1px dotted ${avgBedPct > idealLp ? 'rgba(234,88,12,0.2)' : 'rgba(5,150,105,0.2)'}`,
                borderRight: `1px dotted ${avgBedPct > idealLp ? 'rgba(234,88,12,0.2)' : 'rgba(5,150,105,0.2)'}`,
              }} />
            )}
            {/* Deviation fill: gap between ideal wake and avg wake */}
            {avgWakePct != null && Math.abs(avgWakePct - idealRp) > 0.5 && (
              <Box sx={{
                position:'absolute',
                left: `${Math.min(avgWakePct, idealRp)}%`,
                width: `${Math.abs(avgWakePct - idealRp)}%`,
                top:0, height:'100%',
                bgcolor: avgWakePct > idealRp ? 'rgba(5,150,105,0.06)' : 'rgba(234,88,12,0.06)',
                borderLeft: `1px dotted ${avgWakePct > idealRp ? 'rgba(5,150,105,0.2)' : 'rgba(234,88,12,0.2)'}`,
                borderRight: `1px dotted ${avgWakePct > idealRp ? 'rgba(5,150,105,0.2)' : 'rgba(234,88,12,0.2)'}`,
              }} />
            )}

            {/* Avg bed stddev band */}
            {avgBedPct != null && (
              <Box sx={{ position:'absolute', left:`${avgBedPct - bedSdPct}%`,
                width:`${bedSdPct * 2}%`, top:0, height:'100%', bgcolor:C.sdBed }} />
            )}
            {/* Avg wake stddev band */}
            {avgWakePct != null && (
              <Box sx={{ position:'absolute', left:`${avgWakePct - wakeSdPct}%`,
                width:`${wakeSdPct * 2}%`, top:0, height:'100%', bgcolor:C.sdWake }} />
            )}

            {/* Avg bed line */}
            {avgBedPct != null && (
              <Box sx={{ position:'absolute', left:`${avgBedPct}%`, top:0, height:'100%',
                width:'1px', bgcolor:C.avgBed, boxShadow:`0 0 6px ${C.avgBed}` }} />
            )}
            {/* Avg wake line */}
            {avgWakePct != null && (
              <Box sx={{ position:'absolute', left:`${avgWakePct}%`, top:0, height:'100%',
                width:'1px', bgcolor:C.avgWake, boxShadow:`0 0 6px ${C.avgWake}` }} />
            )}

            {/* Avg labels (pinned at top) */}
            {avgBedPct != null && (
              <Typography sx={{ position:'absolute', left:`${avgBedPct}%`, top:2, transform:'translateX(-50%)',
                fontSize:'0.44rem', color:C.avgBed, whiteSpace:'nowrap', lineHeight:1, fontWeight:600 }}>
                avg bed
              </Typography>
            )}
            {avgWakePct != null && (
              <Typography sx={{ position:'absolute', left:`${avgWakePct}%`, top:2, transform:'translateX(-50%)',
                fontSize:'0.44rem', color:C.avgWake, whiteSpace:'nowrap', lineHeight:1, fontWeight:600 }}>
                avg wake
              </Typography>
            )}
          </Box>

          {/* ── Score sparkline (left column overlay) ── */}
          <ScoreSparkline rowDates={rowDates} sessionsByDate={sessionsByDate} />
          {/* ── Duration sparkline (right column overlay) ── */}
          <DurationSparkline rowDates={rowDates} sessionsByDate={sessionsByDate} />

          {/* ── Day rows ── */}
          {rowDates.map(wd => (
            <SleepRow
              key={wd}
              wakeDate={wd}
              sessions={sessionsByDate[wd] || []}
              rests={restsByDate[wd] || []}
              works={worksByDate[wd] || []}
              isToday={wd === today}
              getOverride={idx => overrides[`${wd}:${idx}`] || null}
              onDragStart={handleDragStart}
              onAddSleep={handleAddSleep}
              onDeleteSleep={handleDelete}
              onBarClick={(e, wakeDate, idx, s) => { if (!wasDraggingRef.current) setQPopover({ anchorEl:e.currentTarget, wakeDate, idx, session:s }); }}
              avgQuality={stats.avgQ}
            />
          ))}
        </Box>

        {/* ── Density histogram ── */}
        <SleepHistogram counts={histogram.counts} total={histogram.total} days={displayDays} />

        {/* ── Legend ── */}
        <Stack direction="row" spacing={2} sx={{ mt:1.5, flexWrap:'wrap', gap:0.5 }}>
          {[
            { color: C.base,   label: 'Sleep' },
            { color: C.avgBed,   label: `Avg bed ${fmtH(stats.avgBed)}` },
            { color: C.avgWake,  label: `Avg wake ${fmtH(stats.avgWake)}` },
            { color: '#fb923c',  label: 'Late / Short' },
            { color: '#34d399',  label: 'Early / Long' },
          ].filter(({ label }) => !label.includes('—')).map(({ color, label }) => (
            <Stack key={label} direction="row" spacing={0.5} alignItems="center">
              <Box sx={{ width:10, height:4, bgcolor:color, borderRadius:1 }} />
              <Typography sx={{ fontSize:'0.5rem', color:'rgba(255,255,255,0.3)' }}>{label}</Typography>
            </Stack>
          ))}
        </Stack>
      </Paper>

      {/* ── Strategy table ── */}
      {data?.strategyEffectiveness?.length > 0 && (
        <Paper sx={{ p:2, mt:2, bgcolor:'rgba(15,10,30,0.5)', border:'1px solid rgba(167,139,250,0.08)' }}>
          <StrategyTable data={data.strategyEffectiveness} />
        </Paper>
      )}

      {/* ── Quality popover ── */}
      <QualityPopover
        anchorEl={qPopover?.anchorEl}
        session={qPopover?.session}
        wakeDate={qPopover?.wakeDate}
        onClose={() => setQPopover(null)}
        onSelect={q => {
          if (qPopover) {
            saveQuality.mutate({ date: qPopover.wakeDate, quality: q });
            setQPopover(null);
          }
        }}
      />
    </Box>
  );
}
