export const CONTEXT_CONFIG = {
  personal:     { code: 'per',  emoji: '🏠', color: '#F6BF26', label: 'Personal' },
  social:       { code: 'soc',  emoji: '👥', color: '#8E24AA', label: 'Social' },
  professional: { code: 'prof', emoji: '💼', color: '#616161', label: 'Professional' },
  cultivo:      { code: 'cul',  emoji: '🌱', color: '#0B8043', label: 'Cultivo' },
  projects:     { code: 'proj', emoji: '🚀', color: '#F4511E', label: 'Projects' },
  health:       { code: 'heal', emoji: '💪', color: '#039BE5', label: 'Health' },
  rest:         { code: 'rest',  emoji: '😴', color: '#4A148C', label: 'Rest' },
  learning:     { code: 'learn', emoji: '📚', color: '#00ACC1', label: 'Learning' },
  unstructured: { code: 'us',    emoji: '☀️', color: '#795548', label: 'Unstructured' },
};

export const CONTEXT_ORDER = ['personal', 'health', 'rest', 'cultivo', 'professional', 'social', 'projects', 'learning', 'unstructured'];

export function formatMinutes(mins) {
  if (!mins || mins < 1) return '0m';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
