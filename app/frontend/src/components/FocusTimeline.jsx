'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box, Typography, Paper, LinearProgress, Stack, Tooltip, Drawer, Popover, List,
  IconButton, CircularProgress, Chip, Button, TextField,
  ListItemButton, ListItemText, Tabs, Tab,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import {
  useFocusDay, useCalendarEvents, useMealPlan, useMeals, useSetMealSlot, useUpdateSession, useGroceryList, useSleepData,
  useAllTasks, useTimeSums, useTaskAction, useReassignSession, useSaveSleepQuality,
} from '../hooks/useApi';
import { CONTEXT_CONFIG, CONTEXT_ORDER, formatMinutes } from '../lib/contexts';
import { ActiveTask, AddTaskForm, ContextGroup, CompletedStrip } from './TasksView';
import WeeklyGoalsProgress from './WeeklyGoalsProgress';


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

const MEAL_SLOTS = ['meal-1', 'meal-2', 'meal-3', 'meal-4', 'meal-5'];
const MEAL_STATUS_COLOR = { planned: 'rgba(100,160,255,0.7)', eating: 'rgba(76,175,80,1)', eaten: 'rgba(230,145,56,0.9)' };

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
  return dayStartMs;
}
function getDisplayEndMs(dayStartMs, nowMs) {
  return dayStartMs + 86400000;
}
// Use browser timezone for time display
const DISPLAY_TZ = typeof window !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'America/Chicago';
function formatTime(ms) {
  return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: DISPLAY_TZ });
}
function formatDuration(ms) {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
function clamp(val, min, max) { return Math.min(max, Math.max(min, val)); }

// ─── Session Reassign Popover ─────────────────────────────────────────────────
function SessionReassignPopover({ anchorEl, onClose, segment, pending, routine }) {
  const [tab, setTab] = useState(0);
  const reassign = useReassignSession();

  if (!segment) return null;

  const tasks = tab === 0 ? (pending || []) : (routine || []).filter(t => t.title !== 'general');
  const filtered = tasks.filter(t => t.id !== segment.taskId);

  // Group by context
  const grouped = {};
  for (const t of filtered) {
    const ctx = t.activityContext || 'unstructured';
    if (!grouped[ctx]) grouped[ctx] = [];
    grouped[ctx].push(t);
  }

  const ctxCfg = segment.activityContext ? CONTEXT_CONFIG[segment.activityContext] : {};

  const handleSelect = (toTask) => {
    reassign.mutate({
      fromTaskId: segment.taskId,
      toTaskId: toTask.id,
      sessionStartedAt: new Date(segment.startMs).toISOString(),
    }, { onSuccess: () => onClose() });
  };

  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      onClick={(e) => e.stopPropagation()}
    >
      <Box sx={{ width: 320, maxHeight: 440 }}>
        <Box sx={{ px: 1.5, pt: 1.5, pb: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {ctxCfg?.emoji} {segment.taskTitle}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {formatTime(segment.startMs)} – {formatTime(segment.endMs)} ({formatDuration(segment.endMs - segment.startMs)})
          </Typography>
          <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
            Reassign this session to:
          </Typography>
        </Box>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth"
          sx={{ minHeight: 32, '& .MuiTab-root': { minHeight: 32, fontSize: '0.75rem' } }}>
          <Tab label="Novel" />
          <Tab label="Routine" />
        </Tabs>
        <List dense sx={{ overflow: 'auto', maxHeight: 300, py: 0 }}>
          {CONTEXT_ORDER.map(ctx => {
            const ctxTasks = grouped[ctx];
            if (!ctxTasks?.length) return null;
            const cfg = CONTEXT_CONFIG[ctx] || {};
            return ctxTasks.map(t => (
              <ListItemButton key={t.id} onClick={() => handleSelect(t)} disabled={reassign.isPending}
                sx={{ py: 0.5 }}>
                <ListItemText
                  primary={`${cfg.emoji} ${t.title}`}
                  primaryTypographyProps={{ variant: 'body2', fontSize: '0.82rem', noWrap: true }}
                />
              </ListItemButton>
            ));
          })}
          {filtered.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
              No tasks available
            </Typography>
          )}
        </List>
      </Box>
    </Popover>
  );
}

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
function TimeAxis({ dayStartMs, nowMs, sleepStartMs }) {
  const displayStartMs = getDisplayStartMs(dayStartMs);
  const displayEndMs   = getDisplayEndMs(dayStartMs, nowMs);
  const totalMs = displayEndMs - displayStartMs;
  const ticks = [];
  const interval = (totalMs / 3600000) <= 12 ? 2 : 3;
  for (let h = 0; h <= 24; h += interval) {
    const tickMs = displayStartMs + h * 3600000;
    if (tickMs > displayEndMs) break;
    const lp = ((tickMs - displayStartMs) / totalMs) * 100;
    const hourOfDay = h % 24;
    const label = hourOfDay === 0 ? '12am' : hourOfDay === 12 ? '12pm' : `${hourOfDay % 12}${hourOfDay >= 12 ? 'pm' : 'am'}`;
    ticks.push({ lp, label, isNow: Math.abs(tickMs - nowMs) < 1800000 });
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
const MEAL_CATEGORIES = ['breakfast', 'lunch', 'dinner', 'snack'];

function MealDrawer({ slot, slotData, meals, onSelect, onClose }) {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState(0);

  const grouped = {};
  for (const m of (meals || [])) {
    const c = m.category || 'other';
    if (!grouped[c]) grouped[c] = [];
    grouped[c].push(m);
  }
  for (const c of Object.keys(grouped)) {
    grouped[c].sort((a, b) => (b.protein || 0) - (a.protein || 0));
  }

  const categories = MEAL_CATEGORIES.filter(c => grouped[c]?.length);
  const activeCategory = search ? null : categories[tab] || categories[0];
  const visibleMeals = search
    ? (meals || []).filter(m => m.name.toLowerCase().includes(search.toLowerCase()))
    : (grouped[activeCategory] || []);

  const slotNum = slot ? slot.replace('meal-', '') : '';
  const currentMeal = slotData?.meal_id ? meals?.find(m => m.id === slotData.meal_id) : null;
  const currentStatus = slotData?.status || null;

  return (
    <Drawer anchor="right" open={!!slot} onClose={onClose} PaperProps={{ sx: { width: 420, bgcolor: '#1a1a1a', display: 'flex', flexDirection: 'column' } }}>
      {/* Header */}
      <Box sx={{ px: 3, py: 2, borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="subtitle1" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
          Meal {slotNum}
          {currentStatus && <Chip label={currentStatus} size="small" sx={{ ml: 1, bgcolor: MEAL_STATUS_COLOR[currentStatus], color: '#fff', height: 18, fontSize: '0.65rem' }} />}
        </Typography>
        <IconButton onClick={onClose} size="small" sx={{ color: 'text.secondary' }}>✕</IconButton>
      </Box>

      {/* Current meal detail + status actions */}
      {currentMeal && (
        <Box sx={{ px: 3, py: 2, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <Typography variant="h6" sx={{ mb: 0.5 }}>{currentMeal.name}</Typography>
          <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap', gap: 0.5 }}>
            <Chip label={`${currentMeal.protein}g P`} size="small" sx={{ bgcolor: '#1565c0' }} />
            <Chip label={`${currentMeal.carbs}g C`} size="small" sx={{ bgcolor: '#5d4037' }} />
            <Chip label={`${currentMeal.fat}g F`} size="small" sx={{ bgcolor: '#4a148c' }} />
            <Chip label={`${currentMeal.calories} kcal`} size="small" variant="outlined" />
          </Stack>
          {currentMeal.ingredients?.length > 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{currentMeal.ingredients.join(' · ')}</Typography>
          )}
          {/* Status buttons */}
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button size="small" variant={currentStatus === 'planned' ? 'contained' : 'outlined'}
              sx={{ fontSize: '0.7rem' }}
              onClick={() => onSelect(currentMeal.id, 'planned')}>Plan</Button>
            <Button size="small" variant={currentStatus === 'eating' ? 'contained' : 'outlined'} color="success"
              sx={{ fontSize: '0.7rem' }}
              onClick={() => onSelect(currentMeal.id, 'eating')}>Eating now</Button>
            <Button size="small" variant={currentStatus === 'eaten' ? 'contained' : 'outlined'} color="warning"
              sx={{ fontSize: '0.7rem' }}
              onClick={() => onSelect(currentMeal.id, 'eaten')}>Eaten ✓</Button>
            <Button size="small" color="error" sx={{ fontSize: '0.7rem', ml: 'auto' }}
              onClick={() => onSelect(null, null)}>Clear</Button>
          </Stack>
        </Box>
      )}

      {/* Search */}
      <Box sx={{ px: 3, pt: 2, pb: 1 }}>
        <TextField size="small" fullWidth placeholder="Search meals..." value={search} onChange={e => setSearch(e.target.value)} />
      </Box>

      {/* Category tabs (hidden when searching) */}
      {!search && categories.length > 1 && (
        <Tabs
          value={Math.min(tab, categories.length - 1)}
          onChange={(_, v) => setTab(v)}
          variant="fullWidth"
          sx={{ borderBottom: '1px solid rgba(255,255,255,0.08)', minHeight: 36,
            '& .MuiTab-root': { minHeight: 36, fontSize: '0.7rem', textTransform: 'capitalize', py: 0 } }}
        >
          {categories.map(c => <Tab key={c} label={c} />)}
        </Tabs>
      )}

      {/* Meal list */}
      <Box sx={{ flex: 1, overflow: 'auto', px: 1 }}>
        {visibleMeals.map(m => (
          <ListItemButton key={m.id} onClick={() => onSelect(m.id, currentStatus || 'planned')} sx={{ borderRadius: 1 }}>
            <ListItemText
              primary={m.name}
              secondary={`${m.calories} kcal · ${m.protein}g P · ${m.carbs}g C`}
            />
          </ListItemButton>
        ))}
        {visibleMeals.length === 0 && (
          <Typography variant="body2" color="text.disabled" sx={{ px: 2, py: 3, textAlign: 'center' }}>No meals found</Typography>
        )}
      </Box>
    </Drawer>
  );
}

// ─── Meals Panel ─────────────────────────────────────────────────────────────
function MealsPanel({ slots, meals, onSlotClick, date }) {
  const [showGrocery, setShowGrocery] = useState(false);
  const { data: groceryData } = useGroceryList(showGrocery ? date : null);
  if (!slots) return null;
  const mealMap = {};
  for (const m of (meals || [])) mealMap[m.id] = m;

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 1.5, color: 'text.secondary', fontWeight: 600, letterSpacing: 1, fontSize: '0.7rem', textTransform: 'uppercase' }}>
        Meals Today
      </Typography>
      <Stack spacing={1}>
        {MEAL_SLOTS.map((slot, idx) => {
          const slotData = slots.find(s => s.slot === slot);
          const meal = slotData?.meal_id ? mealMap[slotData.meal_id] : null;
          const status = slotData?.status;
          const isEmpty = !meal;

          return (
            <Box
              key={slot}
              onClick={() => onSlotClick(slot)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, py: 1,
                borderRadius: 1, cursor: 'pointer', border: '1px solid',
                borderColor: status === 'eating' ? 'rgba(76,175,80,0.5)' : status === 'eaten' ? 'rgba(230,145,56,0.3)' : 'rgba(255,255,255,0.06)',
                bgcolor: status === 'eating' ? 'rgba(76,175,80,0.08)' : 'transparent',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' },
                transition: 'all 0.1s',
                boxShadow: status === 'eating' ? '0 0 8px rgba(76,175,80,0.2)' : 'none',
              }}
            >
              {/* Slot number circle */}
              <Box sx={{
                width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                bgcolor: status === 'eating' ? 'rgba(76,175,80,0.9)' : status === 'eaten' ? 'rgba(230,145,56,0.85)' : isEmpty ? 'rgba(255,255,255,0.08)' : 'rgba(100,160,255,0.6)',
                border: `1.5px solid ${status === 'eating' ? 'rgba(76,175,80,1)' : status === 'eaten' ? 'rgba(230,145,56,1)' : 'rgba(255,255,255,0.2)'}`,
              }}>
                <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, lineHeight: 1 }}>
                  {status === 'eaten' ? '✓' : status === 'eating' ? '⏺' : idx + 1}
                </Typography>
              </Box>

              {/* Meal info */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                {meal ? (
                  <>
                    <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.2, mb: 0.25 }}>{meal.name}</Typography>
                    <Stack direction="row" spacing={0.5}>
                      <Typography variant="caption" sx={{ color: '#90caf9', fontSize: '0.65rem' }}>{meal.protein}g P</Typography>
                      <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>·</Typography>
                      <Typography variant="caption" sx={{ color: '#a5d6a7', fontSize: '0.65rem' }}>{meal.calories} kcal</Typography>
                    </Stack>
                  </>
                ) : (
                  <Typography variant="body2" color="text.disabled" sx={{ fontSize: '0.78rem' }}>+ Add meal {idx + 1}</Typography>
                )}
              </Box>

              {/* Status badge */}
              {status && (
                <Chip label={status} size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: MEAL_STATUS_COLOR[status], color: '#fff', flexShrink: 0 }} />
              )}
            </Box>
          );
        })}
      </Stack>

      {/* Grocery list toggle */}
      <Box sx={{ mt: 1.5, borderTop: '1px solid rgba(255,255,255,0.06)', pt: 1.5 }}>
        <Button size="small" variant="text" sx={{ fontSize: '0.7rem', color: 'text.secondary', p: 0 }}
          onClick={() => setShowGrocery(v => !v)}>
          {showGrocery ? '▲ Hide grocery list' : '🛒 Grocery list'}
        </Button>
        {showGrocery && groceryData && (
          <Box sx={{ mt: 1 }}>
            {groceryData.meals?.length === 0 ? (
              <Typography variant="caption" color="text.disabled">No meals planned yet.</Typography>
            ) : (
              <>
                <Stack spacing={0.25} sx={{ mb: 1 }}>
                  {groceryData.meals?.map((m, i) => (
                    <Typography key={i} variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                      {m.status === 'eaten' ? '✓' : m.status === 'eating' ? '⏺' : '·'} {m.name}
                    </Typography>
                  ))}
                </Stack>
                {groceryData.ingredients?.length > 0 && (
                  <>
                    <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.disabled', display: 'block', mb: 0.5 }}>INGREDIENTS</Typography>
                    <Stack direction="row" flexWrap="wrap" gap={0.5}>
                      {groceryData.ingredients.map(({ name, count }) => (
                        <Chip key={name} label={count > 1 ? `${name} ×${count}` : name} size="small"
                          variant="outlined" sx={{ height: 18, fontSize: '0.62rem' }} />
                      ))}
                    </Stack>
                  </>
                )}
              </>
            )}
          </Box>
        )}
      </Box>
    </Paper>
  );
}

