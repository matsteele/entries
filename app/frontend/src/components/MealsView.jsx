'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Box, Typography, Paper, Stack, Chip, Button, LinearProgress,
  IconButton, Drawer, TextField, ListItemButton, ListItemText, Tabs, Tab,
  Divider, Tooltip, Toolbar,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import { useQuery } from '@tanstack/react-query';
import { useMealPlan, useMeals, useSetMealSlot } from '../hooks/useApi';
// useQuery is used by useSevenWeeks above
import GroceryView from './GroceryView';

// ─── Constants ────────────────────────────────────────────────────────────────
const MEAL_SLOTS    = ['meal-1', 'meal-2', 'meal-3', 'meal-4', 'meal-5'];
const MEAL_CATEGORIES = ['breakfast', 'lunch', 'dinner', 'snack', 'drink', 'other'];
const STATUS_COLOR  = { planned: '#5c8edb', eaten: '#e6913a' };
const DAY_LABELS    = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MACRO_TARGETS = { protein: 200, carbs: 200, fat: 70, calories: 2200 };

// ─── Date helpers ─────────────────────────────────────────────────────────────
function todayStr() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
}
function getSundayOfWeek(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() - d.getDay());
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
}
function formatShort(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return `${d.getMonth()+1}/${d.getDate()}`;
}
function formatMonthDay(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Fetch 7 weeks of meal plans ─────────────────────────────────────────────
function useSevenWeeks(gridStart) {
  const dates = Array.from({ length: 49 }, (_, i) => addDays(gridStart, i));
  return useQuery({
    queryKey: ['seven-weeks', gridStart],
    queryFn: () => Promise.all(
      dates.map(date =>
        fetch(`/api/meal-plans/${date}`).then(r => r.json()).then(d => ({ ...d, date })).catch(() => ({ date, slots: [], macroTotals: null }))
      )
    ),
    staleTime: 30000,
  });
}

// ─── Meal Picker Drawer ───────────────────────────────────────────────────────
function MealPickerDrawer({ slot, slotData, meals, onSelect, onClose }) {
  const [search, setSearch] = useState('');
  const [planningMode, setPlanningMode] = useState(false);
  const isOtherSlot = slot?.startsWith('other-');

  const grouped = {};
  for (const m of (meals || [])) {
    const c = m.category || 'other';
    if (!grouped[c]) grouped[c] = [];
    grouped[c].push(m);
  }
  for (const c of Object.keys(grouped)) grouped[c].sort((a, b) => (b.protein||0) - (a.protein||0));

  const categories   = MEAL_CATEGORIES.filter(c => grouped[c]?.length);
  const [tab, setTab] = useState(0);
  useEffect(() => {
    if (!slot) return;
    const defaultTab = slot.startsWith('other-') ? Math.max(0, categories.indexOf('other')) : 0;
    setTab(defaultTab);
    setSearch('');
  }, [slot]); // eslint-disable-line react-hooks/exhaustive-deps
  const activeCat    = search ? null : (categories[tab] || categories[0]);
  const visibleMeals = search
    ? (meals||[]).filter(m => m.name.toLowerCase().includes(search.toLowerCase()))
    : (grouped[activeCat] || []);

  const isOther     = slot?.startsWith('other-');
  const slotNum     = slot?.replace('meal-', '') || '';
  const currentMeal = slotData?.meal_id ? meals?.find(m => m.id === slotData.meal_id) : null;
  const status      = slotData?.status || null;

  return (
    <Drawer anchor="right" open={!!slot} onClose={onClose}
      PaperProps={{ sx: { width: 400, bgcolor: '#161616', display: 'flex', flexDirection: 'column' } }}>
      <Toolbar variant="dense" />
      {/* Header */}
      <Box sx={{ px: 3, py: 2, borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="subtitle1" sx={{ fontFamily: 'monospace', fontWeight: 600, flexGrow: 1 }}>
          {isOther ? 'Snack / Drink' : `Meal ${slotNum}`}
        </Typography>
        {status && <Chip label={status} size="small" sx={{ bgcolor: STATUS_COLOR[status], color: '#fff', height: 18, fontSize: '0.65rem' }} />}
        <IconButton onClick={onClose} size="small" sx={{ color: 'text.secondary' }}>✕</IconButton>
      </Box>

      {/* Current meal + status actions */}
      {currentMeal && (
        <Box sx={{ px: 3, py: 2, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 600 }}>{currentMeal.name}</Typography>
          <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mb: 1.5 }}>
            <Chip label={`${currentMeal.protein}g P`} size="small" sx={{ bgcolor: '#1565c0', height: 18, fontSize: '0.65rem' }} />
            <Chip label={`${currentMeal.carbs}g C`}   size="small" sx={{ bgcolor: '#4e342e', height: 18, fontSize: '0.65rem' }} />
            <Chip label={`${currentMeal.fat}g F`}      size="small" sx={{ bgcolor: '#4a148c', height: 18, fontSize: '0.65rem' }} />
            <Chip label={`${currentMeal.calories} kcal`} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} />
          </Stack>
          {currentMeal.ingredients?.length > 0 && (
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 1.5, lineHeight: 1.4 }}>
              {currentMeal.ingredients.join(' · ')}
            </Typography>
          )}
          <Stack direction="row" spacing={0.75}>
            <Button size="small" variant={status==='planned'?'contained':'outlined'} sx={{ fontSize: '0.68rem', py: 0.25 }}
              onClick={() => onSelect(currentMeal.id, 'planned')}>Plan</Button>
            <Button size="small" variant={status==='eaten'?'contained':'outlined'} color="warning" sx={{ fontSize: '0.68rem', py: 0.25 }}
              onClick={() => onSelect(currentMeal.id, 'eaten')}>Eaten ✓</Button>
            <Box sx={{ flexGrow: 1 }} />
            <Button size="small" color="error" sx={{ fontSize: '0.68rem', py: 0.25 }}
              onClick={() => onSelect(null, null)}>Clear</Button>
          </Stack>
        </Box>
      )}

      <Box sx={{ px: 3, pt: 2, pb: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <TextField size="small" fullWidth placeholder="Search meals…" value={search} onChange={e => setSearch(e.target.value)} />
          <Button
            size="small"
            variant={planningMode ? 'contained' : 'outlined'}
            onClick={() => setPlanningMode(!planningMode)}
            sx={{ fontSize: '0.68rem', py: 0.5, whiteSpace: 'nowrap', minWidth: 80 }}
          >
            {planningMode ? 'Planning' : 'Planning'}
          </Button>
        </Stack>
      </Box>

      {!search && categories.length > 1 && (
        <Stack direction="row" spacing={0.5} sx={{ px: 3, pb: 1, justifyContent: 'center' }}>
          {categories.map((c, i) => {
            const label = { breakfast: 'B', lunch: 'L', dinner: 'D', snack: 'S', drink: 'Dr', other: '…' }[c] || '…';
            const active = tab === i;
            return (
              <Tooltip key={c} title={c} placement="top" arrow>
                <IconButton size="small" onClick={() => setTab(i)}
                  sx={{ fontSize: '0.72rem', fontWeight: 700, width: 32, height: 32, opacity: active ? 1 : 0.4,
                    bgcolor: active ? 'rgba(255,255,255,0.1)' : 'transparent', color: 'text.primary',
                    '&:hover': { opacity: 1, bgcolor: 'rgba(255,255,255,0.06)' } }}>
                  {label}
                </IconButton>
              </Tooltip>
            );
          })}
        </Stack>
      )}

      <Box sx={{ flex: 1, overflow: 'auto', px: 1 }}>
        {visibleMeals.map(m => (
          <ListItemButton key={m.id} onClick={() => onSelect(m.id, planningMode ? 'planned' : 'eaten')} sx={{ borderRadius: 1, py: 0.75 }}>
            <ListItemText
              primary={<Typography variant="body2" sx={{ fontSize: '0.82rem' }}>{m.name}</Typography>}
              secondary={<Typography variant="caption" sx={{ fontSize: '0.68rem' }}>{m.calories} kcal · {m.protein}g P · {m.carbs}g C · {m.fat}g F</Typography>}
            />
          </ListItemButton>
        ))}
        {!visibleMeals.length && (
          <Typography variant="body2" color="text.disabled" sx={{ px: 2, py: 3, textAlign: 'center' }}>No meals found</Typography>
        )}
      </Box>
    </Drawer>
  );
}

