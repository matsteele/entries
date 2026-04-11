import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const fetchJson = (url) => fetch(url).then((r) => r.json());

export function useAllTasks() {
  return useQuery({ queryKey: ['tasks', 'all'], queryFn: () => fetchJson('/api/tasks/all'), refetchInterval: 5000 });
}

export function useTimeSums() {
  return useQuery({ queryKey: ['time', 'sums'], queryFn: () => fetchJson('/api/time/sums'), refetchInterval: 10000 });
}

export function useTodayStats() {
  return useQuery({ queryKey: ['stats', 'today'], queryFn: () => fetchJson('/api/stats/today'), refetchInterval: 10000 });
}

export function useTodaySessions() {
  return useQuery({ queryKey: ['time', 'sessions', 'today'], queryFn: () => fetchJson('/api/time/sessions/today'), refetchInterval: 15000 });
}

export function useGoogleTasks() {
  return useQuery({ queryKey: ['feeds', 'google-tasks'], queryFn: () => fetchJson('/api/feeds/google-tasks'), refetchInterval: 60000 });
}

export function useJiraTickets() {
  return useQuery({ queryKey: ['feeds', 'jira'], queryFn: () => fetchJson('/api/feeds/jira'), refetchInterval: 60000 });
}

/** date: YYYY-MM-DD or null/undefined for today (live) */
export function useFocusDay(date) {
  const tz = typeof window !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : '';
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (tz) params.set('tz', tz);
  const url = `/api/focus/today?${params}`;
  return useQuery({
    queryKey: ['focus', date || 'today'],
    queryFn: () => fetchJson(url),
    refetchInterval: date ? false : 15000,
  });
}

export function useFocusToday() { return useFocusDay(null); }

export function useSleepData(date) {
  return useQuery({
    queryKey: ['sleep', date],
    queryFn: () => fetchJson(`/api/sleep?date=${date}&days=8`),
    enabled: !!date,
    staleTime: 60000,
  });
}

export function useSleepHistory(days = 30) {
  return useQuery({
    queryKey: ['sleep', 'history', days],
    queryFn: () => fetchJson(`/api/sleep?date=${new Date().toISOString().slice(0, 10)}&days=${days}`),
    staleTime: 60000,
  });
}

export function useSaveSleepQuality() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ date, quality, notes }) =>
      fetch('/api/sleep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, quality, notes }),
      }).then(r => { if (!r.ok) return r.json().then(e => Promise.reject(new Error(e.error || r.statusText))); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sleep'] });
    },
  });
}

export function useCalendarEvents(date) {
  return useQuery({
    queryKey: ['calendar', date],
    queryFn: () => fetchJson(`/api/calendar?date=${date}`),
    enabled: !!date,
    refetchInterval: 60000,
  });
}

export function useTimeBudget() {
  return useQuery({ queryKey: ['time', 'budget'], queryFn: () => fetchJson('/api/time/budget'), refetchInterval: 10000 });
}

export function useTimeHistory(period, n = 7) {
  return useQuery({
    queryKey: ['time', 'history', period, n],
    queryFn: () => fetchJson(`/api/time/history?period=${period}&n=${n}`),
    refetchInterval: 60000,
  });
}

export function useConfig() {
  return useQuery({ queryKey: ['config'], queryFn: () => fetchJson('/api/config'), staleTime: 30000 });
}

export function useUpdateConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }) =>
      fetch('/api/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value }) })
        .then(r => { if (!r.ok) return r.json().then(e => Promise.reject(new Error(e.error || r.statusText))); return r.json(); }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config'] }),
  });
}

export function useMeals() {
  return useQuery({ queryKey: ['meals'], queryFn: () => fetchJson('/api/meals'), staleTime: 300000 });
}

export function useGroceryList(date) {
  return useQuery({
    queryKey: ['grocery', date],
    queryFn: () => fetchJson(`/api/meals/grocery?date=${date}`),
    enabled: !!date,
    staleTime: 60000,
  });
}

