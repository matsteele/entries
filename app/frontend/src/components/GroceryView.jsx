'use client';

import { useState, useMemo } from 'react';
import {
  Box, Typography, Paper, Stack, Chip, Button, ToggleButtonGroup, ToggleButton,
  Checkbox, FormControlLabel, Divider, LinearProgress, IconButton, Tooltip, TextField,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import EmailIcon from '@mui/icons-material/Email';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useQuery } from '@tanstack/react-query';
import { useMeals } from '../hooks/useApi';

function todayStr() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
}

function getWeekStart() {
  const today = new Date();
  const day = today.getDay(); // 0 = Sunday
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - day);
  return [sunday.getFullYear(), String(sunday.getMonth()+1).padStart(2,'0'), String(sunday.getDate()).padStart(2,'0')].join('-');
}

function useWeekMealPlans(weekStart) {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return useQuery({
    queryKey: ['grocery-week', weekStart],
    queryFn: async () => {
      const results = await Promise.all(
        dates.map(date =>
          fetch(`/api/meal-plans/${date}`).then(r => r.json()).catch(() => ({ date, slots: [] }))
        )
      );
      return results.map((r, i) => ({ ...r, date: dates[i] }));
    },
    staleTime: 60000,
  });
}

export default function GroceryView() {
  const [mode, setMode] = useState('week'); // 'week' | 'all'
  const [weekStart, setWeekStart] = useState(getWeekStart());
  const [selected, setSelected] = useState(new Set());
  const [copiedMsg, setCopiedMsg] = useState('');

  const { data: weekData, isLoading: weekLoading } = useWeekMealPlans(weekStart);
  const { data: allMealsData } = useMeals();

  // Build ingredient lists
  const weekIngredients = useMemo(() => {
    if (!weekData) return new Map();
    const map = new Map();
    for (const dayPlan of weekData) {
      for (const slot of (dayPlan.slots || [])) {
        if (!slot.meal_id || !slot.ingredients) continue;
        for (const ing of slot.ingredients) {
          map.set(ing, (map.get(ing) || 0) + 1);
        }
      }
    }
    return map;
  }, [weekData]);

  const allIngredients = useMemo(() => {
    if (!allMealsData?.meals) return new Map();
    const map = new Map();
    for (const meal of allMealsData.meals) {
      for (const ing of (meal.ingredients || [])) {
        if (!map.has(ing)) map.set(ing, 0);
        map.set(ing, map.get(ing) + 1);
      }
    }
    return map;
  }, [allMealsData]);

  const activeIngredients = mode === 'week' ? weekIngredients : allIngredients;
  const sortedIngredients = [...activeIngredients.entries()].sort(([a], [b]) => a.localeCompare(b));

  const toggleItem = (ing) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(ing)) next.delete(ing); else next.add(ing);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(sortedIngredients.map(([ing]) => ing)));
  const clearAll  = () => setSelected(new Set());

  const selectedList = sortedIngredients.filter(([ing]) => selected.has(ing)).map(([ing, count]) => ({ ing, count }));
  const viewList = selected.size > 0
    ? selectedList   // show filtered selection if any items selected
    : sortedIngredients.map(([ing, count]) => ({ ing, count }));

  const listText = viewList.map(({ ing, count }) => count > 1 ? `- ${ing} ×${count}` : `- ${ing}`).join('\n');

  const copyToClipboard = () => {
    const header = mode === 'week'
      ? `Grocery list (week of ${weekStart})\n`
      : `All meal ingredients\n`;
    navigator.clipboard.writeText(header + listText);
    setCopiedMsg('Copied!');
    setTimeout(() => setCopiedMsg(''), 2000);
  };

  const emailList = () => {
    const subject = encodeURIComponent(mode === 'week' ? `Grocery list – week of ${weekStart}` : 'Grocery list – all meals');
    const body = encodeURIComponent(listText);
    window.open(`mailto:?subject=${subject}&body=${body}`);
  };

  const prevWeek = () => setWeekStart(addDays(weekStart, -7));
  const nextWeek = () => setWeekStart(addDays(weekStart, 7));

  if (weekLoading && mode === 'week') return <LinearProgress />;

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>Grocery List</Typography>
        <ToggleButtonGroup size="small" value={mode} exclusive onChange={(_, v) => v && setMode(v)}>
          <ToggleButton value="week">Week Plan</ToggleButton>
          <ToggleButton value="all">All Meals</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {mode === 'week' && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
            <IconButton size="small" onClick={prevWeek}>◀</IconButton>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', flex: 1, textAlign: 'center' }}>
              {weekStart} → {addDays(weekStart, 6)}
            </Typography>
            <IconButton size="small" onClick={nextWeek}>▶</IconButton>
          </Stack>
          {/* Weekly meal grid */}
          {weekData?.map(dayPlan => {
            const dayMeals = dayPlan.slots?.filter(s => s.meal_id) || [];
            if (!dayMeals.length) return null;
            const d = new Date(dayPlan.date + 'T12:00:00');
            const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            return (
              <Box key={dayPlan.date} sx={{ mb: 1.5 }}>
                <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.62rem' }}>
                  {dayLabel}
                </Typography>
                <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 0.5 }}>
                  {dayMeals.map((s, i) => (
                    <Chip key={i} label={s.name} size="small"
                      sx={{ fontSize: '0.68rem', height: 20,
                        bgcolor: s.status === 'eaten' ? 'rgba(230,145,56,0.3)' : s.status === 'eating' ? 'rgba(76,175,80,0.3)' : 'rgba(255,255,255,0.08)' }}
                    />
                  ))}
                </Stack>
              </Box>
            );
          })}
          {weekIngredients.size === 0 && (
            <Typography variant="body2" color="text.disabled" sx={{ py: 2, textAlign: 'center' }}>
              No meals planned this week.
            </Typography>
          )}
        </Paper>
      )}

      {/* Ingredient list */}
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" alignItems="center" sx={{ mb: 1.5 }}>
          <Typography variant="subtitle2" sx={{ flexGrow: 1, fontWeight: 600 }}>
            Ingredients
            {selected.size > 0 && <Chip label={`${selected.size} selected`} size="small" color="primary" sx={{ ml: 1, height: 18, fontSize: '0.6rem' }} />}
          </Typography>
          <Stack direction="row" spacing={0.5}>
            <Button size="small" sx={{ fontSize: '0.65rem', p: '2px 6px' }} onClick={selectAll}>All</Button>
            <Button size="small" sx={{ fontSize: '0.65rem', p: '2px 6px' }} onClick={clearAll}>None</Button>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
            <Tooltip title={copiedMsg || 'Copy list'}>
              <IconButton size="small" onClick={copyToClipboard}>
                <ContentCopyIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Email list">
              <IconButton size="small" onClick={emailList}>
                <EmailIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>

        {sortedIngredients.length === 0 ? (
          <Typography variant="body2" color="text.disabled" sx={{ py: 2, textAlign: 'center' }}>
            {mode === 'week' ? 'No ingredients from this week\'s plan.' : 'No meals in library yet.'}
          </Typography>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 0.25 }}>
            {sortedIngredients.map(([ing, count]) => {
              const isSelected = selected.has(ing);
              return (
                <Box key={ing}
                  onClick={() => toggleItem(ing)}
                  sx={{
                    display: 'flex', alignItems: 'center', px: 1, py: 0.5, borderRadius: 1, cursor: 'pointer',
                    bgcolor: isSelected ? 'rgba(100,160,255,0.12)' : 'transparent',
                    border: '1px solid', borderColor: isSelected ? 'rgba(100,160,255,0.3)' : 'transparent',
                    '&:hover': { bgcolor: isSelected ? 'rgba(100,160,255,0.18)' : 'rgba(255,255,255,0.04)' },
                  }}
                >
                  {isSelected
                    ? <CheckCircleIcon sx={{ fontSize: 14, color: 'primary.main', mr: 0.75, flexShrink: 0 }} />
                    : <RadioButtonUncheckedIcon sx={{ fontSize: 14, color: 'text.disabled', mr: 0.75, flexShrink: 0 }} />
                  }
                  <Typography variant="body2" sx={{ fontSize: '0.78rem', flexGrow: 1 }}>{ing}</Typography>
                  {count > 1 && <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem' }}>×{count}</Typography>}
                </Box>
              );
            })}
          </Box>
        )}

        {/* Selected-only view */}
        {selected.size > 0 && (
          <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.62rem', display: 'block', mb: 0.75 }}>
              SELECTED ({selected.size})
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={0.5}>
              {selectedList.map(({ ing, count }) => (
                <Chip key={ing} label={count > 1 ? `${ing} ×${count}` : ing} size="small"
                  onDelete={() => toggleItem(ing)}
                  sx={{ height: 22, fontSize: '0.68rem', bgcolor: 'rgba(100,160,255,0.15)', color: '#90caf9' }}
                />
              ))}
            </Stack>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
