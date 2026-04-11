'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Breadcrumbs, Link, Chip, IconButton, Slider,
  Divider, TextField, Button, Select, MenuItem, FormControl,
  InputLabel, LinearProgress, Tooltip, Paper,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import * as d3Hierarchy from 'd3-hierarchy';
import { CONTEXT_CONFIG } from '../lib/contexts';
import {
  useGoalsTreemap, useProjectNarrative, useUpdateGoal, useUpdateProject,
  useUpdateEpic, useUpdateAction, useCreateEpic, useCreateAction, useTaskAction,
  useWeeklyGoalProgress,
} from '../hooks/useApi';

// ─── Constants ──────────────────────────────────────────────────────────────

const SIDE_PANEL_WIDTH = 380;

const STATUS_COLORS = {
  active: '#4CAF50',
  incubating: '#FF9800',
  dormant: '#9E9E9E',
  completed: '#2196F3',
  open: '#4CAF50',
  dropped: '#F44336',
};

const HORIZON_LABELS = { now: 'NOW', soon: 'SOON', someday: 'SOMEDAY' };
const HORIZON_COLORS = { now: '#4CAF50', soon: '#FF9800', someday: '#9E9E9E' };

// ─── Treemap Layout ─────────────────────────────────────────────────────────

function computeTreemap(data, width, height) {
  if (!data || !data.children || data.children.length === 0) return [];

  // Flatten to single level: strip children so each item is a leaf for d3
  const flatData = {
    name: 'root',
    children: data.children.map(c => ({
      ...c,
      children: undefined,  // make each node a leaf for layout purposes
    })),
  };

  const root = d3Hierarchy.hierarchy(flatData)
    .sum(d => d.weight || 1)
    .sort((a, b) => (b.value || 0) - (a.value || 0));

  d3Hierarchy.treemap()
    .size([width, height])
    .padding(4)
    .paddingInner(6)
    .round(true)(root);

  // Re-attach original data (with children) to leaves for rendering + drill-down
  const origMap = {};
  for (const c of data.children) origMap[c.id] = c;
  const leaves = root.leaves();
  for (const leaf of leaves) {
    const orig = origMap[leaf.data.id];
    if (orig) leaf.data = orig;
  }

  return leaves;
}

// ─── Weekly capacity: 3 focused hours/day × 5 focus × 7 days ────────────────
const WEEKLY_CAPACITY = 3 * 60 * 5 * 7; // 6300 focused-minutes max (theoretical)
const REALISTIC_WEEKLY_CAPACITY = 1050; // ~2.5h/day at avg focus 3, 7 days

const fmtFocusMin = (m) => {
  if (!m) return '0';
  const h = Math.floor(m / 60);
  const mins = m % 60;
  if (h === 0) return `${mins}fm`;
  if (mins === 0) return `${h}fh`;
  return `${h}fh ${mins}fm`;
};

// ─── Allocation Bar — stacked bar showing all goal allocations ──────────────