// ─── Macro Bar ────────────────────────────────────────────────────────────────
function MacroBar({ macroTotals }) {
  if (!macroTotals) return null;
  const { protein, carbs, fat, calories, mealsPlanned, mealsEaten } = macroTotals;
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
          <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem', whiteSpace: 'nowrap' }}>{mealsEaten ?? mealsPlanned ?? 0}/{MEAL_SLOTS.length} eaten</Typography>
        </Stack>
      </Box>
    </Box>
  );
}

// ─── Sleep + Rest Bar ────────────────────────────────────────────────────────
function SleepBar({ dayStartMs, nowMs, sleepData, sleepStartMs, wakeTimeMs, displayDate, onQualityClick }) {
  const displayStartMs = getDisplayStartMs(dayStartMs);
  const displayEndMs   = getDisplayEndMs(dayStartMs, nowMs);
  const totalMs = displayEndMs - displayStartMs;
  const midnightMs = dayStartMs;

  const lastNight = sleepData?.lastNight;
  const todayRest = sleepData?.todayRest || [];
  const quality = lastNight?.quality;

  // Build segments
  const segments = [];
  if (sleepStartMs && wakeTimeMs) {
    segments.push({ startMs: Math.max(sleepStartMs, displayStartMs), endMs: wakeTimeMs, type: 'sleep', label: 'Sleep' });
  } else if (wakeTimeMs) {
    segments.push({ startMs: displayStartMs, endMs: wakeTimeMs, type: 'sleep', label: 'Sleep' });
  }
  for (const r of todayRest) {
    const rs = new Date(r.restStart).getTime(), re = new Date(r.restEnd).getTime();
    if (re > displayStartMs && rs < displayEndMs) {
      segments.push({ startMs: Math.max(rs, displayStartMs), endMs: Math.min(re, displayEndMs), type: 'rest', label: `Rest · ${formatDuration(re - rs)}` });
    }
  }

  const fmtSleep = (mins) => {
    if (!mins) return '—';
    const h = Math.floor(mins / 60), m = mins % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  };

  // Convert avgBedtimeMinutes / avgWaketimeMinutes (minutes from midnight) to ms on this day's timeline
  const avgBedMs = sleepData?.avgBedtimeMinutes != null
    ? midnightMs + (sleepData.avgBedtimeMinutes >= 1440 ? sleepData.avgBedtimeMinutes - 1440 : sleepData.avgBedtimeMinutes) * 60000
    : null;
  const avgWakeMs = sleepData?.avgWaketimeMinutes != null
    ? midnightMs + sleepData.avgWaketimeMinutes * 60000
    : null;

  const pctOf = (ms) => ((ms - displayStartMs) / totalMs) * 100;

  const SLEEP_COLORS = {
    sleep: 'rgba(80,100,180,0.35)',
    rest: 'rgba(120,100,200,0.30)',
    awake: 'rgba(255,255,255,0.04)',
  };

  return (
    <Box sx={{ mt: 0.75 }}>
      <Box sx={{ display: 'flex' }}>
        <Box sx={{ width: Y_AXIS_WIDTH + 4, flexShrink: 0 }} />
        <Box sx={{ flex: 1, position: 'relative', height: 24, borderRadius: 0.5, overflow: 'visible', bgcolor: SLEEP_COLORS.awake }}>
          {/* Sleep/rest segments */}
          {segments.map((seg, i) => {
            const cs = Math.max(seg.startMs, displayStartMs), ce = Math.min(seg.endMs, displayEndMs);
            if (ce <= cs) return null;
            const lp = pctOf(cs), wp = ((ce - cs) / totalMs) * 100;
            const isSleep = seg.type === 'sleep';
            return (
              <Tooltip key={i} title={`${isSleep ? '🌙' : '😴'} ${seg.label}${isSleep && sleepStartMs ? ` (${formatTime(sleepStartMs)} – ${formatTime(wakeTimeMs)})` : ''}`} placement="top" arrow>
                <Box sx={{
                  position: 'absolute', top: 0, bottom: 0, left: `${lp}%`, width: `${wp}%`,
                  bgcolor: SLEEP_COLORS[seg.type],
                  borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.08)' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 0.5,
                }}>
                  {isSleep && wp > 5 && (
                    <Typography variant="caption" sx={{ color: 'rgba(150,170,255,0.7)', fontSize: '0.58rem', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                      🌙 {lastNight ? fmtSleep(lastNight.durationMinutes) : ''}
                    </Typography>
                  )}
                  {!isSleep && wp > 3 && (
                    <Typography variant="caption" sx={{ color: 'rgba(180,160,255,0.7)', fontSize: '0.58rem', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>😴</Typography>
                  )}
                </Box>
              </Tooltip>
            );
          })}

          {/* Avg bedtime reference line (orange dashed) */}
          {avgBedMs && avgBedMs > displayStartMs && avgBedMs < displayEndMs && (
            <Tooltip title={`Avg bedtime: ${formatTime(avgBedMs)}`} placement="top" arrow>
              <Box sx={{
                position: 'absolute', top: -2, bottom: -2, left: `${pctOf(avgBedMs)}%`,
                width: 0, borderLeft: '1.5px dashed rgba(255,167,38,0.6)', zIndex: 4, pointerEvents: 'auto',
              }} />
            </Tooltip>
          )}

          {/* Avg wake reference line (cyan dashed) */}
          {avgWakeMs && avgWakeMs > displayStartMs && avgWakeMs < displayEndMs && (
            <Tooltip title={`Avg wake: ${formatTime(avgWakeMs)}`} placement="top" arrow>
              <Box sx={{
                position: 'absolute', top: -2, bottom: -2, left: `${pctOf(avgWakeMs)}%`,
                width: 0, borderLeft: '1.5px dashed rgba(0,230,200,0.55)', zIndex: 4, pointerEvents: 'auto',
              }} />
            </Tooltip>
          )}

          {/* Quality badge */}
          {lastNight && wakeTimeMs && wakeTimeMs > displayStartMs && (
            <Tooltip title={quality ? `Sleep quality: ${quality}/5 — click to edit` : 'Rate sleep quality'} placement="top" arrow>
              <Box
                onClick={(e) => onQualityClick?.(e, displayDate)}
                sx={{
                  position: 'absolute', top: '50%', transform: 'translate(-50%, -50%)',
                  left: `${Math.min(pctOf(wakeTimeMs) + 1.5, 95)}%`,
                  width: 20, height: 20, borderRadius: '50%', cursor: 'pointer',
                  bgcolor: quality ? `rgba(${quality >= 4 ? '76,175,80' : quality >= 3 ? '255,193,7' : '244,67,54'},0.8)` : 'rgba(255,255,255,0.15)',
                  border: '1.5px solid rgba(255,255,255,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5,
                  '&:hover': { transform: 'translate(-50%, -50%) scale(1.15)', filter: 'brightness(1.2)' },
                  transition: 'all 0.15s',
                }}>
                <Typography sx={{ fontSize: '0.55rem', fontWeight: 700, lineHeight: 1 }}>{quality || '?'}</Typography>
              </Box>
            </Tooltip>
          )}
        </Box>
      </Box>
      {/* Summary + legend */}
      <Stack direction="row" justifyContent="flex-end" alignItems="center" spacing={1.5} sx={{ mt: 0.5, pl: `${Y_AXIS_WIDTH + 4}px` }}>
        {lastNight && (
          <Typography variant="caption" sx={{ color: 'rgba(150,180,255,0.7)', fontSize: '0.62rem', fontFamily: 'monospace' }}>
            🌙 last night: <strong>{fmtSleep(lastNight.durationMinutes)}</strong>
            {sleepStartMs && ` (${formatTime(sleepStartMs)} – ${formatTime(wakeTimeMs)})`}
            {quality && <span> · ⭐ {quality}/5</span>}
          </Typography>
        )}
        {sleepData?.avgMinutes && (
          <Typography variant="caption" sx={{ color: 'rgba(150,180,255,0.45)', fontSize: '0.62rem', fontFamily: 'monospace' }}>
            7d avg: <strong>{fmtSleep(sleepData.avgMinutes)}</strong>
            {sleepData.avgQuality && ` · q:${sleepData.avgQuality}`}
            {sleepData.sleepDebt > 30 && <span style={{ color: 'rgba(244,67,54,0.7)' }}> · debt:{fmtSleep(sleepData.sleepDebt)}</span>}
          </Typography>
        )}
        {sleepData?.todayRestMinutes > 0 && (
          <Typography variant="caption" sx={{ color: 'rgba(180,160,255,0.5)', fontSize: '0.62rem', fontFamily: 'monospace' }}>
            😴 rest: {fmtSleep(sleepData.todayRestMinutes)}
          </Typography>
        )}
        {/* Reference line legend */}
        {(avgBedMs || avgWakeMs) && (
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.52rem', fontFamily: 'monospace' }}>
            {avgBedMs && <><span style={{ color: 'rgba(255,167,38,0.7)' }}>┆</span> avg bed</>}
            {avgBedMs && avgWakeMs && ' · '}
            {avgWakeMs && <><span style={{ color: 'rgba(0,230,200,0.7)' }}>┆</span> avg wake</>}
          </Typography>
        )}
      </Stack>
    </Box>
  );
}

// ─── Sleep Quality Popover ──────────────────────────────────────────────────
function SleepQualityPopover({ anchorEl, onClose, date, currentQuality, onSave }) {
  const [quality, setQuality] = useState(currentQuality || 0);
  useEffect(() => { setQuality(currentQuality || 0); }, [currentQuality]);

  return (
    <Popover
      open={!!anchorEl}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      transformOrigin={{ vertical: 'top', horizontal: 'center' }}
    >
      <Box sx={{ p: 1.5, minWidth: 160 }}>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>Sleep Quality</Typography>
        <Stack direction="row" spacing={0.5} sx={{ mb: 1 }}>
          {[1, 2, 3, 4, 5].map(n => (
            <Box
              key={n}
              onClick={() => setQuality(n)}
              sx={{
                width: 28, height: 28, borderRadius: '50%', cursor: 'pointer',
                bgcolor: n <= quality
                  ? n >= 4 ? 'rgba(76,175,80,0.8)' : n >= 3 ? 'rgba(255,193,7,0.8)' : 'rgba(244,67,54,0.7)'
                  : 'rgba(255,255,255,0.1)',
                border: '1.5px solid rgba(255,255,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                '&:hover': { filter: 'brightness(1.3)', transform: 'scale(1.1)' },
                transition: 'all 0.1s',
              }}
            >
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 700 }}>{n}</Typography>
            </Box>
          ))}
        </Stack>
        <Button size="small" variant="contained" fullWidth disabled={!quality}
          onClick={() => { onSave(date, quality); onClose(); }}
          sx={{ textTransform: 'none', fontSize: '0.7rem' }}
        >
          Save
        </Button>
      </Box>
    </Popover>
  );
}

// ─── Fasting + Meal Bar ───────────────────────────────────────────────────────
function FastingBar({ dayStartMs, nowMs, mealPlan, meals, onMealSlotClick, sleepStartMs }) {
  const displayStartMs = getDisplayStartMs(dayStartMs);
  const displayEndMs   = getDisplayEndMs(dayStartMs, nowMs);
  const totalMs = displayEndMs - displayStartMs;
  const midnightMs = dayStartMs;
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
        {/* Meal slot circles — evenly spaced across the eating window */}
        {(() => {
          const eatingCs = Math.max(eatingStartMs, displayStartMs);
          const eatingCe = Math.min(eatingEndMs, displayEndMs);
          if (eatingCe <= eatingCs) return null;
          const eatingWidthPct = ((eatingCe - eatingCs) / totalMs) * 100;
          const eatingLeftPct  = ((eatingCs - displayStartMs) / totalMs) * 100;
          const step = eatingWidthPct / (MEAL_SLOTS.length + 1);

          return MEAL_SLOTS.map((slot, idx) => {
            const slotInfo = slotMealMap[slot];
            const lp = eatingLeftPct + step * (idx + 1);
            const hasMeal = !!slotInfo?.meal_id;
            const status = slotInfo?.status || null;
            const isEating = status === 'eating';
            const isEaten  = status === 'eaten';
            const bgColor = isEating ? 'rgba(76,175,80,0.9)' : isEaten ? 'rgba(230,145,56,0.85)' : hasMeal ? 'rgba(100,160,255,0.6)' : 'rgba(255,255,255,0.12)';
            const label = isEating ? '⏺' : isEaten ? '🍽' : hasMeal ? `${idx + 1}` : '+';
            const tooltipTitle = slotInfo?.name ? `${idx + 1}. ${slotInfo.name}${status ? ` (${status})` : ''}` : `Meal ${idx + 1}`;
            return (
              <Tooltip key={slot} title={tooltipTitle} placement="top" arrow>
                <Box onClick={() => onMealSlotClick(slot)} sx={{
                  position: 'absolute', top: '50%', transform: 'translate(-50%, -50%)', left: `${lp}%`,
                  width: 22, height: 22, bgcolor: bgColor,
                  border: `1.5px solid ${isEating ? 'rgba(76,175,80,1)' : isEaten ? 'rgba(230,145,56,1)' : 'rgba(255,255,255,0.3)'}`,
                  borderRadius: '50%', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2,
                  '&:hover': { transform: 'translate(-50%, -50%) scale(1.15)', filter: 'brightness(1.2)' },
                  transition: 'all 0.15s',
                  boxShadow: isEating ? '0 0 6px rgba(76,175,80,0.7)' : 'none',
                }}>
                  <Typography sx={{ fontSize: '0.6rem', lineHeight: 1, fontWeight: 600 }}>{label}</Typography>
                </Box>
              </Tooltip>
            );
          });
        })()}
      </Box>
    </Box>
  );
}

