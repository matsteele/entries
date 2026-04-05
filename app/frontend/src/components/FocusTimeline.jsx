'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box, Typography, Paper, LinearProgress, Stack, Tooltip, Drawer,
  IconButton, CircularProgress, Chip, Button, TextField,
  ListItemButton, ListItemText,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import {
  useFocusDay, useCalendarEvents, useMealPlan, useMeals, useSetMealSlot, useUpdateSession,
} from '../hooks/useApi';
import { CONTEXT_CONFIG } from '../lib/contexts';
import StateTracker from './StateTracker';

// ─── Constants ────────────────────────────────────────────────────────────────
const FOCUS_COLOR = { 0: '#37474f', 1: '#1565c0', 2: '#00897b', 3: '#f9a825', 4: '#e65100', 5: '#c62828' };
const FOCUS_LABEL = { 0: 'Idle', 1: 'Minimal', 2: 'Light', 3: 'Medium', 4: 'High', 5: 'Deep' };
const CHART_HEIGHT = 160;
const Y_AXIS_WIDTH = 28;
const EATING_START_H = 12;
const EATING_END_H   = 19;

const IDEAL_SCHEDULE = [
  { startH: 0,    endH: 5,    label: '🌙 Sleep',            color: 'rgba(80,80,80,0.25)',   textColor: 'rgba(200,200,200,0.35)', protocol: 'Bedtime Protocol' },
  { startH: 5,    endH: 5.25, label: '💪 Abs + Push-ups',   color: 'rgba(56,142,60,0.22)',  textColor: 'rgba(120,220,120,0.70)', protocol: 'Core Strengthening' },
  { startH: 5.25, endH: 6.5,  label: '⚡ Wake + Plan',      color: 'rgba(21,101,192,0.12)', textColor: 'rgba(100,160,255,0.55)', protocol: 'Morning Wake Protocol' },
  { startH: 6.5,  endH: 8.5,  label: '🏋 Workout',          color: 'rgba(56,142,60,0.10)',  textColor: 'rgba(100,200,120,0.5)',  protocol: 'Core Strengthening' },
  { startH: 8.5,  endH: 8.75, label: '🥤 Protein Shake',    color: 'rgba(210,100,30,0.25)', textColor: 'rgba(255,160,80,0.80)' },
  { startH: 8.75, endH: 9,    label: '🧘 Meditation',        color: 'rgba(0,120,150,0.22)',  textColor: 'rgba(80,200,220,0.72)' },
  { startH: 9,    endH: 12,   label: '🔥 Fasted Focus',     color: 'rgba(21,101,192,0.20)', textColor: 'rgba(120,180,255,0.65)', protocol: 'Focus-Based Task Management' },
  { startH: 12,   endH: 12.5, label: '🍗 Protein Meal',     color: 'rgba(210,100,30,0.25)', textColor: 'rgba(255,160,80,0.80)' },
  { startH: 13,   endH: 13.5, label: '🧘 Meditation',        color: 'rgba(0,120,150,0.22)',  textColor: 'rgba(80,200,220,0.72)' },
  { startH: 14.5, endH: 15.5, label: '📈 Trading',          color: 'rgba(27,94,32,0.28)',   textColor: 'rgba(100,210,100,0.75)', protocol: 'Pre-Trade News Check' },
  { startH: 16.5, endH: 17.5, label: '🚀 Projects',         color: 'rgba(94,53,177,0.25)',  textColor: 'rgba(180,130,255,0.72)' },
  { startH: 18,   endH: 19,   label: '🍱 Meal Prep',        color: 'rgba(121,85,72,0.40)',  textColor: 'rgba(210,160,130,0.70)' },
  { startH: 19,   endH: 21,   label: '🌅 Wind Down',        color: 'rgba(100,50,150,0.22)', textColor: 'rgba(190,150,230,0.65)', protocol: 'Bedtime Protocol' },
  { startH: 21,   endH: 24,   label: '🌙 Sleep',            color: 'rgba(80,80,80,0.25)',   textColor: 'rgba(200,200,200,0.35)', protocol: 'Bedtime Protocol' },
];