// ─── Day Detail Panel ─────────────────────────────────────────────────────────
function DayDetail({ date, onClose }) {
  const today = todayStr();
  const { data: planData, isLoading } = useMealPlan(date);
  const { data: mealsData } = useMeals();
  const setSlotMutation = useSetMealSlot();
  const [activeSlot, setActiveSlot] = useState(null);
  const [othersOpen, setOthersOpen] = useState(true);

  const mealMap = {};
  for (const m of (mealsData?.meals || [])) mealMap[m.id] = m;

  const mutRef = useRef({ mutate: setSlotMutation.mutate, activeSlot, date });
  mutRef.current = { mutate: setSlotMutation.mutate, activeSlot, date };

  const handleSelect = useCallback((mealId, status) => {
    const { mutate, activeSlot: slot, date: d } = mutRef.current;
    if (!slot) return;
    mutate({ date: d, slot, mealId, status: mealId ? (status || 'eaten') : null,
      eatenAt: (status === 'eaten' || !status) ? new Date().toISOString() : undefined });
    setActiveSlot(null);
  }, []);

  // Find the next available other-N slot
  const otherSlots = planData?.otherSlots || [];
  const nextOtherSlot = (() => {
    const used = new Set(otherSlots.map(s => s.slot));
    for (let i = 1; i <= 20; i++) {
      if (!used.has(`other-${i}`)) return `other-${i}`;
    }
    return 'other-20';
  })();

  const activeSlotData = activeSlot
    ? ([...(planData?.slots || []), ...otherSlots].find(s => s.slot === activeSlot) || null)
    : null;
  const { protein=0, carbs=0, fat=0, calories=0 } = planData?.macroTotals || {};

  const d = new Date(date + 'T12:00:00');
  const isToday = date === today;
  const dayLabel = isToday ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      {/* Day header */}
      <Stack direction="row" alignItems="center" sx={{ mb: 2 }}>
        <IconButton size="small" onClick={onClose} sx={{ mr: 1 }}>✕</IconButton>
        <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 600 }}>{dayLabel}</Typography>
      </Stack>

      {/* Macro mini-bars */}
      <Paper sx={{ p: 1.5, mb: 2 }}>
        <Stack spacing={0.75}>
          {[['P', protein, MACRO_TARGETS.protein, '#1565c0'],
            ['C', carbs,   MACRO_TARGETS.carbs,   '#795548'],
            ['F', fat,     MACRO_TARGETS.fat,     '#6a1b9a'],
            ['kcal', calories, MACRO_TARGETS.calories, '#e65100']].map(([label, val, target, color]) => (
            <Stack key={label} direction="row" alignItems="center" spacing={1}>
              <Typography sx={{ width: 28, fontSize: '0.65rem', fontFamily: 'monospace', color, flexShrink: 0 }}>{label}</Typography>
              <Box sx={{ flex: 1, height: 4, bgcolor: 'rgba(255,255,255,0.07)', borderRadius: 1, overflow: 'hidden' }}>
                <Box sx={{ height: '100%', width: `${Math.min(100,(val/target)*100)}%`, bgcolor: color, borderRadius: 1 }} />
              </Box>
              <Typography sx={{ fontSize: '0.62rem', color: 'text.disabled', fontFamily: 'monospace', minWidth: 60, textAlign: 'right' }}>
                {Math.round(val)}/{target}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Paper>

      {/* Meal slots */}
      {isLoading ? <LinearProgress /> : (
        <Stack spacing={0.75}>
          {MEAL_SLOTS.map((slot, idx) => {
            const sd   = (planData?.slots || []).find(s => s.slot === slot);
            const meal = sd?.meal_id ? mealMap[sd.meal_id] : null;
            const st   = sd?.status;
            return (
              <Box key={slot} onClick={() => setActiveSlot(slot)} sx={{
                display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, py: 1,
                borderRadius: 1, cursor: 'pointer', border: '1px solid',
                borderColor: st==='eaten' ? 'rgba(230,145,56,0.3)' : 'rgba(255,255,255,0.06)',
                bgcolor: 'transparent',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' },
              }}>
                {/* Circle */}
                <Box sx={{
                  width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  bgcolor: st==='eaten' ? STATUS_COLOR.eaten : meal ? STATUS_COLOR.planned : 'rgba(255,255,255,0.08)',
                  border: `1.5px solid ${st ? STATUS_COLOR[st] : 'rgba(255,255,255,0.18)'}`,
                }}>
                  <Typography sx={{ fontSize: '0.65rem', fontWeight: 700 }}>
                    {st==='eaten' ? '✓' : idx+1}
                  </Typography>
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  {meal
                    ? <>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 500, lineHeight: 1.2 }}>{meal.name}</Typography>
                        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.62rem' }}>
                          {meal.protein}g P · {meal.calories} kcal
                        </Typography>
                      </>
                    : <Typography variant="body2" color="text.disabled" sx={{ fontSize: '0.75rem' }}>+ Add meal {idx+1}</Typography>
                  }
                </Box>
                {st && <Chip label={st} size="small" sx={{ height: 16, fontSize: '0.58rem', bgcolor: STATUS_COLOR[st], color: '#fff' }} />}
              </Box>
            );
          })}
        </Stack>
      )}

      {/* Snacks & Drinks */}
      <Box sx={{ mt: 1.5 }}>
        <Stack direction="row" alignItems="center" sx={{ mb: 0.75, cursor: 'pointer' }}
          onClick={() => setOthersOpen(o => !o)}>
          <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 600, letterSpacing: '0.08em', fontSize: '0.62rem', flexGrow: 1 }}>
            SNACKS &amp; DRINKS
          </Typography>
          <Typography sx={{ fontSize: '0.65rem', color: 'text.disabled' }}>{othersOpen ? '▲' : '▼'}</Typography>
        </Stack>

        {othersOpen && (
          <Stack spacing={0.5}>
            {otherSlots.map(sd => {
              const meal = sd.meal_id ? mealMap[sd.meal_id] : null;
              return (
                <Box key={sd.slot} onClick={() => setActiveSlot(sd.slot)} sx={{
                  display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, py: 0.75,
                  borderRadius: 1, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.06)',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' },
                }}>
                  <Typography sx={{ fontSize: '0.65rem', color: STATUS_COLOR.eaten }}>🥤</Typography>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontSize: '0.78rem', fontWeight: 500 }}>
                      {meal?.name || sd.name || 'Unknown'}
                    </Typography>
                    {meal && (
                      <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.62rem' }}>
                        {meal.protein}g P · {meal.calories} kcal
                      </Typography>
                    )}
                  </Box>
                  <Chip label="eaten" size="small" sx={{ height: 14, fontSize: '0.56rem', bgcolor: STATUS_COLOR.eaten, color: '#fff' }} />
                </Box>
              );
            })}

            {/* Add snack / drink button */}
            <Box onClick={() => setActiveSlot(nextOtherSlot)} sx={{
              display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75,
              borderRadius: 1, cursor: 'pointer', border: '1px dashed rgba(255,255,255,0.1)',
              '&:hover': { borderColor: 'rgba(255,255,255,0.25)', bgcolor: 'rgba(255,255,255,0.03)' },
            }}>
              <Typography sx={{ fontSize: '0.7rem', color: 'text.disabled' }}>+</Typography>
              <Typography variant="body2" color="text.disabled" sx={{ fontSize: '0.72rem' }}>
                Add snack or drink
              </Typography>
            </Box>
          </Stack>
        )}
      </Box>

      <MealPickerDrawer slot={activeSlot} slotData={activeSlotData} meals={mealsData?.meals}
        onSelect={handleSelect} onClose={() => setActiveSlot(null)} />
    </Box>
  );
}

