'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Box, Typography, Chip, Tooltip, IconButton, Paper, Stack, Divider,
  ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import FlagIcon from '@mui/icons-material/Flag';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import { zoom as d3Zoom, zoomIdentity } from 'd3-zoom';
import { select as d3Select } from 'd3-selection';
import { scaleLinear } from 'd3-scale';
import { useIntentionMatrix, usePlaceItem } from '../hooks/useApi';

// ─── Config ────────────────────────────────────────────────────────────────

const DIM = {
  career:    { icon: '💼', color: '#FF9800' },
  financial: { icon: '💰', color: '#4CAF50' },
  personal:  { icon: '🧭', color: '#2196F3' },
  health:    { icon: '💪', color: '#E91E63' },
  social:    { icon: '🤝', color: '#9C27B0' },
};

const SCOPES = ['years', 'quarters', 'biweeks'];
const SCOPE_META = {
  years:    { label: 'Years',    items: 'Goals' },
  quarters: { label: 'Quarters', items: 'Projects & Feats' },
  biweeks:  { label: 'Biweeks',  items: 'Epics & Tasks' },
};

const SIDE_W = 360;
const RAIL_H = 56;
const MIN_YEAR = 2018;
const MAX_YEAR = 2040;

function scopeFromK(k) {
  if (k < 6) return 'years';
  if (k < 18) return 'quarters';
  return 'biweeks';
}

// ─── ItemChip ──────────────────────────────────────────────────────────────

function ItemChip({ item, isSelected, onClick, onDoubleClick, size = 'normal' }) {
  const d = DIM[item.dimension] || { icon: '📄', color: '#666' };
  const isLeaf = !item.hasChildren;
  const done = item.status === 'completed';

  return (
    <Tooltip
      title={<>
        <div style={{ fontWeight: 600 }}>{item.title}</div>
        {item.parentTitle && <div style={{ opacity: 0.7, marginTop: 2 }}>← {item.parentTitle}</div>}
        <div style={{ opacity: 0.5, marginTop: 2 }}>{item.type}{item.dimension ? ` · ${item.dimension}` : ''}</div>
      </>}
      placement="top" arrow enterDelay={250}
    >
      <Chip
        label={`${d.icon} ${done ? '☑ ' : ''}${item.title}`}
        size="small"
        variant={isLeaf ? 'outlined' : 'filled'}
        onClick={(e) => { e.stopPropagation(); onClick?.(item); }}
        onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.(item); }}
        sx={{
          maxWidth: size === 'sm' ? 220 : 280,
          height: 'auto',
          '& .MuiChip-label': { whiteSpace: 'normal', lineHeight: 1.3, py: 0.4, fontSize: size === 'sm' ? 10 : 11 },
          bgcolor: isSelected ? 'rgba(144,202,249,0.2)' : isLeaf ? 'transparent' : `${d.color}15`,
          borderColor: isSelected ? '#90CAF9' : `${d.color}40`,
          color: done ? 'text.disabled' : 'text.primary',
          textDecoration: done ? 'line-through' : 'none',
          cursor: 'pointer',
          '&:hover': { bgcolor: 'rgba(255,255,255,0.1)', borderColor: '#90CAF9' },
        }}
      />
    </Tooltip>
  );
}

// ─── Context Bar ───────────────────────────────────────────────────────────

function ContextBar({ context }) {
  if (!context) return null;
  const bits = [];
  if (context.location) bits.push(`📍 ${context.location}`);
  if (context.trips) (Array.isArray(context.trips) ? context.trips : []).forEach(t => bits.push(`✈️ ${typeof t === 'string' ? t : t.destination || ''}`));
  if (context.birthdays?.length) context.birthdays.forEach(b => bits.push(`🎂 ${b}`));
  if (context.cycleNotes) bits.push(`🏋️ ${context.cycleNotes}`);
  if (!bits.length) return null;
  return (
    <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 0.3 }}>
      {bits.map((b, i) => <Typography key={i} sx={{ fontSize: 10, color: 'text.secondary' }}>{b}</Typography>)}
    </Box>
  );
}