// ─── Calendar Overlay ─────────────────────────────────────────────────────────
function CalendarOverlay({ events, dayStartMs, nowMs, sleepStartMs }) {
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
function TimelineBar({ timeline, dayStartMs, nowMs, onBlockClick, isLive, onSessionUpdate, sleepStartMs, wakeTimeMs, pending, routine }) {
  const displayStartMs = getDisplayStartMs(dayStartMs);
  const displayEndMs   = getDisplayEndMs(dayStartMs, nowMs);
  const totalMs = displayEndMs - displayStartMs;
  const midnightMs = dayStartMs;
  const containerRef = useRef(null);
  const dragRef = useRef(null);
  const wasDraggingRef = useRef(false);
  const [dragOverride, setDragOverride] = useState(null);
  const [reassignAnchor, setReassignAnchor] = useState(null);
  const [reassignSegment, setReassignSegment] = useState(null);

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
      const { type, segIdx } = drag; dragRef.current = null; wasDraggingRef.current = true; setTimeout(() => { wasDraggingRef.current = false; }, 50);
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
      <Box ref={containerRef} sx={{ flex: 1, position: 'relative', height: CHART_HEIGHT, userSelect: 'none', overflow: 'hidden' }}>
        {/* Sleep block — midnight → wake time */}
        {wakeTimeMs && wakeTimeMs > displayStartMs && (() => {
          const eMs = Math.min(wakeTimeMs, displayEndMs);
          const wp = ((eMs - displayStartMs) / totalMs) * 100;
          const sleepLabel = sleepStartMs
            ? `🌙 ${formatTime(sleepStartMs)} – ${formatTime(wakeTimeMs)} · ${formatDuration(wakeTimeMs - sleepStartMs)}`
            : `🌙 Wake ${formatTime(wakeTimeMs)}`;
          return (
            <Tooltip title={sleepLabel} placement="top" arrow key="sleep-block">
              <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${wp}%`, bgcolor: 'rgba(100,130,255,0.13)', borderRight: '2px solid rgba(150,180,255,0.5)', zIndex: 1, pointerEvents: 'auto' }} />
            </Tooltip>
          );
        })()}
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
          const canReassign = !seg.isGap && !!seg.taskId;
          return (
            <Tooltip key={i} title={<span style={{whiteSpace:'pre-line'}}>{tipLabel}</span>} arrow placement="top" disableHoverListener={!!dragOverride || !!reassignAnchor}>
              <Box
                onClick={canReassign ? (e) => {
                  if (wasDraggingRef.current) return; // don't open after drag
                  setReassignSegment(seg);
                  setReassignAnchor(e.currentTarget);
                } : undefined}
                sx={{ position: 'absolute', bottom: 0, left: `${lp}%`, width: `${wp}%`, height: `${hp}%`, minHeight: seg.isGap ? 0 : 2, bgcolor: color, opacity: seg.isGap ? 1 : 0.88, borderLeft: seg.isGap ? 'none' : '1px solid rgba(0,0,0,0.25)', borderRight: seg.isGap ? 'none' : '1px solid rgba(0,0,0,0.25)', zIndex: 1, cursor: canReassign ? 'pointer' : 'default', '&:hover': { opacity: 1, zIndex: 2 }, transition: 'opacity 0.1s' }}>
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
      <SessionReassignPopover
        anchorEl={reassignAnchor}
        onClose={() => { setReassignAnchor(null); setReassignSegment(null); }}
        segment={reassignSegment}
        pending={pending}
        routine={routine}
      />
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
  const [taskViewMode, setTaskViewMode] = useState('novel');
  const [qualityAnchor, setQualityAnchor] = useState(null);
  const [qualityDate, setQualityDate] = useState(null);
  const { data, isLoading, error }    = useFocusDay(selectedDate);
  const { data: calData }             = useCalendarEvents(displayDate);
  const { data: mealPlanData }        = useMealPlan(displayDate);
  const { data: mealsData }           = useMeals();
  const { data: sleepData }           = useSleepData(displayDate);
  const setMealSlotMutation           = useSetMealSlot();
  const updateSessionMutation         = useUpdateSession();
  const saveQualityMutation           = useSaveSleepQuality();
  const { data: tasksData }           = useAllTasks();
  const { data: timeData }            = useTimeSums();
  const taskAction                    = useTaskAction();

  const mutateSessionRef = useRef(updateSessionMutation.mutate);
  mutateSessionRef.current = updateSessionMutation.mutate;
  const handleSessionUpdate = useCallback(updates => { mutateSessionRef.current(updates); }, []);
  const setMealSlotRef = useRef({ mutate: setMealSlotMutation.mutate, mealSlot, displayDate });
  setMealSlotRef.current = { mutate: setMealSlotMutation.mutate, mealSlot, displayDate };
  const handleMealSelect = useCallback((mealId, status) => {
    const { mutate, mealSlot: slot, displayDate: date } = setMealSlotRef.current;
    if (!slot) return;
    const eatenAt = status === 'eaten' ? new Date().toISOString() : undefined;
    mutate({ date, slot, mealId, status: mealId ? (status || 'planned') : null, eatenAt });
    setMealSlot(null);
  }, []);

  const activeSlotData = mealSlot
    ? (mealPlanData?.slots || []).find(s => s.slot === mealSlot)
    : null;

  if (isLoading) return <LinearProgress />;
  if (error) return <Typography color="error">Error: {error.message}</Typography>;
  if (!data?.timeline) return <Typography color="text.secondary">No focus data.</Typography>;

  const { timeline, summary, dayStartMs, nowMs } = data;

  // Sleep bridging: extend display back if sleep started before midnight
  const lastNight = sleepData?.lastNight;
  const sleepStartMs = lastNight?.sleepStart ? new Date(lastNight.sleepStart).getTime() : null;
  const wakeTimeMs   = lastNight?.wakeTime   ? new Date(lastNight.wakeTime).getTime()   : null;

  // Sleep duration formatting
  const fmtSleep = (mins) => {
    if (!mins) return '—';
    const h = Math.floor(mins / 60), m = mins % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  };

  // Task data for the bottom panel
  const currentTask = tasksData?.current?.task || null;
  const pendingTasks = taskViewMode === 'routine'
    ? (tasksData?.routine || []).filter(t => t.title !== 'general')
    : (tasksData?.pending || []);
  const daySums = timeData?.sums?.day || {};
  const grouped = {};
  for (const ctx of (CONTEXT_ORDER || [])) grouped[ctx] = [];
  for (const task of pendingTasks) {
    const ctx = task.activityContext || 'unstructured';
    if (!grouped[ctx]) grouped[ctx] = [];
    grouped[ctx].push(task);
  }

  return (
    <Box>
      {/* Current task — highlighted at the very top */}
      <ActiveTask task={currentTask} action={taskAction} pending={tasksData?.pending} routine={tasksData?.routine} />

      {/* Weekly goal commitments and progress */}
      <WeeklyGoalsProgress />

      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>Focus Timeline</Typography>
        <IconButton size="small" onClick={() => setSelectedDate(addDays(displayDate, -1))}><ChevronLeftIcon /></IconButton>
        <Typography variant="body2" sx={{ fontFamily: 'monospace', minWidth: 90, textAlign: 'center' }}>
          {isToday ? 'Today' : displayDate}
        </Typography>
        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem' }}>
          {new Date().toLocaleTimeString('en-US', { timeZoneName: 'short', timeZone: DISPLAY_TZ }).split(' ').pop()}
        </Typography>
        <IconButton size="small" onClick={() => setSelectedDate(addDays(displayDate, 1))} disabled={isToday}><ChevronRightIcon /></IconButton>
        {!isToday && <IconButton size="small" onClick={() => setSelectedDate(null)}><TodayIcon /></IconButton>}
      </Stack>

      {(() => {
        const totalMs = nowMs - dayStartMs;
        const trackedMs = (summary.pctTracked / 100) * totalMs;
        const sleepMs = lastNight ? lastNight.durationMinutes * 60000 : 0;
        const activeMs = (summary.pctActive / 100) * trackedMs;
        const awakeTrackedMs = trackedMs - sleepMs;
        const pctActiveFocus = awakeTrackedMs > 60000 ? Math.min(100, Math.round((activeMs / awakeTrackedMs) * 100)) : (summary.pctActive || 0);
        return (
          <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
            <StatCard label="Focused Minutes" value={`${summary.focusedMins}m`} sub="Σ focus×mins, f>0" />
            <StatCard label="Tracked" value={`${summary.pctTracked}%`} sub="of day" />
            <StatCard label="Active Focus" value={`${pctActiveFocus}%`} sub="awake tracked time at f>0" />
          </Stack>
        );
      })()}


      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" alignItems="center" sx={{ mb: 1.5 }}>
          <Typography variant="subtitle2" sx={{ flexGrow: 1, color: 'text.secondary' }}>{isToday ? "Today's Focus" : `${displayDate}`}</Typography>
          {isToday && <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem' }}>drag edges to edit · drag top for focus</Typography>}
        </Stack>
        <TimelineBar timeline={timeline} dayStartMs={dayStartMs} nowMs={nowMs} onBlockClick={setDrawerBlock} isLive={!!data.isLive} onSessionUpdate={handleSessionUpdate} sleepStartMs={sleepStartMs} wakeTimeMs={wakeTimeMs} pending={tasksData?.pending} routine={tasksData?.routine} />
        <TimeAxis dayStartMs={dayStartMs} nowMs={nowMs} sleepStartMs={sleepStartMs} />
        {calData?.events?.length > 0 && (
          <>
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1, mb: 0.25, pl: `${Y_AXIS_WIDTH + 4}px`, fontSize: '0.58rem' }}>calendar</Typography>
            <CalendarOverlay events={calData.events} dayStartMs={dayStartMs} nowMs={nowMs} sleepStartMs={sleepStartMs} />
          </>
        )}
        <FastingBar dayStartMs={dayStartMs} nowMs={nowMs} mealPlan={mealPlanData} meals={mealsData?.meals} onMealSlotClick={setMealSlot} />
        {mealPlanData?.macroTotals && <MacroBar macroTotals={mealPlanData.macroTotals} />}
        <SleepBar
          dayStartMs={dayStartMs} nowMs={nowMs}
          sleepData={sleepData} sleepStartMs={sleepStartMs} wakeTimeMs={wakeTimeMs}
          displayDate={displayDate}
          onQualityClick={(e, date) => { setQualityAnchor(e.currentTarget); setQualityDate(date); }}
        />
      </Paper>
      <SleepQualityPopover
        anchorEl={qualityAnchor}
        onClose={() => { setQualityAnchor(null); setQualityDate(null); }}
        date={qualityDate}
        currentQuality={sleepData?.lastNight?.quality}
        onSave={(date, quality) => saveQualityMutation.mutate({ date, quality })}
      />

      {/* Task management widgets */}
      <Box sx={{ mt: 2, maxWidth: 900 }}>
        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1.5 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {taskViewMode === 'routine' ? 'Routine Tasks' : 'Pending Tasks'}
          </Typography>
          {tasksData && (
            <>
              <Chip label={`${pendingTasks.length} ${taskViewMode}`} variant="outlined" size="small" />
              <Button size="small" variant={taskViewMode === 'routine' ? 'contained' : 'outlined'}
                onClick={() => setTaskViewMode(taskViewMode === 'novel' ? 'routine' : 'novel')}
                sx={{ fontSize: '0.7rem', minWidth: 70 }}>
                {taskViewMode === 'routine' ? 'Routine' : 'Novel'}
              </Button>
              <Box sx={{ flexGrow: 1 }} />
              <Button size="small" variant="outlined" onClick={() => taskAction.mutate({ action: 'pull-goog' })} disabled={taskAction.isPending}>
                Pull Google Tasks
              </Button>
              <Button size="small" variant="outlined" onClick={() => taskAction.mutate({ action: 'pull-jira' })} disabled={taskAction.isPending}>
                Pull Jira
              </Button>
            </>
          )}
        </Stack>
        <AddTaskForm action={taskAction} />
        {(CONTEXT_ORDER || []).map((ctx) => {
          const ctxTasks = grouped[ctx] || [];
          if (!ctxTasks.length) return null;
          return (
            <ContextGroup
              key={ctx}
              context={ctx}
              tasks={ctxTasks}
              daySums={daySums}
              action={taskAction}
            />
          );
        })}
        <CompletedStrip completed={tasksData?.completed} />
      </Box>

      <ProtocolDrawer query={drawerBlock?.protocol} label={drawerBlock?.label} onClose={() => setDrawerBlock(null)} />
      <MealDrawer slot={mealSlot} slotData={activeSlotData} meals={mealsData?.meals} onSelect={handleMealSelect} onClose={() => setMealSlot(null)} />
    </Box>
  );
}