// ─── Week Planner ─────────────────────────────────────────────────────────────
function WeekPlanner() {
  const today = todayStr();
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week's Sunday
  const [selectedDate, setSelectedDate] = useState(null);

  // The "anchor" Sunday — start of the 7-week grid
  const baseSunday = getSundayOfWeek(today);
  // Current page: offset in weeks from baseSunday
  // Show 7 weeks at a time, navigate by 7 weeks
  const gridStart  = addDays(baseSunday, weekOffset * 7);
  const weeks      = Array.from({ length: 7 }, (_, w) => ({
    weekStart: addDays(gridStart, w * 7),
    days: Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d)),
  }));

  // Fetch all 49 days in one query
  const { data: allDays = [] } = useSevenWeeks(gridStart);

  // Build a date → plan map
  const planByDate = {};
  for (const day of allDays) {
    planByDate[day.date] = day;
  }

  const gridStartDate = weeks[0].days[0];
  const gridEndDate   = weeks[6].days[6];

  return (
    <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
      {/* Calendar grid */}
      <Box sx={{ flex: selectedDate ? '0 0 auto' : 1, width: selectedDate ? 480 : '100%', transition: 'width 0.2s' }}>
        {/* Period header + nav */}
        <Stack direction="row" alignItems="center" sx={{ mb: 1.5 }}>
          <IconButton size="small" onClick={() => { setWeekOffset(w => w - 1); setSelectedDate(null); }}>
            <ChevronLeftIcon />
          </IconButton>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', flex: 1, textAlign: 'center', color: 'text.secondary' }}>
            {formatMonthDay(gridStartDate)} – {formatMonthDay(gridEndDate)}
          </Typography>
          <IconButton size="small" onClick={() => { setWeekOffset(w => w + 1); setSelectedDate(null); }}>
            <ChevronRightIcon />
          </IconButton>
          {weekOffset !== 0 && (
            <IconButton size="small" onClick={() => { setWeekOffset(0); setSelectedDate(null); }}>
              <TodayIcon />
            </IconButton>
          )}
        </Stack>

        {/* Day-of-week header */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5, mb: 0.5 }}>
          {DAY_LABELS.map(d => (
            <Typography key={d} variant="caption" sx={{ textAlign: 'center', color: 'text.disabled', fontSize: '0.65rem', fontWeight: 600 }}>
              {d}
            </Typography>
          ))}
        </Box>

        {/* 7-week grid */}
        {weeks.map(({ weekStart, days }) => (
          <Box key={weekStart} sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5, mb: 0.5 }}>
            {days.map(date => {
              const plan      = planByDate[date];
              const slots     = plan?.slots || [];
              const filled    = slots.filter(s => s.meal_id).length;
              const eaten     = slots.filter(s => s.status === 'eaten').length;
              const isToday   = date === today;
              const isSelected = date === selectedDate;
              const isPast    = date < today;
              const { calories=0, protein=0 } = plan?.macroTotals || {};
              const calPct    = Math.min(100, (calories / MACRO_TARGETS.calories) * 100);

              return (
                <Box key={date} onClick={() => setSelectedDate(isSelected ? null : date)} sx={{
                  p: 0.75, borderRadius: 1.5, cursor: 'pointer', minHeight: 64,
                  border: '1px solid',
                  borderColor: isSelected ? 'primary.main' : isToday ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.06)',
                  bgcolor: isSelected ? 'rgba(100,160,255,0.1)' : isToday ? 'rgba(255,255,255,0.04)' : 'transparent',
                  opacity: isPast && !isToday ? 0.65 : 1,
                  '&:hover': { borderColor: 'rgba(255,255,255,0.3)', bgcolor: 'rgba(255,255,255,0.04)' },
                  transition: 'all 0.12s',
                  display: 'flex', flexDirection: 'column', gap: 0.4,
                }}>
                  {/* Date number */}
                  <Typography sx={{
                    fontSize: '0.72rem', fontWeight: isToday ? 700 : 500, lineHeight: 1,
                    color: isToday ? '#fff' : 'text.secondary',
                    ...(isToday && { bgcolor: 'primary.main', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' })
                  }}>
                    {new Date(date + 'T12:00:00').getDate()}
                  </Typography>

                  {/* Meal dots */}
                  {filled > 0 && (
                    <Stack direction="row" spacing={0.25} flexWrap="wrap">
                      {Array.from({ length: Math.min(filled, 5) }).map((_, i) => {
                        const s = slots.filter(s => s.meal_id)[i];
                        const c = s?.status === 'eaten' ? STATUS_COLOR.eaten : STATUS_COLOR.planned;
                        return <Box key={i} sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: c }} />;
                      })}
                    </Stack>
                  )}

                  {/* Calorie bar */}
                  {calories > 0 && (
                    <Box sx={{ height: 2, bgcolor: 'rgba(255,255,255,0.07)', borderRadius: 1, overflow: 'hidden', mt: 'auto' }}>
                      <Box sx={{ height: '100%', width: `${calPct}%`, bgcolor: calPct >= 90 ? '#4caf50' : calPct >= 60 ? '#e6913a' : '#5c8edb', borderRadius: 1 }} />
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        ))}

        {/* Legend */}
        <Stack direction="row" spacing={2} sx={{ mt: 1.5, pl: 0.5 }}>
          {[['planned', STATUS_COLOR.planned], ['eaten', STATUS_COLOR.eaten]].map(([label, color]) => (
            <Stack key={label} direction="row" alignItems="center" spacing={0.5}>
              <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: color }} />
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.62rem' }}>{label}</Typography>
            </Stack>
          ))}
        </Stack>
      </Box>

      {/* Day detail panel */}
      {selectedDate && (
        <>
          <Divider orientation="vertical" flexItem sx={{ bgcolor: 'rgba(255,255,255,0.06)' }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <DayDetail date={selectedDate} onClose={() => setSelectedDate(null)} />
          </Box>
        </>
      )}
    </Box>
  );
}

// ─── Main MealsView ───────────────────────────────────────────────────────────
export default function MealsView() {
  const [tab, setTab] = useState(0);

  return (
    <Box>
      <Stack direction="row" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ flexGrow: 1, fontWeight: 700 }}>Meals</Typography>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}
          sx={{ '& .MuiTab-root': { fontSize: '0.78rem', minHeight: 36, py: 0 } }}>
          <Tab label="Planner" />
          <Tab label="Grocery List" />
        </Tabs>
      </Stack>

      {tab === 0 && <WeekPlanner />}
      {tab === 1 && <GroceryView />}
    </Box>
  );
}