const FASTING_SCHEDULE = [
  { startH: 0,             endH: 8.5,          label: 'Fasted',        color: 'rgba(121,85,72,0.30)',  textColor: 'rgba(210,160,130,0.65)' },
  { startH: 8.5,           endH: 8.75,         label: '🥤',            color: 'rgba(0,150,136,0.35)',  textColor: 'rgba(100,220,210,0.9)' },
  { startH: 8.75,          endH: EATING_START_H,label: 'Fasted',       color: 'rgba(121,85,72,0.30)',  textColor: 'rgba(210,160,130,0.65)' },
  { startH: EATING_START_H,endH: EATING_END_H, label: 'eating window', color: 'rgba(230,145,56,0.30)', textColor: 'rgba(255,165,60,0.85)', isMealWindow: true },
  { startH: EATING_END_H,  endH: 24,           label: 'Fasted',        color: 'rgba(121,85,72,0.30)',  textColor: 'rgba(210,160,130,0.65)' },
];

const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack-1', 'snack-2'];
const MEAL_SLOT_DEFAULT_H = { breakfast: 12.5, lunch: 14, dinner: 17, 'snack-1': 13, 'snack-2': 16 };

// ─── Helpers ─────────────────────────────────────────────────────────────────
function todayStr() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
}
function getDisplayStartMs(dayStartMs) {
  const d = new Date(dayStartMs);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).getTime();
}
function getDisplayEndMs(dayStartMs, nowMs) {
  const d = new Date(dayStartMs);
  const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  return Math.max(nowMs, midnight);
}
function formatTime(ms) {
  const d = new Date(ms), h = d.getHours(), m = d.getMinutes().toString().padStart(2,'0');
  return `${h % 12 || 12}:${m}${h >= 12 ? 'pm' : 'am'}`;
}
function formatDuration(ms) {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
function clamp(val, min, max) { return Math.min(max, Math.max(min, val)); }

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub }) {
  return (
    <Paper sx={{ p: 1.5, flex: 1, textAlign: 'center' }}>
      <Typography variant="h5" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      {sub && <Typography variant="caption" display="block" color="text.disabled">{sub}</Typography>}
    </Paper>
  );
}

// ─── Time Axis ────────────────────────────────────────────────────────────────
function TimeAxis({ dayStartMs, nowMs }) {
  const displayStartMs = getDisplayStartMs(dayStartMs);
  const displayEndMs   = getDisplayEndMs(dayStartMs, nowMs);
  const totalMs = displayEndMs - displayStartMs;
  const ticks = [];
  const interval = (totalMs / 3600000) <= 12 ? 2 : 3;
  for (let h = 0; h <= 24; h += interval) {
    const tickMs = displayStartMs + h * 3600000;
    if (tickMs > displayEndMs) break;
    const lp = ((tickMs - displayStartMs) / totalMs) * 100;
    const d = new Date(tickMs);
    ticks.push({ lp, label: `${d.getHours() % 12 || 12}${d.getHours() >= 12 ? 'pm' : 'am'}`, isNow: Math.abs(tickMs - nowMs) < 1800000 });
  }
  return (
    <Box sx={{ display: 'flex', mt: 0.5 }}>
      <Box sx={{ width: Y_AXIS_WIDTH + 4, flexShrink: 0 }} />
      <Box sx={{ flex: 1, position: 'relative', height: 20 }}>
        {ticks.map((t, i) => (
          <Typography key={i} variant="caption" sx={{ position: 'absolute', left: `${t.lp}%`, transform: 'translateX(-50%)', color: t.isNow ? 'rgba(255,255,255,0.5)' : 'text.disabled', fontSize: '0.65rem' }}>{t.label}</Typography>
        ))}
      </Box>
    </Box>
  );
}