// ─── Time Row ──────────────────────────────────────────────────────────────

function TimeRow({ period, onClickItem, onRemoveItem, isTarget, onClickRow }) {
  return (
    <>
    {period.yearLabel && (
      <Box sx={{
        px: 1.5, py: 0.5, bgcolor: 'rgba(255,255,255,0.04)',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
      }}>
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.secondary', letterSpacing: 1 }}>
          {period.yearLabel}
        </Typography>
      </Box>
    )}
    <Box
      onClick={() => onClickRow(period)}
      sx={{
        display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', minHeight: 48,
        cursor: 'pointer',
        bgcolor: isTarget ? 'rgba(144,202,249,0.08)' : period.isCurrent ? 'rgba(76,175,80,0.04)' : 'transparent',
        '&:hover': { bgcolor: isTarget ? 'rgba(144,202,249,0.1)' : 'rgba(255,255,255,0.02)' },
      }}
    >
      <Box sx={{
        width: 110, minWidth: 110, p: 1, borderRight: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
      }}>
        <Typography sx={{
          fontSize: 14, fontWeight: period.isCurrent ? 700 : 500,
          color: period.isCurrent ? '#4CAF50' : 'text.primary', lineHeight: 1.2,
        }}>
          {period.label}
        </Typography>
        {period.sublabel && <Typography sx={{ fontSize: 10, color: 'text.disabled', mt: 0.2 }}>{period.sublabel}</Typography>}
        {isTarget && <Typography sx={{ fontSize: 9, color: '#90CAF9', mt: 0.2 }}>▸ target</Typography>}
      </Box>
      <Box sx={{ flex: 1, p: 1, display: 'flex', flexDirection: 'column', gap: 0.3 }}>
        {period.context && <ContextBar context={period.context} />}
        {period.items.length > 0 ? (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {period.items.map(it => (
              <Box key={it.id} sx={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                <ItemChip item={it} onClick={onClickItem} />
                <Tooltip title="Remove from this period">
                  <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); onRemoveItem?.(it); }}
                    sx={{ width: 18, height: 18, ml: -0.5, opacity: 0, '.MuiBox-root:hover &': { opacity: 0.5 }, '&:hover': { opacity: '1 !important' } }}
                  >
                    <CloseIcon sx={{ fontSize: 12 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            ))}
          </Box>
        ) : (
          <Typography sx={{ fontSize: 11, color: 'rgba(255,255,255,0.12)', py: 0.5 }}>—</Typography>
        )}
      </Box>
    </Box>
    </>
  );
}

// ─── D3 Zoom Rail ──────────────────────────────────────────────────────────