export function useMealPlan(date) {
  return useQuery({
    queryKey: ['meal-plan', date],
    queryFn: () => fetchJson(`/api/meal-plans/${date}`),
    enabled: !!date,
    refetchInterval: 30000,
  });
}

export function useSetMealSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ date, slot, mealId, plannedTime, status, eatenAt, notes }) =>
      fetch(`/api/meal-plans/${date}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot, mealId, plannedTime, status, eatenAt, notes }),
      }).then(r => { if (!r.ok) return r.json().then(e => Promise.reject(new Error(e.error || r.statusText))); return r.json(); }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['meal-plan', vars.date] }),
  });
}

// ─── Email ──────────────────────────────────────────────────────────────────

export function useEmails() {
  return useQuery({
    queryKey: ['email'],
    queryFn: () => fetchJson('/api/email'),
    refetchInterval: 3600000, // 1 hour
    staleTime: 300000, // 5 min
  });
}

export function useEmailAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, ids }) =>
      fetch('/api/email/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids }),
      }).then(r => r.json().then(d => { if (!r.ok) throw new Error(d.error || r.statusText); return d; })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email'] });
    },
  });
}

export function useTaskAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) =>
      fetch('/api/tasks/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(r => r.json().then(d => { if (!r.ok) throw new Error(d.error || r.statusText); return d; })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['time'] });
      qc.invalidateQueries({ queryKey: ['focus'] });
    },
  });
}

export function useReassignSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fromTaskId, toTaskId, sessionStartedAt }) =>
      fetch('/api/tasks/reassign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromTaskId, toTaskId, sessionStartedAt }),
      }).then(r => r.json().then(d => { if (!r.ok) throw new Error(d.error || r.statusText); return d; })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['time'] });
      qc.invalidateQueries({ queryKey: ['focus'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

export function useUpdateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) =>
      fetch('/api/sessions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(r => { if (!r.ok) return r.json().then(e => Promise.reject(new Error(e.error || r.statusText))); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['focus'] });
      qc.invalidateQueries({ queryKey: ['time'] });
    },
  });
}

// ─── Goals / Planning ──────────────────────────────────────────────────────

export function useGoalsTreemap() {
  return useQuery({
    queryKey: ['goals', 'treemap'],
    queryFn: () => fetchJson('/api/goals/treemap'),
    staleTime: 30000,
  });
}

export function useWeeklyGoalProgress() {
  return useQuery({
    queryKey: ['goals', 'weekly-progress'],
    queryFn: () => fetchJson('/api/goals/weekly-progress'),
    refetchInterval: 30000,
  });
}

export function useProjectNarrative(projectId) {
  return useQuery({
    queryKey: ['projects', projectId, 'narrative'],
    queryFn: () => fetchJson(`/api/projects/${projectId}/narrative`),
    enabled: !!projectId,
    staleTime: 60000,
  });
}

export function useUpdateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...updates }) =>
      fetch(`/api/goals/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) })
        .then(r => r.json().then(d => { if (!r.ok) throw new Error(d.error || r.statusText); return d; })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...updates }) =>
      fetch(`/api/projects/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) })
        .then(r => r.json().then(d => { if (!r.ok) throw new Error(d.error || r.statusText); return d; })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  });
}

export function useCreateEpic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) =>
      fetch('/api/epics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(r => r.json().then(d => { if (!r.ok) throw new Error(d.error || r.statusText); return d; })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  });
}

export function useUpdateEpic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...updates }) =>
      fetch(`/api/epics/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) })
        .then(r => r.json().then(d => { if (!r.ok) throw new Error(d.error || r.statusText); return d; })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  });
}

export function useCreateAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) =>
      fetch('/api/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(r => r.json().then(d => { if (!r.ok) throw new Error(d.error || r.statusText); return d; })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  });
}

export function useUpdateAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...updates }) =>
      fetch(`/api/actions/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) })
        .then(r => r.json().then(d => { if (!r.ok) throw new Error(d.error || r.statusText); return d; })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  });
}
