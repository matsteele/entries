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
  const url = date ? `/api/focus/today?date=${date}` : '/api/focus/today';
  return useQuery({
    queryKey: ['focus', date || 'today'],
    queryFn: () => fetchJson(url),
    refetchInterval: date ? false : 15000,
  });
}

export function useFocusToday() { return useFocusDay(null); }

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
    mutationFn: ({ date, slot, mealId, plannedTime }) =>
      fetch(`/api/meal-plans/${date}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot, mealId, plannedTime }),
      }).then(r => { if (!r.ok) return r.json().then(e => Promise.reject(new Error(e.error || r.statusText))); return r.json(); }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['meal-plan', vars.date] }),
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