function ZoomRail({ currentYear, onRangeChange, initialStart, initialEnd, itemCounts }) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const callbackRef = useRef(onRangeChange);
  const countsRef = useRef(itemCounts || {});

  useEffect(() => { callbackRef.current = onRangeChange; }, [onRangeChange]);
  useEffect(() => { countsRef.current = itemCounts || {}; }, [itemCounts]);

  useEffect(() => {
    const container = containerRef.current;
    const svgEl = svgRef.current;
    if (!container || !svgEl) return;

    // Clean up previous D3 bindings on re-mount
    const svg = d3Select(svgEl);
    svg.on('.zoom', null);
    svg.selectAll('*').remove();

    const w = container.clientWidth;
    if (w === 0) return;

    svg.attr('width', w).attr('height', RAIL_H);

    const xScale = scaleLinear().domain([MIN_YEAR, MAX_YEAR]).range([0, w]);

    // Background
    svg.append('rect')
      .attr('width', w).attr('height', RAIL_H)
      .attr('fill', 'rgba(255,255,255,0.03)')
      .attr('rx', 6);

    // Two layers: viewport bg behind, ticks on top
    const bgLayer = svg.append('g').attr('class', 'bg-layer');
    const content = svg.append('g').attr('class', 'content');

    // Current year line (static)
    const cxLine = xScale(currentYear);
    svg.append('line')
      .attr('x1', cxLine).attr('x2', cxLine)
      .attr('y1', 0).attr('y2', RAIL_H)
      .attr('stroke', '#4CAF50').attr('stroke-width', 2)
      .style('pointer-events', 'none');

    function render(transform) {
      const newX = transform.rescaleX(xScale);
      // Use floor/ceil to get the tight integer year range visible
      const rawStart = newX.invert(0);
      const rawEnd = newX.invert(w);
      // Visible year range — inclusive of partially visible years
      const visStart = Math.max(MIN_YEAR, Math.floor(rawStart));
      const visEnd = Math.max(visStart, Math.min(MAX_YEAR, Math.floor(rawEnd)));

      bgLayer.selectAll('*').remove();
      content.selectAll('*').remove();

      // Viewport highlight — background layer
      const vpLeft = Math.max(0, newX(visStart));
      const vpRight = Math.min(w, newX(visEnd + 1));
      bgLayer.append('rect')
        .attr('x', vpLeft).attr('y', 1)
        .attr('width', Math.max(0, vpRight - vpLeft)).attr('height', RAIL_H - 2)
        .attr('fill', 'rgba(144,202,249,0.1)')
        .attr('stroke', 'rgba(144,202,249,0.3)')
        .attr('stroke-width', 1)
        .attr('rx', 4)
        .style('pointer-events', 'none');

      // Year ticks, labels, density bars, and sub-year ticks
      const k = transform.k;
      const step = k < 1.5 ? 5 : k < 3 ? 2 : 1;
      const counts = countsRef.current;
      const maxCount = Math.max(1, ...Object.values(counts));

      for (let yr = MIN_YEAR; yr <= MAX_YEAR; yr++) {
        const x = newX(yr);
        const nextYearX = newX(yr + 1);
        // Skip only if the entire year span is off-screen
        if (nextYearX < -10 || x > w + 10) continue;

        const isCurr = yr === currentYear;
        const inView = yr >= visStart && yr <= visEnd;

        // Show tick+label if: matches step cadence, OR is current year, OR is in visible range
        const showLabel = yr % step === 0 || isCurr || inView;
        if (showLabel) {
          // Year tick — full height line
          content.append('line')
            .attr('x1', x).attr('x2', x)
            .attr('y1', 0).attr('y2', RAIL_H)
            .attr('stroke', isCurr ? 'rgba(76,175,80,0.3)' : inView ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)')
            .attr('stroke-width', 1)
            .style('pointer-events', 'none');

          // Year label — top area
          content.append('text')
            .attr('x', x + 3).attr('y', 14)
            .attr('font-size', k > 8 ? 12 : 10)
            .attr('fill', isCurr ? '#4CAF50' : inView ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.15)')
            .attr('font-weight', isCurr ? 700 : 400)
            .style('pointer-events', 'none')
            .text(yr);
        }

        // Density bar — bottom half of rail
        const count = counts[yr] || 0;
        if (count > 0) {
          const barMaxH = RAIL_H * 0.35;
          const barH = Math.max(3, (count / maxCount) * barMaxH);
          const nextX = newX(yr + 1);
          const barW = Math.max(3, Math.min(10, (nextX - x) * 0.25));
          content.append('rect')
            .attr('x', x + 3)
            .attr('y', RAIL_H - barH - 2)
            .attr('width', barW)
            .attr('height', barH)
            .attr('fill', isCurr ? 'rgba(76,175,80,0.5)' : 'rgba(144,202,249,0.4)')
            .attr('rx', 1)
            .style('pointer-events', 'none');
        }

        // Quarter ticks — appear at k >= 3
        if (k >= 3) {
          const qNames = ['Q1', 'Q2', 'Q3', 'Q4'];
          for (let q = 0; q < 4; q++) {
            const qx = newX(yr + q / 4);
            if (qx < -10 || qx > w + 10) continue;
            // Tick line — middle zone
            if (q > 0) {
              content.append('line')
                .attr('x1', qx).attr('x2', qx)
                .attr('y1', 18).attr('y2', RAIL_H)
                .attr('stroke', inView ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)')
                .attr('stroke-width', 1)
                .attr('stroke-dasharray', '2,2')
                .style('pointer-events', 'none');
            }
            // Quarter label
            if (k >= 5) {
              content.append('text')
                .attr('x', qx + 4).attr('y', 28)
                .attr('font-size', k >= 8 ? 10 : 8)
                .attr('fill', inView ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.1)')
                .style('pointer-events', 'none')
                .text(qNames[q]);
            }
          }
        }

        // Biweek ticks — appear at k >= 12
        if (k >= 12) {
          for (let bw = 1; bw <= 26; bw++) {
            const bwx = newX(yr + (bw - 1) / 26);
            if (bwx < 0 || bwx > w) continue;
            // Skip ticks too close to quarter boundaries
            const frac = (bw - 1) / 26;
            const nearQ = [0, 0.25, 0.5, 0.75].some(q => Math.abs(frac - q) < 0.025);
            if (nearQ) continue;

            content.append('line')
              .attr('x1', bwx).attr('x2', bwx)
              .attr('y1', RAIL_H - 8).attr('y2', RAIL_H)
              .attr('stroke', inView ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)')
              .attr('stroke-width', 0.5)
              .style('pointer-events', 'none');

            if (k >= 18) {
              content.append('text')
                .attr('x', bwx).attr('y', RAIL_H - 10)
                .attr('text-anchor', 'middle')
                .attr('font-size', 7)
                .attr('fill', 'rgba(255,255,255,0.2)')
                .style('pointer-events', 'none')
                .text(`w${bw}`);
            }
          }
        }
      }

      // Emit range to React
      callbackRef.current(visStart, visEnd, k);
    }

    const zoomBehavior = d3Zoom()
      .scaleExtent([1, 30])
      .translateExtent([[0, 0], [w, RAIL_H]])
      .extent([[0, 0], [w, RAIL_H]])
      .filter((event) => {
        if (event.type === 'dblclick') return false;
        // Prevent parent scroll from stealing wheel events
        if (event.type === 'wheel') event.preventDefault();
        return true;
      })
      .on('zoom', (event) => render(event.transform));

    svg.call(zoomBehavior);

    // Prevent passive wheel listener issue
    svgEl.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });

    // Set initial zoom to show initialStart - initialEnd
    const x0 = xScale(initialStart);
    const x1 = xScale(initialEnd);
    const k0 = w / (x1 - x0);
    const tx0 = -x0 * k0;
    svg.call(zoomBehavior.transform, zoomIdentity.translate(tx0, 0).scale(k0));

    return () => {
      svg.on('.zoom', null);
      svgEl.removeEventListener('wheel', (e) => e.preventDefault());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Box ref={containerRef} sx={{ mb: 1.5, minHeight: RAIL_H, width: '100%' }}>
      <svg
        ref={svgRef}
        style={{
          display: 'block', cursor: 'grab', borderRadius: 6,
          border: '1px solid rgba(255,255,255,0.08)',
          touchAction: 'none', userSelect: 'none',
          width: '100%',
        }}
      />
    </Box>
  );
}