function AllocationBar({ weeklyData, onGoalClick }) {
  if (!weeklyData?.goals) return null;

  const goals = weeklyData.goals.filter(g => g.weekly_target_minutes > 0);
  const totalAllocated = weeklyData.totalAllocated || 0;
  const capacity = REALISTIC_WEEKLY_CAPACITY;
  const unallocated = Math.max(0, capacity - totalAllocated);

  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: 10, flex: 1 }}>
          Weekly Allocation (focused minutes = time × focus level)
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: 10, fontFamily: 'monospace' }}>
          {fmtFocusMin(totalAllocated)} / {fmtFocusMin(capacity)} focused mins allocated
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', height: 20, borderRadius: 1, overflow: 'hidden', bgcolor: 'rgba(255,255,255,0.06)' }}>
        {goals.map(g => {
          const cfg = CONTEXT_CONFIG[g.context] || {};
          const pct = (g.weekly_target_minutes / capacity) * 100;
          return (
            <Tooltip key={g.id} title={`${cfg.emoji || '🎯'} ${g.title}: ${fmtFocusMin(g.weekly_target_minutes)}`}>
              <Box
                onClick={() => onGoalClick?.(g.id)}
                sx={{
                  width: `${pct}%`,
                  bgcolor: cfg.color || '#666',
                  opacity: 0.7,
                  cursor: 'pointer',
                  transition: 'opacity 0.15s',
                  '&:hover': { opacity: 1 },
                  borderRight: '1px solid rgba(0,0,0,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                {pct > 8 && (
                  <Typography sx={{ fontSize: 9, color: '#fff', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {cfg.emoji}
                  </Typography>
                )}
              </Box>
            </Tooltip>
          );
        })}
        {unallocated > 0 && (
          <Tooltip title={`Unallocated: ${fmtFocusMin(unallocated)}`}>
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {unallocated / capacity > 0.1 && (
                <Typography sx={{ fontSize: 9, color: 'text.disabled' }}>
                  {fmtFocusMin(unallocated)} free
                </Typography>
              )}
            </Box>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
}

// ─── Weekly Target Slider ───────────────────────────────────────────────────

function WeeklyTargetSlider({ value, currentId, weeklyData, onChange }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);

  const capacity = REALISTIC_WEEKLY_CAPACITY;
  const otherAllocated = weeklyData?.goals
    ? weeklyData.goals.reduce((sum, g) => sum + (g.id === currentId ? 0 : (g.weekly_target_minutes || 0)), 0)
    : 0;
  const remaining = Math.max(0, capacity - otherAllocated);

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        Weekly target (focused mins = time × focus level)
      </Typography>
      <Slider
        value={local}
        min={0}
        max={remaining}
        step={15}
        onChange={(_, val) => setLocal(val)}
        onChangeCommitted={(_, val) => onChange(val)}
        size="small"
        valueLabelDisplay="auto"
        valueLabelFormat={fmtFocusMin}
        sx={{ mt: 0.5 }}
      />
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography variant="caption" sx={{ fontSize: 10, color: 'text.disabled' }}>
          {fmtFocusMin(local)}
        </Typography>
        <Typography variant="caption" sx={{ fontSize: 10, color: 'text.disabled' }}>
          {fmtFocusMin(otherAllocated)} allocated elsewhere · {fmtFocusMin(remaining - local)} remaining
        </Typography>
      </Box>
    </Box>
  );
}

// ─── Treemap Cell ───────────────────────────────────────────────────────────

function TreemapCell({ node, onClick, onSelect, isSelected, addedToday }) {
  const d = node.data;
  const w = node.x1 - node.x0;
  const h = node.y1 - node.y0;

  if (w < 20 || h < 20) return null;

  const ctx = CONTEXT_CONFIG[d.context] || {};
  const statusColor = STATUS_COLORS[d.status] || '#666';
  const isDormant = d.status === 'dormant';
  const isCompleted = d.status === 'completed';
  const isAddedToday = addedToday?.has(d.id);
  const opacity = isDormant ? 0.4 : isCompleted ? 0.5 : 1;

  // Progress
  const progress = d.action_count > 0
    ? Math.round((d.completed_action_count / d.action_count) * 100)
    : null;

  // Horizon chip
  const horizon = d.horizon;

  return (
    <Box
      onClick={(e) => { e.stopPropagation(); onClick(d); }}
      sx={{
        position: 'absolute',
        left: node.x0,
        top: node.y0,
        width: w,
        height: h,
        bgcolor: isAddedToday ? 'rgba(76,175,80,0.15)' : isCompleted ? 'rgba(100,221,180,0.08)' : isSelected ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
        border: `2px solid ${isAddedToday ? '#4CAF50' : isCompleted ? '#64DDB4' : isSelected ? '#90CAF9' : isDormant ? '#555' : (ctx.color || '#666')}`,
        borderStyle: isDormant ? 'dashed' : 'solid',
        borderRadius: 1,
        p: 1,
        overflow: 'hidden',
        cursor: 'pointer',
        opacity,
        transition: 'all 0.2s',
        '&:hover': {
          bgcolor: 'rgba(255,255,255,0.1)',
          borderColor: '#90CAF9',
        },
      }}
    >
      {/* Title row */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, mb: 0.5 }}>
        {ctx.emoji && <span style={{ fontSize: 14, flexShrink: 0 }}>{ctx.emoji}</span>}
        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            fontSize: w < 120 ? 11 : 13,
            lineHeight: 1.3,
            overflow: 'hidden',
            wordBreak: 'break-word',
          }}
        >
          {d.name}
        </Typography>
      </Box>

      {/* Meta row — only if enough space */}
      {h > 55 && w > 100 && (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 0.5 }}>
          {horizon && (
            <Chip
              label={HORIZON_LABELS[horizon] || horizon}
              size="small"
              sx={{
                height: 18, fontSize: 10, fontWeight: 700,
                bgcolor: HORIZON_COLORS[horizon] || '#666',
                color: '#fff',
              }}
            />
          )}
          <Chip
            label={d.status}
            size="small"
            sx={{
              height: 18, fontSize: 10,
              bgcolor: statusColor, color: '#fff', opacity: 0.8,
            }}
          />
        </Box>
      )}

      {/* Progress bar */}
      {progress !== null && h > 40 && w > 80 && (
        <Box sx={{ mt: 'auto' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
            <Typography variant="caption" sx={{ fontSize: 10, color: 'text.secondary' }}>
              {d.completed_action_count}/{d.action_count} actions
            </Typography>
            <Typography variant="caption" sx={{ fontSize: 10, color: 'text.secondary' }}>
              {progress}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{ height: 4, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.1)' }}
          />
        </Box>
      )}

      {/* Project/epic counts for goals */}
      {d.type === 'goal' && h > 50 && (
        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10, mt: 0.5, display: 'block' }}>
          {d.active_project_count} active / {d.project_count} projects
        </Typography>
      )}

      {/* Next action */}
      {d.next_action && h > 75 && w > 140 && (
        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10, mt: 0.5, display: 'block', fontStyle: 'italic' }}>
          Next: {d.next_action}
        </Typography>
      )}
    </Box>
  );
}