// ─── Protocol Drawer ─────────────────────────────────────────────────────────
function ProtocolDrawer({ query, label, onClose }) {
  const [protocol, setProtocol] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!query) return;
    setLoading(true); setProtocol(null);
    fetch(`/api/protocols/search?q=${encodeURIComponent(query)}`).then(r => r.json())
      .then(rows => { setProtocol(rows[0] || null); setLoading(false); }).catch(() => setLoading(false));
  }, [query]);
  return (
    <Drawer anchor="right" open={!!query} onClose={onClose} PaperProps={{ sx: { width: 420, bgcolor: '#1a1a1a', display: 'flex', flexDirection: 'column' } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 3, py: 2, flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <Typography variant="subtitle1" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{label}</Typography>
        <IconButton onClick={onClose} size="small" sx={{ color: 'text.secondary' }}>✕</IconButton>
      </Box>
      <Box sx={{ flex: 1, overflow: 'auto', px: 3, py: 2 }}>
        {loading && <CircularProgress size={24} />}
        {!loading && !protocol && <Typography variant="body2" color="text.secondary">No protocol found for "{query}".</Typography>}
        {!loading && protocol && (
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.78rem', color: 'text.secondary', lineHeight: 1.6 }}>{protocol.content}</Typography>
        )}
      </Box>
    </Drawer>
  );
}

// ─── Meal Drawer ─────────────────────────────────────────────────────────────
function MealDrawer({ slot, meal, meals, onSelect, onClose }) {
  const [search, setSearch] = useState('');
  const grouped = {};
  for (const m of (meals || [])) { const c = m.category || 'other'; if (!grouped[c]) grouped[c] = []; grouped[c].push(m); }
  const filtered = search ? (meals || []).filter(m => m.name.toLowerCase().includes(search.toLowerCase())) : null;
  return (
    <Drawer anchor="right" open={!!slot} onClose={onClose} PaperProps={{ sx: { width: 420, bgcolor: '#1a1a1a', display: 'flex', flexDirection: 'column' } }}>
      <Box sx={{ px: 3, py: 2, borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="subtitle1" sx={{ fontFamily: 'monospace', fontWeight: 600, textTransform: 'capitalize' }}>{slot}</Typography>
        <IconButton onClick={onClose} size="small" sx={{ color: 'text.secondary' }}>✕</IconButton>
      </Box>
      {meal && (
        <Box sx={{ px: 3, py: 2, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <Typography variant="h6" sx={{ mb: 0.5 }}>{meal.name}</Typography>
          <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap', gap: 0.5 }}>
            <Chip label={`${meal.protein}g P`} size="small" sx={{ bgcolor: '#1565c0' }} />
            <Chip label={`${meal.carbs}g C`} size="small" sx={{ bgcolor: '#5d4037' }} />
            <Chip label={`${meal.fat}g F`} size="small" sx={{ bgcolor: '#4a148c' }} />
            <Chip label={`${meal.calories} kcal`} size="small" variant="outlined" />
          </Stack>
          {meal.ingredients?.length > 0 && <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>{meal.ingredients.join(' · ')}</Typography>}
          {meal.recipe && <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontSize: '0.78rem', color: 'text.secondary', mt: 1 }}>{meal.recipe}</Typography>}
          <Button size="small" variant="outlined" sx={{ mt: 1.5 }} onClick={() => onSelect(null)}>Clear slot</Button>
        </Box>
      )}
      <Box sx={{ px: 3, pt: 2, pb: 1 }}>
        <TextField size="small" fullWidth placeholder="Search meals..." value={search} onChange={e => setSearch(e.target.value)} sx={{ mb: 1 }} />
      </Box>
      <Box sx={{ flex: 1, overflow: 'auto', px: 1 }}>
        {(filtered || []).length > 0
          ? filtered.map(m => (<ListItemButton key={m.id} onClick={() => onSelect(m.id)} sx={{ borderRadius: 1 }}><ListItemText primary={m.name} secondary={`${m.calories} kcal · ${m.protein}g P`} /></ListItemButton>))
          : Object.entries(grouped).map(([cat, catMeals]) => (
              <Box key={cat}>
                <Typography variant="caption" color="text.disabled" sx={{ px: 2, textTransform: 'uppercase', fontSize: '0.6rem', display: 'block', pt: 1 }}>{cat}</Typography>
                {catMeals.map(m => (<ListItemButton key={m.id} onClick={() => onSelect(m.id)} sx={{ borderRadius: 1 }}><ListItemText primary={m.name} secondary={`${m.calories} kcal · ${m.protein}g P · ${m.carbs}g C`} /></ListItemButton>))}
              </Box>
            ))}
      </Box>
    </Drawer>
  );
}

// ─── Macro Bar ────────────────────────────────────────────────────────────────
function MacroBar({ macroTotals }) {
  if (!macroTotals) return null;
  const { protein, carbs, fat, calories, mealsPlanned } = macroTotals;
  const targets = { protein: 180, carbs: 200, fat: 70, calories: 2200 };
  return (
    <Box sx={{ display: 'flex', mt: 0.75 }}>
      <Box sx={{ width: Y_AXIS_WIDTH + 4, flexShrink: 0 }} />
      <Box sx={{ flex: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          {[['P', protein, targets.protein, '#1565c0'], ['C', carbs, targets.carbs, '#5d4037'], ['F', fat, targets.fat, '#4a148c'], ['kcal', calories, targets.calories, '#f57c00']].map(([label, val, target, color]) => (
            <Box key={label} sx={{ flex: 1 }}>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="caption" sx={{ color, fontFamily: 'monospace', fontSize: '0.6rem' }}>{label}</Typography>
                <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.disabled' }}>{Math.round(val)}/{target}</Typography>
              </Stack>
              <Box sx={{ height: 3, bgcolor: 'rgba(255,255,255,0.08)', borderRadius: 1, overflow: 'hidden' }}>
                <Box sx={{ height: '100%', width: `${Math.min(100, (val / target) * 100)}%`, bgcolor: color, borderRadius: 1 }} />
              </Box>
            </Box>
          ))}
          <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem', whiteSpace: 'nowrap' }}>{mealsPlanned ?? 0}/{MEAL_SLOTS.length} planned</Typography>
        </Stack>
      </Box>
    </Box>
  );
}

// ─── Fasting + Meal Bar ───────────────────────────────────────────────────────
function FastingBar({ dayStartMs, nowMs, mealPlan, meals, onMealSlotClick }) {
  const displayStartMs = getDisplayStartMs(dayStartMs);
  const displayEndMs   = getDisplayEndMs(dayStartMs, nowMs);
  const totalMs = displayEndMs - displayStartMs;
  const midnightMs = displayStartMs;
  const slotMealMap = {};
  for (const s of (mealPlan?.slots || [])) slotMealMap[s.slot] = s;
  const eatingStartMs = midnightMs + EATING_START_H * 3600000;
  const eatingEndMs   = midnightMs + EATING_END_H   * 3600000;
  return (
    <Box sx={{ display: 'flex', mt: 0.75 }}>
      <Box sx={{ width: Y_AXIS_WIDTH + 4, flexShrink: 0 }} />
      <Box sx={{ flex: 1, position: 'relative', height: 28, borderRadius: 0.5, overflow: 'hidden' }}>
        {FASTING_SCHEDULE.map((seg, i) => {
          const ss = midnightMs + seg.startH * 3600000, se = midnightMs + seg.endH * 3600000;
          const cs = Math.max(ss, displayStartMs), ce = Math.min(se, displayEndMs);
          if (ce <= cs) return null;
          const lp = ((cs - displayStartMs) / totalMs) * 100, wp = ((ce - cs) / totalMs) * 100;
          return (
            <Box key={i} sx={{ position: 'absolute', top: 0, bottom: 0, left: `${lp}%`, width: `${wp}%`, bgcolor: seg.color, borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.08)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {!seg.isMealWindow && <Typography variant="caption" sx={{ color: seg.textColor, fontSize: '0.62rem', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden' }}>{seg.label}</Typography>}
            </Box>
          );
        })}
        {/* Eating window label */}
        {(() => {
          const cs = Math.max(eatingStartMs, displayStartMs), ce = Math.min(eatingEndMs, displayEndMs);
          if (ce <= cs) return null;
          const lp = ((cs - displayStartMs) / totalMs) * 100, wp = ((ce - cs) / totalMs) * 100;
          return (
            <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: `${lp}%`, width: `${wp}%`, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <Typography variant="caption" sx={{ color: 'rgba(255,165,60,0.85)', fontSize: '0.62rem', fontFamily: 'monospace' }}>eating window</Typography>
            </Box>
          );
        })()}
        {/* Meal slot buttons */}
        {MEAL_SLOTS.map(slot => {
          const slotInfo = slotMealMap[slot];
          const defaultH = MEAL_SLOT_DEFAULT_H[slot] ?? EATING_START_H;
          let slotMs = midnightMs + defaultH * 3600000;
          if (slotInfo?.planned_time) {
            const [hh, mm] = slotInfo.planned_time.split(':').map(Number);
            slotMs = midnightMs + (hh + mm / 60) * 3600000;
          }
          if (slotMs < eatingStartMs || slotMs >= eatingEndMs) return null;
          const lp = ((clamp(slotMs, eatingStartMs, eatingEndMs - 1) - displayStartMs) / totalMs) * 100;
          const hasMeal = !!slotInfo?.meal_id;
          return (
            <Tooltip key={slot} title={slotInfo?.name || slot} placement="top" arrow>
              <Box onClick={() => onMealSlotClick(slot)} sx={{
                position: 'absolute', top: '50%', transform: 'translate(-50%, -50%)', left: `${lp}%`,
                width: 22, height: 22, bgcolor: hasMeal ? 'rgba(230,145,56,0.85)' : 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.3)', borderRadius: '50%', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2,
                '&:hover': { bgcolor: hasMeal ? 'rgba(230,145,56,1)' : 'rgba(255,255,255,0.3)', transform: 'translate(-50%, -50%) scale(1.15)' },
                transition: 'all 0.15s',
              }}>
                <Typography sx={{ fontSize: '0.6rem', lineHeight: 1 }}>{hasMeal ? '🍽' : '+'}</Typography>
              </Box>
            </Tooltip>
          );
        })}
      </Box>
    </Box>
  );
}

// ─── Calendar Overlay ─────────────────────────────────────────────────────────
function CalendarOverlay({ events, dayStartMs, nowMs }) {
  const displayStartMs = getDisplayStartMs(dayStartMs);
  const displayEndMs   = getDisplayEndMs(dayStartMs, nowMs);
  const totalMs = displayEndMs - displayStartMs;
  if (!events?.length) return null;
  return (
    <Box sx={{ display: 'flex', mt: 0.5 }}>
      <Box sx={{ width: Y_AXIS_WIDTH + 4, flexShrink: 0 }} />
      <Box sx={{ flex: 1, position: 'relative', height: 16 }}>
        {events.map((ev, i) => {
          const cs = Math.max(ev.startMs, displayStartMs), ce = Math.min(ev.endMs, displayEndMs);
          if (ce <= cs) return null;
          const lp = ((cs - displayStartMs) / totalMs) * 100, wp = ((ce - cs) / totalMs) * 100;
          return (
            <Tooltip key={i} title={`📅 ${ev.title}\n${formatTime(ev.startMs)} – ${formatTime(ev.endMs)}`} placement="top" arrow>
              <Box sx={{ position: 'absolute', top: 2, bottom: 2, left: `${lp}%`, width: `${Math.max(wp, 0.3)}%`, bgcolor: 'rgba(66,133,244,0.35)', border: '1px solid rgba(66,133,244,0.7)', borderRadius: 0.5, overflow: 'hidden' }}>
                <Typography variant="caption" sx={{ fontSize: '0.55rem', color: 'rgba(150,200,255,0.9)', fontFamily: 'monospace', pl: 0.5, lineHeight: 1.2, display: 'block', overflow: 'hidden', whiteSpace: 'nowrap' }}>{ev.title}</Typography>
              </Box>
            </Tooltip>
          );
        })}
      </Box>
    </Box>
  );
}

// ─── Timeline Bar with Drag Editing ──────────────────────────────────────────
function TimelineBar({ timeline, dayStartMs, nowMs, onBlockClick, isLive, onSessionUpdate }) {
  const displayStartMs = getDisplayStartMs(dayStartMs);
  const displayEndMs   = getDisplayEndMs(dayStartMs, nowMs);
  const totalMs = displayEndMs - displayStartMs;
  const midnightMs = displayStartMs;
  const containerRef = useRef(null);
  const dragRef = useRef(null);
  const [dragOverride, setDragOverride] = useState(null);

  const nonGapSegs = timeline.map((s, i) => ({ ...s, _i: i })).filter(s => !s.isGap);
  const getPrevEnd  = i => { const prev = nonGapSegs.filter(s => s._i < i).pop(); return prev ? prev.endMs : displayStartMs; };
  const getNextStart= i => { const next = nonGapSegs.find(s => s._i > i); return next ? next.startMs : (isLive ? nowMs : displayEndMs); };

  const handleMouseDown = useCallback((e, segIdx, type) => {
    if (!isLive) return;
    const seg = timeline[segIdx];
    if (!seg || seg.isGap || !seg.taskId || seg.sourceFile === 'postgres') return;
    e.preventDefault(); e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { type, segIdx, startX: e.clientX, startY: e.clientY, origStartMs: seg.startMs, origEndMs: seg.endMs, origFocus: seg.focusLevel, containerRect: rect, totalMs };
    setDragOverride({ segIdx, startMs: seg.startMs, endMs: seg.endMs, focusLevel: seg.focusLevel });
  }, [timeline, isLive, totalMs]);

  useEffect(() => {
    const onMove = (e) => {
      const drag = dragRef.current; if (!drag) return;
      const { type, segIdx, startX, startY, origStartMs, origEndMs, origFocus, containerRect } = drag;
      const dxMs = ((e.clientX - startX) / containerRect.width) * drag.totalMs;
      if (type === 'left')  setDragOverride(d => d ? { ...d, startMs: clamp(origStartMs + dxMs, getPrevEnd(segIdx), origEndMs - 60000) } : null);
      if (type === 'right') setDragOverride(d => d ? { ...d, endMs: clamp(origEndMs + dxMs, origStartMs + 60000, getNextStart(segIdx)) } : null);
      if (type === 'focus') setDragOverride(d => d ? { ...d, focusLevel: clamp(Math.round(origFocus - ((e.clientY - startY) / CHART_HEIGHT) * 5), 0, 5) } : null);
    };
    const onUp = () => {
      const drag = dragRef.current; if (!drag) return;
      const { type, segIdx } = drag; dragRef.current = null;
      setDragOverride(cur => {
        if (cur && onSessionUpdate) {
          const seg = timeline[segIdx];
          if (seg?.taskId) {
            const upd = { taskId: seg.taskId, sourceFile: seg.sourceFile, sessionIdx: seg.sessionIdx, startedAt: new Date(seg.startMs).toISOString() };
            if (type === 'left')  upd.newStartedAt   = new Date(cur.startMs).toISOString();
            if (type === 'right') upd.newEndedAt     = new Date(cur.endMs).toISOString();
            if (type === 'focus') upd.newFocusLevel  = cur.focusLevel;
            onSessionUpdate(upd);
          }
        }
        return null;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [timeline, onSessionUpdate, isLive]);

  if (totalMs <= 0) return null;

  return (
    <Box sx={{ display: 'flex', alignItems: 'stretch' }}>
      <Box sx={{ width: Y_AXIS_WIDTH, position: 'relative', flexShrink: 0, mr: 0.5 }}>
        {[5,4,3,2,1,0].map(l => (
          <Typography key={l} variant="caption" sx={{ position: 'absolute', right: 4, bottom: `${(l/5)*100}%`, transform: 'translateY(50%)', color: FOCUS_COLOR[l], fontSize: '0.62rem', fontFamily: 'monospace', lineHeight: 1 }}>{l}</Typography>
        ))}
      </Box>
      <Box ref={containerRef} sx={{ flex: 1, position: 'relative', height: CHART_HEIGHT, userSelect: 'none' }}>
        {/* Ideal schedule */}
        {IDEAL_SCHEDULE.map((b, i) => {
          const bs = midnightMs + b.startH * 3600000, be = midnightMs + b.endH * 3600000;
          const cs = Math.max(bs, displayStartMs), ce = Math.min(be, displayEndMs);
          if (ce <= cs) return null;
          const lp = ((cs-displayStartMs)/totalMs)*100, wp = ((ce-cs)/totalMs)*100;
          return (
            <Tooltip key={i} title={b.protocol ? `${b.label} — click for protocol` : b.label} placement="top" arrow>
              <Box onClick={b.protocol ? () => onBlockClick(b) : undefined} sx={{ position: 'absolute', top: 0, bottom: 0, left: `${lp}%`, width: `${wp}%`, bgcolor: b.color, borderLeft: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden', cursor: b.protocol ? 'pointer' : 'default', '&:hover': b.protocol ? { filter: 'brightness(1.4)' } : {} }}>
                <Typography variant="caption" sx={{ position: 'absolute', top: '50%', left: '50%', color: b.textColor, fontSize: '0.6rem', fontFamily: 'monospace', whiteSpace: 'nowrap', pointerEvents: 'none', userSelect: 'none', transform: 'translate(-50%, -50%) rotate(-90deg)' }}>{b.label}</Typography>
              </Box>
            </Tooltip>
          );
        })}
        {/* Gridlines */}
        {[1,2,3,4,5].map(l => <Box key={l} sx={{ position: 'absolute', left: 0, right: 0, bottom: `${(l/5)*100}%`, height: '1px', bgcolor: l===3 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)' }} />)}
        {/* Hour ticks */}
        {Array.from({length:24},(_,h)=>{ const tm=midnightMs+h*3600000; if(tm<displayStartMs||tm>displayEndMs)return null; return <Box key={h} sx={{position:'absolute',top:0,bottom:0,left:`${((tm-displayStartMs)/totalMs)*100}%`,zIndex:0}}><Box sx={{position:'absolute',top:0,bottom:0,width:'1px',bgcolor:'rgba(255,255,255,0.04)'}}/></Box>; })}
        {/* Session bars */}
        {timeline.map((seg, i) => {
          const ov = dragOverride?.segIdx === i ? dragOverride : null;
          const sMs = ov ? ov.startMs : seg.startMs;
          const eMs = ov ? ov.endMs   : seg.endMs;
          const fl  = ov ? ov.focusLevel : seg.focusLevel;
          const lp  = ((sMs - displayStartMs) / totalMs) * 100;
          const wp  = ((eMs - sMs) / totalMs) * 100;
          if (wp < 0.05) return null;
          const hp = seg.isGap ? 2 : Math.max(8, (fl / 5) * 100);
          const ctxCfg = seg.activityContext ? CONTEXT_CONFIG[seg.activityContext] : null;
          const color = seg.isGap ? 'rgba(255,255,255,0.06)' : (ctxCfg?.color || '#666');
          const tipLabel = seg.isGap
            ? `Untracked: ${formatTime(sMs)} – ${formatTime(eMs)} (${formatDuration(eMs-sMs)})`
            : `${ctxCfg?.emoji||''} ${seg.taskTitle} · F:${fl} ${FOCUS_LABEL[fl]}\n${formatTime(sMs)} – ${formatTime(eMs)} (${formatDuration(eMs-sMs)})`;
          const canEdit = isLive && !seg.isGap && seg.sourceFile !== 'postgres' && !!seg.taskId;
          return (
            <Tooltip key={i} title={<span style={{whiteSpace:'pre-line'}}>{tipLabel}</span>} arrow placement="top" disableHoverListener={!!dragOverride}>
              <Box sx={{ position: 'absolute', bottom: 0, left: `${lp}%`, width: `${wp}%`, height: `${hp}%`, minHeight: seg.isGap ? 0 : 2, bgcolor: color, opacity: seg.isGap ? 1 : 0.88, borderLeft: seg.isGap ? 'none' : '1px solid rgba(0,0,0,0.25)', borderRight: seg.isGap ? 'none' : '1px solid rgba(0,0,0,0.25)', zIndex: 1, '&:hover': { opacity: 1, zIndex: 2 }, transition: 'opacity 0.1s' }}>
                {canEdit && <Box onMouseDown={e=>handleMouseDown(e,i,'left')} sx={{ position:'absolute',left:0,top:0,bottom:0,width:6,cursor:'ew-resize',zIndex:3,'&:hover':{bgcolor:'rgba(255,255,255,0.25)'}}} />}
                {canEdit && <Box onMouseDown={e=>handleMouseDown(e,i,'right')} sx={{ position:'absolute',right:0,top:0,bottom:0,width:6,cursor:'ew-resize',zIndex:3,'&:hover':{bgcolor:'rgba(255,255,255,0.25)'}}} />}
                {canEdit && <Box onMouseDown={e=>handleMouseDown(e,i,'focus')} sx={{ position:'absolute',top:0,left:6,right:6,height:6,cursor:'ns-resize',zIndex:3,'&:hover':{bgcolor:'rgba(255,255,255,0.25)'}}} />}
              </Box>
            </Tooltip>
          );
        })}
        {/* Now marker */}
        {isLive && nowMs < displayEndMs && <Box sx={{ position:'absolute',top:0,bottom:0,left:`${((nowMs-displayStartMs)/totalMs)*100}%`,width:'1px',bgcolor:'rgba(255,255,255,0.35)',zIndex:3 }} />}
      </Box>
    </Box>
  );
}

// ─── Main Export ─────────────────────────────────────────────────────────────
export default function FocusTimeline() {
  const [selectedDate, setSelectedDate] = useState(() => {
    if (typeof window !== 'undefined') { const p = new URLSearchParams(window.location.search).get('date'); return p || null; }
    return null;
  });
  const today      = todayStr();
  const displayDate = selectedDate || today;
  const isToday    = displayDate === today;
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (selectedDate) url.searchParams.set('date', selectedDate); else url.searchParams.delete('date');
    window.history.replaceState({}, '', url.toString());
  }, [selectedDate]);

  const [drawerBlock, setDrawerBlock] = useState(null);
  const [mealSlot, setMealSlot]       = useState(null);
  const { data, isLoading, error }    = useFocusDay(selectedDate);
  const { data: calData }             = useCalendarEvents(displayDate);
  const { data: mealPlanData }        = useMealPlan(displayDate);
  const { data: mealsData }           = useMeals();
  const setMealSlotMutation           = useSetMealSlot();
  const updateSessionMutation         = useUpdateSession();

  const mutateSessionRef = useRef(updateSessionMutation.mutate);
  mutateSessionRef.current = updateSessionMutation.mutate;
  const handleSessionUpdate = useCallback(updates => { mutateSessionRef.current(updates); }, []);
  const setMealSlotRef = useRef({ mutate: setMealSlotMutation.mutate, mealSlot, displayDate });
  setMealSlotRef.current = { mutate: setMealSlotMutation.mutate, mealSlot, displayDate };
  const handleMealSelect = useCallback(mealId => {
    const { mutate, mealSlot: slot, displayDate: date } = setMealSlotRef.current;
    if (!slot) return;
    mutate({ date, slot, mealId });
    setMealSlot(null);
  }, []);

  const activeMeal = mealSlot
    ? (mealsData?.meals||[]).find(m => m.id === (mealPlanData?.slots||[]).find(s=>s.slot===mealSlot)?.meal_id)
    : null;

  if (isLoading) return <LinearProgress />;
  if (error) return <Typography color="error">Error: {error.message}</Typography>;
  if (!data?.timeline) return <Typography color="text.secondary">No focus data.</Typography>;

  const { timeline, summary, dayStartMs, nowMs } = data;

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>Focus Timeline</Typography>
        <IconButton size="small" onClick={() => setSelectedDate(addDays(displayDate, -1))}><ChevronLeftIcon /></IconButton>
        <Typography variant="body2" sx={{ fontFamily: 'monospace', minWidth: 90, textAlign: 'center' }}>{isToday ? 'Today' : displayDate}</Typography>
        <IconButton size="small" onClick={() => setSelectedDate(addDays(displayDate, 1))} disabled={isToday}><ChevronRightIcon /></IconButton>
        {!isToday && <IconButton size="small" onClick={() => setSelectedDate(null)}><TodayIcon /></IconButton>}
      </Stack>

      <Stack direction="row" spacing={1.5} sx={{ mb: 3 }}>
        <StatCard label="Focused Minutes" value={`${summary.focusedMins}m`} sub="Σ focus×mins, f>0" />
        <StatCard label="Tracked" value={`${summary.pctTracked}%`} sub="of day" />
        <StatCard label="Active Focus" value={`${summary.pctActive}%`} sub="tracked time at f>0" />
      </Stack>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" alignItems="center" sx={{ mb: 1.5 }}>
          <Typography variant="subtitle2" sx={{ flexGrow: 1, color: 'text.secondary' }}>{isToday ? "Today's Focus" : `${displayDate}`}</Typography>
          {isToday && <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem' }}>drag edges to edit · drag top for focus</Typography>}
        </Stack>
        <TimelineBar timeline={timeline} dayStartMs={dayStartMs} nowMs={nowMs} onBlockClick={setDrawerBlock} isLive={!!data.isLive} onSessionUpdate={handleSessionUpdate} />
        <TimeAxis dayStartMs={dayStartMs} nowMs={nowMs} />
        {calData?.events?.length > 0 && (
          <>
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1, mb: 0.25, pl: `${Y_AXIS_WIDTH + 4}px`, fontSize: '0.58rem' }}>calendar</Typography>
            <CalendarOverlay events={calData.events} dayStartMs={dayStartMs} nowMs={nowMs} />
          </>
        )}
        <FastingBar dayStartMs={dayStartMs} nowMs={nowMs} mealPlan={mealPlanData} meals={mealsData?.meals} onMealSlotClick={setMealSlot} />
        {mealPlanData?.macroTotals && <MacroBar macroTotals={mealPlanData.macroTotals} />}
      </Paper>

      {isToday && <StateTracker />}

      <ProtocolDrawer query={drawerBlock?.protocol} label={drawerBlock?.label} onClose={() => setDrawerBlock(null)} />
      <MealDrawer slot={mealSlot} meal={activeMeal} meals={mealsData?.meals} onSelect={handleMealSelect} onClose={() => setMealSlot(null)} />
    </Box>
  );
}