// ─── Side Palette ──────────────────────────────────────────────────────────

function SidePalette({ palette, targetPeriod, scope, onClickItem, onPlace }) {
  const { unplaced = [], placed = [] } = palette || {};
  const groups = {};
  for (const item of unplaced) {
    const k = item.parentId || '__none';
    if (!groups[k]) groups[k] = { parentTitle: item.parentTitle, items: [] };
    groups[k].items.push(item);
  }
  const scopeLabel = scope === 'years' ? 'year' : scope === 'quarters' ? 'quarter' : 'biweek';

  return (
    <Box sx={{ width: SIDE_W, flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.08)', overflow: 'auto' }}>
      <Box sx={{ p: 2 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 14, mb: 0.3 }}>📥 Place items</Typography>
        <Typography sx={{ fontSize: 11, color: 'text.secondary', mb: 2 }}>
          {targetPeriod ? `Click + to place in ${targetPeriod.label}` : `Click a row to select a target ${scopeLabel}`}
        </Typography>

        {unplaced.length === 0 ? (
          <Typography sx={{ fontSize: 11, color: 'text.disabled', fontStyle: 'italic' }}>All items placed.</Typography>
        ) : (
          Object.entries(groups).map(([key, group]) => (
            <Box key={key} sx={{ mb: 2 }}>
              <Typography sx={{ fontSize: 10, color: 'text.disabled', mb: 0.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {group.parentTitle || 'Unlinked'}
              </Typography>
              <Stack spacing={0.5}>
                {group.items.map(item => (
                  <Box key={item.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ flex: 1 }}><ItemChip item={item} onClick={onClickItem} size="sm" /></Box>
                    {targetPeriod && (
                      <Tooltip title={`Place in ${targetPeriod.label}`}>
                        <IconButton size="small" onClick={() => onPlace(item, targetPeriod)}
                          sx={{ width: 24, height: 24, bgcolor: 'rgba(76,175,80,0.15)', '&:hover': { bgcolor: 'rgba(76,175,80,0.3)' } }}>
                          <AddIcon sx={{ fontSize: 14, color: '#4CAF50' }} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                ))}
              </Stack>
            </Box>
          ))
        )}

        {placed.length > 0 && (
          <>
            <Divider sx={{ my: 1.5, opacity: 0.15 }} />
            <Typography sx={{ fontSize: 10, color: 'text.disabled', fontWeight: 600, textTransform: 'uppercase', mb: 0.5 }}>Placed</Typography>
            {placed.map(item => (
              <Typography key={item.id} sx={{ fontSize: 10, color: 'text.disabled', mb: 0.3 }}>
                ✓ {DIM[item.dimension]?.icon || ''} {item.title} → {item.period}
              </Typography>
            ))}
          </>
        )}
      </Box>
    </Box>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────

export default function IntentionMatrix({ onNavigate }) {
  const currentYear = new Date().getFullYear();

  const [mode, setMode] = useState('auto');
  const [startYear, setStartYear] = useState(currentYear);
  const [endYear, setEndYear] = useState(currentYear + 5);
  const [fixedScope, setFixedScope] = useState('quarters');
  const [zoomK, setZoomK] = useState(1);
  const [targetPeriod, setTargetPeriod] = useState(null);

  // Debounce range updates from D3 zoom
  const timerRef = useRef(null);
  const latestRange = useRef({ s: startYear, e: endYear, k: zoomK });

  const handleRangeChange = useCallback((s, e, k) => {
    latestRange.current = { s, e, k };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const { s, e, k } = latestRange.current;
      setStartYear(s);
      setEndYear(e);
      setZoomK(k);
    }, 150);
  }, []);

  const scope = mode === 'auto' ? scopeFromK(zoomK) : fixedScope;
  const { data, isLoading } = useIntentionMatrix({ scope, startYear, endYear });
  const placeItem = usePlaceItem();

  const periods = data?.periods || [];
  const palette = data?.palette || { unplaced: [], placed: [] };

  const handlePlace = useCallback((item, period) => {
    if (scope === 'years') {
      placeItem.mutate({ table: 'goals', id: item.id, target_year: period.year });
    } else if (scope === 'quarters') {
      placeItem.mutate({ table: 'plans', id: item.id, target_quarter: period.period, target_year: period.year });
    } else if (scope === 'biweeks') {
      placeItem.mutate({ table: 'epics', id: item.id, target_biweek: period.period, target_year: period.year });
    }
  }, [scope, placeItem]);

  const handleRemoveItem = useCallback((item) => {
    if (scope === 'years') {
      placeItem.mutate({ table: 'goals', id: item.id, target_year: null });
    } else if (scope === 'quarters') {
      placeItem.mutate({ table: 'plans', id: item.id, target_quarter: null });
    } else if (scope === 'biweeks') {
      placeItem.mutate({ table: 'epics', id: item.id, target_biweek: null });
    }
  }, [scope, placeItem]);

  const handleRowClick = useCallback((period) => {
    setTargetPeriod(prev => prev?.key === period.key ? null : period);
  }, []);

  const handleItemClick = useCallback((item) => {
    if (!onNavigate) return;
    if (item.type === 'goal') {
      onNavigate('planning', { goalId: item.id });
    } else {
      onNavigate('planning', { goalId: item.parentId || item.id });
    }
  }, [onNavigate]);

  return (
    <Box sx={{ display: 'flex', height: '100%' }}>
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <FlagIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
          <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 18 }}>Intentions</Typography>

          <Tooltip title={mode === 'auto' ? 'Auto: zoom changes scope level' : 'Fixed: scope is locked'}>
            <IconButton size="small" onClick={() => setMode(m => m === 'auto' ? 'fixed' : 'auto')} sx={{ ml: 2 }}>
              {mode === 'auto'
                ? <LockOpenIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                : <LockIcon fontSize="small" sx={{ color: '#90CAF9' }} />}
            </IconButton>
          </Tooltip>

          {mode === 'fixed' && (
            <ToggleButtonGroup size="small" exclusive value={scope}
              onChange={(_, v) => v && setFixedScope(v)} sx={{ ml: 0.5 }}>
              {SCOPES.map(s => (
                <ToggleButton key={s} value={s} sx={{ fontSize: 10, py: 0.2, px: 1.2, textTransform: 'none' }}>
                  {SCOPE_META[s].label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          )}

          <Chip
            label={`${SCOPE_META[scope].label} · ${SCOPE_META[scope].items}`}
            size="small"
            sx={{ ml: 1, height: 22, fontSize: 10, bgcolor: 'rgba(255,255,255,0.06)' }}
          />

          <Typography sx={{ fontSize: 12, color: 'text.secondary', ml: 'auto' }}>
            {startYear} – {endYear}
          </Typography>
        </Box>

        {/* Zoom rail — drag to pan, scroll to zoom */}
        <Typography sx={{ fontSize: 9, color: 'text.disabled', mb: 0.5 }}>
          Scroll to zoom · Drag to pan
        </Typography>
        <ZoomRail
          currentYear={currentYear}
          onRangeChange={handleRangeChange}
          initialStart={currentYear}
          initialEnd={currentYear + 5}
          itemCounts={(() => {
            const counts = {};
            for (const p of periods) {
              const yr = p.year;
              counts[yr] = (counts[yr] || 0) + p.items.length;
            }
            return counts;
          })()}
        />

        {/* Rows */}
        {isLoading ? (
          <Typography sx={{ color: 'text.disabled', mt: 3, textAlign: 'center' }}>Loading...</Typography>
        ) : periods.length === 0 ? (
          <Typography sx={{ color: 'text.disabled', mt: 3, fontStyle: 'italic', textAlign: 'center' }}>
            No data for this range. Zoom in or out to change scope.
          </Typography>
        ) : (
          <Paper elevation={0} sx={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 1.5, overflow: 'hidden' }}>
            {periods.map(p => (
              <TimeRow
                key={p.key}
                period={p}
                onClickItem={handleItemClick}
                onRemoveItem={handleRemoveItem}
                isTarget={targetPeriod?.key === p.key}
                onClickRow={handleRowClick}
              />
            ))}
          </Paper>
        )}
      </Box>

      <SidePalette
        palette={palette}
        targetPeriod={targetPeriod}
        scope={scope}
        onClickItem={handleItemClick}
        onPlace={handlePlace}
      />
    </Box>
  );
}