// ─── Side Panel ─────────────────────────────────────────────────────────────

function SidePanel({ node, onClose, onDrillDown, navStack, addedToday, setAddedToday }) {
  const d = node;
  const isProject = d.type === 'project';
  const isGoal = d.type === 'goal';
  const isEpic = d.type === 'epic';
  const isAction = d.type === 'action';

  const queryClient = useQueryClient();
  const { data: narrative } = useProjectNarrative(isProject ? d.id : null);
  const { data: weeklyData } = useWeeklyGoalProgress();
  const updateGoal = useUpdateGoal();
  const updateProject = useUpdateProject();
  const updateEpic = useUpdateEpic();
  const updateAction = useUpdateAction();
  const createEpic = useCreateEpic();
  const createAction = useCreateAction();
  const taskAction = useTaskAction();

  const [newEpicTitle, setNewEpicTitle] = useState('');
  const [newActionTitle, setNewActionTitle] = useState('');
  const [newActionMinutes, setNewActionMinutes] = useState('');
  const [localWeight, setLocalWeight] = useState(d.weight || 5);

  // Sync local weight when selected node changes
  useEffect(() => {
    setLocalWeight(d.weight || 5);
  }, [d.id, d.weight]);

  const handleWeightCommit = (_, val) => {
    if (isGoal) updateGoal.mutate({ id: d.id, weight: val });
    else if (isProject) updateProject.mutate({ id: d.id, weight: val });
    else if (isEpic) updateEpic.mutate({ id: d.id, weight: val });
    else if (isAction) updateAction.mutate({ id: d.id, weight: val });
  };

  const handleStatusChange = (e) => {
    if (isGoal) updateGoal.mutate({ id: d.id, status: e.target.value });
    else if (isProject) updateProject.mutate({ id: d.id, status: e.target.value });
    else if (isEpic) updateEpic.mutate({ id: d.id, status: e.target.value });
    else if (isAction) updateAction.mutate({ id: d.id, status: e.target.value });
  };

  const handleHorizonChange = (e) => {
    if (isProject) updateProject.mutate({ id: d.id, horizon: e.target.value });
  };

  const handleContextChange = (e) => {
    const val = e.target.value || null;
    if (isGoal) updateGoal.mutate({ id: d.id, context: val });
    else if (isProject) updateProject.mutate({ id: d.id, context: val });
    else if (isEpic) updateEpic.mutate({ id: d.id, context: val });
  };

  const handleAddEpic = () => {
    if (!newEpicTitle.trim()) return;
    createEpic.mutate({ title: newEpicTitle.trim(), project_id: d.id });
    setNewEpicTitle('');
  };

  const handleAddAction = (epicId) => {
    if (!newActionTitle.trim()) return;
    createAction.mutate({
      title: newActionTitle.trim(),
      epic_id: epicId || null,
      project_id: isProject ? d.id : d.project_id,
      goal_id: d.goal_id || (isGoal ? d.id : null),
      estimated_minutes: newActionMinutes ? parseInt(newActionMinutes) : null,
    });
    setNewActionTitle('');
    setNewActionMinutes('');
  };

  // Derive goal/project/epic context from navStack for lineage
  const goalNav = navStack?.find(n => n.data?.type === 'goal');
  const projectNav = navStack?.find(n => n.data?.type === 'project');
  const epicNav = navStack?.find(n => n.data?.type === 'epic');

  const handlePushToday = (action) => {
    // Resolve context with inheritance: action → epic → project → goal → 'projects'
    const resolvedContext = action.context
      || epicNav?.data?.context
      || d.context
      || projectNav?.data?.context
      || goalNav?.data?.context
      || 'projects';
    // Map full context name to short code for the CLI
    const CTX_TO_CODE = {
      personal: 'per', social: 'soc', professional: 'prof', cultivo: 'cul',
      projects: 'proj', health: 'heal', learning: 'learn', unstructured: 'us',
    };
    taskAction.mutate({
      action: 'add-from-plan',
      title: action.name || action.title,
      context: CTX_TO_CODE[resolvedContext] || resolvedContext,
      actionId: action.id,
      epicId: epicNav?.data?.id || action.epic_id || null,
      projectId: projectNav?.data?.id || d.project_id || d.id,
      goalId: goalNav?.data?.id || d.goal_id || null,
      goalTitle: goalNav?.data?.name || '',
      projectTitle: projectNav?.data?.name || d.name || '',
      epicTitle: epicNav?.data?.name || '',
      estimatedMinutes: action.estimated_minutes,
      context: projectNav?.data?.context || d.context,
    }, {
      onSuccess: () => setAddedToday(prev => new Set(prev).add(action.id)),
    });
  };

  const ctx = CONTEXT_CONFIG[d.context] || {};
  const statusOptions = isGoal
    ? ['active', 'dormant']
    : isEpic
      ? ['open', 'active', 'completed', 'dropped']
      : isAction
        ? ['pending', 'ready', 'in_progress', 'completed', 'dropped']
        : ['active', 'incubating', 'dormant', 'completed'];

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          {ctx.emoji && <span style={{ fontSize: 20 }}>{ctx.emoji}</span>}
          <Typography variant="h6" sx={{ fontSize: 16, fontWeight: 700 }}>
            {d.name}
          </Typography>
        </Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
          ID: {d.id}
        </Typography>
        {d.journal_id && (
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontFamily: 'monospace' }}>
            Journal: {d.journal_id}
          </Typography>
        )}
      </Box>

      <Divider sx={{ mb: 2 }} />

      {/* Controls */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 100 }}>
          <InputLabel>Status</InputLabel>
          <Select value={d.status || 'active'} label="Status" onChange={handleStatusChange}>
            {statusOptions.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </Select>
        </FormControl>
        {isProject && (
          <FormControl size="small" sx={{ minWidth: 100 }}>
            <InputLabel>Horizon</InputLabel>
            <Select value={d.horizon || 'someday'} label="Horizon" onChange={handleHorizonChange}>
              {['now', 'soon', 'someday'].map(h => <MenuItem key={h} value={h}>{h}</MenuItem>)}
            </Select>
          </FormControl>
        )}
        {(isGoal || isProject || isEpic) && (
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Context</InputLabel>
            <Select value={d.context || ''} label="Context" onChange={handleContextChange}>
              <MenuItem value=""><em>inherit</em></MenuItem>
              {Object.entries(CONTEXT_CONFIG).filter(([k]) => k !== 'rest').map(([key, cfg]) => (
                <MenuItem key={key} value={key}>{cfg.emoji} {cfg.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </Box>

      {/* Weight slider — all levels */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          Weight: {localWeight}
        </Typography>
        <Slider
          value={localWeight}
          min={1} max={10} step={1}
          onChange={(_, val) => setLocalWeight(val)}
          onChangeCommitted={handleWeightCommit}
          size="small"
          valueLabelDisplay="auto"
          sx={{ mt: 0.5 }}
        />
      </Box>

      {/* Weekly time target — goals and projects */}
      {(isGoal || isProject) && (
        <WeeklyTargetSlider
          value={d.weekly_target_minutes || 0}
          currentId={d.id}
          weeklyData={weeklyData}
          onChange={(val) => {
            if (isGoal) updateGoal.mutate({ id: d.id, weekly_target_minutes: val });
            else updateProject.mutate({ id: d.id, weekly_target_minutes: val });
          }}
        />
      )}

      <Divider sx={{ mb: 2 }} />

      {/* Narrative (projects only) */}
      {isProject && narrative?.content && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Plan Narrative</Typography>
          <Paper
            variant="outlined"
            sx={{
              p: 1.5, maxHeight: 300, overflow: 'auto',
              bgcolor: 'rgba(255,255,255,0.03)',
              fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap',
            }}
          >
            {narrative.content}
          </Paper>
        </Box>
      )}

      {/* Add epic (projects) */}
      {isProject && (
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <TextField
              size="small" placeholder="New epic..." fullWidth
              value={newEpicTitle} onChange={e => setNewEpicTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddEpic()}
              sx={{ '& input': { fontSize: 13 } }}
            />
            <IconButton size="small" onClick={handleAddEpic} disabled={!newEpicTitle.trim()}>
              <AddIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>
      )}

      {/* Add action (epics) */}
      {isEpic && (
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <TextField
              size="small" placeholder="New action..." fullWidth
              value={newActionTitle} onChange={e => setNewActionTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddAction(d.id)}
              sx={{ '& input': { fontSize: 13 } }}
            />
            <TextField
              size="small" placeholder="min" type="number"
              value={newActionMinutes} onChange={e => setNewActionMinutes(e.target.value)}
              sx={{ width: 70, '& input': { fontSize: 13 } }}
            />
            <IconButton size="small" onClick={() => handleAddAction(d.id)} disabled={!newActionTitle.trim()}>
              <AddIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>
      )}

      {/* Action/Epic detail — push to daily tasks */}
      {(isAction || isEpic) && (
        <Box sx={{ mb: 2 }}>
          {d.estimated_minutes && (
            <Typography variant="body2" sx={{ mb: 1, color: 'text.secondary' }}>
              Estimated: {d.estimated_minutes} min
            </Typography>
          )}
          <Chip
            label={d.status}
            size="small"
            sx={{ mb: 2, bgcolor: STATUS_COLORS[d.status] || '#666', color: '#fff' }}
          />
          {d.status !== 'completed' && (
            addedToday.has(d.id) ? (
              <Button
                variant="contained"
                size="small"
                fullWidth
                startIcon={<CheckCircleIcon />}
                disabled
                sx={{ mb: 1, bgcolor: '#4CAF50 !important', color: '#fff !important', '&.Mui-disabled': { bgcolor: '#4CAF50 !important', color: '#fff !important' } }}
              >
                Added to Today
              </Button>
            ) : (
              <Button
                variant="contained"
                size="small"
                fullWidth
                startIcon={<PlayArrowIcon />}
                onClick={() => handlePushToday(d)}
                sx={{ mb: 1 }}
              >
                Add to Today
              </Button>
            )
          )}

          {/* Lineage breadcrumb */}
          {(goalNav || projectNav || epicNav) && (
            <Box sx={{ mt: 1, p: 1, bgcolor: 'rgba(255,255,255,0.04)', borderRadius: 1 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
                Lineage
              </Typography>
              <Typography variant="caption" sx={{ fontSize: 11 }}>
                {[goalNav?.data?.name, projectNav?.data?.name, epicNav?.data?.name].filter(Boolean).join(' → ')}
              </Typography>
            </Box>
          )}
        </Box>
      )}

      {/* Delete */}
      {(isAction || isEpic || isProject) && (
        <Button
          size="small"
          color="error"
          variant="outlined"
          startIcon={<DeleteOutlineIcon />}
          fullWidth
          onClick={async () => {
            const type = isAction ? 'actions' : isEpic ? 'epics' : 'projects';
            const label = isAction ? 'action' : isEpic ? 'epic' : 'project';
            if (!window.confirm(`Delete this ${label}?`)) return;
            await fetch(`/api/${type}/${d.id}`, { method: 'DELETE' });
            queryClient.invalidateQueries({ queryKey: ['goals'] });
            onClose();
          }}
          sx={{ mb: 2, opacity: 0.6, '&:hover': { opacity: 1 } }}
        >
          Delete
        </Button>
      )}

      {/* Description */}
      {d.description && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Description</Typography>
          <Typography variant="body2" sx={{ fontSize: 12, color: 'text.secondary', whiteSpace: 'pre-wrap' }}>
            {d.description}
          </Typography>
        </Box>
      )}

      {/* Drill-down button */}
    </Box>
  );
}

// ─── Main PlanningView ──────────────────────────────────────────────────────

export default function PlanningView({ initialGoalId } = {}) {
  const { data: treemapData, isLoading } = useGoalsTreemap();
  const { data: weeklyData } = useWeeklyGoalProgress();

  // Navigation state: stack of drill-down levels
  // Each entry: { data, label }
  const [navStack, setNavStack] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 500 });
  const [addedToday, setAddedToday] = useState(new Set());
  const containerRef = useRef(null);

  // Helper: find a node by id in the treemap tree
  const findNodeInTree = useCallback((tree, id) => {
    if (!tree) return null;
    if (tree.id === id) return tree;
    for (const child of (tree.children || [])) {
      const found = findNodeInTree(child, id);
      if (found) return found;
    }
    return null;
  }, []);

  // Keep selectedNode and navStack in sync with fresh treemap data after mutations
  useEffect(() => {
    if (!treemapData) return;

    // Sync selectedNode
    if (selectedNode) {
      const fresh = findNodeInTree(treemapData, selectedNode.id);
      if (fresh) setSelectedNode(fresh);
    }

    // Sync navStack — replace each entry's data with fresh version from tree
    if (navStack.length > 0) {
      setNavStack(prev => {
        const updated = prev.map(entry => {
          const fresh = findNodeInTree(treemapData, entry.data.id);
          return fresh ? { data: fresh, label: fresh.name } : entry;
        });
        // Only update if something actually changed
        const changed = updated.some((u, i) => u.data !== prev[i].data);
        return changed ? updated : prev;
      });
    }
  }, [treemapData, findNodeInTree]); // eslint-disable-line react-hooks/exhaustive-deps

  // Navigate to initial goal if provided via URL param
  useEffect(() => {
    if (!initialGoalId || !treemapData) return;
    const goal = findNodeInTree(treemapData, initialGoalId);
    if (goal) {
      setNavStack([{ data: goal, label: goal.name }]);
      setSelectedNode(goal);
    }
  }, [initialGoalId, treemapData, findNodeInTree]);

  // Measure container with ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      setContainerSize({
        width: Math.max(400, width),
        height: Math.max(300, height),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Current view data (either root treemap or drilled-down node)
  const currentData = useMemo(() => {
    if (!treemapData) return null;
    if (navStack.length === 0) {
      // Top level: goals. Build a virtual root with goals as children.
      // Each goal's treemap weight = goal.weight
      return {
        name: 'root',
        children: (treemapData.children || [])
          .filter(g => g.status !== 'dormant' || g.children?.some(p => p.status === 'active'))
          .map(g => ({
            ...g,
            // For treemap sizing, use goal weight
            weight: g.weight || 5,
          })),
      };
    }
    // Drilled into a node: show its children
    const current = navStack[navStack.length - 1].data;
    return {
      name: current.name,
      children: (current.children || []).map(c => ({
        ...c,
        weight: c.weight || 3,
      })),
    };
  }, [treemapData, navStack]);

  // Compute layout
  const leaves = useMemo(() => {
    if (!currentData || !currentData.children || currentData.children.length === 0) return [];
    return computeTreemap(currentData, containerSize.width, containerSize.height);
  }, [currentData, containerSize]);

  const handleCellClick = (node) => {
    // Always select for side panel
    setSelectedNode(node);
    // If it has children, also drill down
    if (node.children && node.children.length > 0) {
      setNavStack(prev => [...prev, { data: node, label: node.name }]);
    }
  };

  const handleBreadcrumbClick = (index) => {
    if (index === 0) {
      // Going back to root
      setNavStack([]);
      setSelectedNode(null);
    } else {
      // Going back to a specific level — select that level's node for the panel
      const targetNav = navStack[index - 1];
      setNavStack(prev => prev.slice(0, index));
      setSelectedNode(targetNav?.data || null);
    }
  };

  const handleDrillUp = () => {
    const newStack = navStack.slice(0, -1);
    setNavStack(newStack);
    // Select the parent node (now the deepest in the stack)
    setSelectedNode(newStack.length > 0 ? newStack[newStack.length - 1].data : null);
  };

  // Dormant items (collapsed region at top level)
  const dormantGoals = useMemo(() => {
    if (!treemapData || navStack.length > 0) return [];
    return (treemapData.children || []).filter(g =>
      g.status === 'dormant' && !g.children?.some(p => p.status === 'active')
    );
  }, [treemapData, navStack]);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Typography color="text.secondary">Loading goals...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Main treemap area */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Breadcrumb navigation */}
        <Box sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1, minHeight: 40 }}>
          {navStack.length > 0 && (
            <IconButton size="small" onClick={handleDrillUp}>
              <ArrowBackIcon fontSize="small" />
            </IconButton>
          )}
          <Breadcrumbs sx={{ fontSize: 13 }}>
            <Link
              component="button"
              underline="hover"
              color={navStack.length === 0 ? 'text.primary' : 'inherit'}
              onClick={() => handleBreadcrumbClick(0)}
              sx={{ fontSize: 13, fontWeight: navStack.length === 0 ? 700 : 400 }}
            >
              Goals
            </Link>
            {navStack.map((nav, i) => (
              <Link
                key={i}
                component="button"
                underline="hover"
                color={i === navStack.length - 1 ? 'text.primary' : 'inherit'}
                onClick={() => handleBreadcrumbClick(i + 1)}
                sx={{ fontSize: 13, fontWeight: i === navStack.length - 1 ? 700 : 400 }}
              >
                {nav.label}
              </Link>
            ))}
          </Breadcrumbs>
        </Box>

        {/* Allocation bar — weekly commitment overview */}
        {navStack.length === 0 && (
          <Box sx={{ mx: 2, mb: 1 }}>
            <AllocationBar weeklyData={weeklyData} onGoalClick={(goalId) => {
              const goal = findNodeInTree(treemapData, goalId);
              if (goal) {
                setNavStack([{ data: goal, label: goal.name }]);
                setSelectedNode(goal);
              }
            }} />
          </Box>
        )}

        {/* Treemap — height scales with item count, capped */}
        <Box
          ref={containerRef}
          sx={{
            position: 'relative', mx: 2, mb: 1, overflow: 'hidden',
            height: Math.min(600, Math.max(300, (currentData?.children?.length || 3) * 100)),
          }}
        >
          {leaves.map(leaf => (
            <TreemapCell
              key={leaf.data.id}
              node={leaf}
              onClick={handleCellClick}
              onSelect={handleCellClick}
              isSelected={selectedNode?.id === leaf.data.id}
              addedToday={addedToday}
            />
          ))}
          {leaves.length === 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <Typography color="text.secondary" variant="body2">
                {navStack.length > 0 ? 'No items at this level yet. Add epics or actions from the side panel.' : 'No active goals.'}
              </Typography>
            </Box>
          )}
        </Box>

        {/* Dormant region — below treemap */}
        {dormantGoals.length > 0 && (
          <Box sx={{ px: 2, py: 1.5, mt: 1, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', mr: 1 }}>
              Dormant:
            </Typography>
            {dormantGoals.map(g => (
              <Chip
                key={g.id}
                label={g.name}
                size="small"
                variant="outlined"
                onClick={() => handleCellClick(g)}
                sx={{ mr: 0.5, mb: 0.5, fontSize: 11, opacity: 0.6, borderStyle: 'dashed' }}
              />
            ))}
          </Box>
        )}
      </Box>

      {/* Side panel — always visible */}
      <Box sx={{
        width: SIDE_PANEL_WIDTH,
        flexShrink: 0,
        borderLeft: '1px solid rgba(255,255,255,0.08)',
        overflow: 'auto',
        p: 2,
        pt: 1,
      }}>
        {selectedNode ? (
          <SidePanel
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
            onDrillDown={handleCellClick}
            navStack={navStack}
            addedToday={addedToday}
            setAddedToday={setAddedToday}
          />
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.4 }}>
            <Typography variant="body2" color="text.secondary">
              Click a goal to explore
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
