'use client';

import { useState, useEffect, useRef } from 'react';
import { Box, Typography, Paper } from '@mui/material';

const METRICS = [
  { key: 'focused',  label: 'Focused',  sublabel: 'concentration',  color: '#42a5f5' },
  { key: 'stressed', label: 'Stressed', sublabel: 'cortisol',        color: '#ef5350' },
  { key: 'energy',   label: 'Energy',   sublabel: 'sleep quality',   color: '#66bb6a' },
];

const SVG_W = 1000;
const SVG_H = 70;
const PAD_Y = 12;
const TRACK_H = SVG_H - PAD_Y * 2; // 46px usable

function hourToX(h)  { return (h / 24) * SVG_W; }
function xToHour(x)  { return Math.max(0, Math.min(23, Math.round((x / SVG_W) * 24))); }
function valueToY(v) { return PAD_Y + ((5 - v) / 4) * TRACK_H; }
function yToValue(y) {
  const raw = 5 - ((y - PAD_Y) / TRACK_H) * 4;
  return Math.max(1, Math.min(5, Math.round(raw)));
}

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// When no past data exists, seed a reasonable default curve
const SEED_DEFAULTS = {
  focused:  { 0:1, 3:1, 5:3, 7:3, 9:5, 11:4, 13:3, 15:4, 17:3, 19:2, 21:2, 23:1 },
  stressed: { 0:1, 5:2, 9:3, 11:2, 13:3, 15:2, 17:2, 19:2, 21:1, 23:1 },
  energy:   { 0:3, 3:2, 5:4, 7:4, 9:4, 11:3, 13:2, 15:3, 17:3, 19:2, 21:2, 23:3 },
};

function buildFullDefaults(serverDefaults) {
  const result = {};
  for (const metric of ['focused', 'stressed', 'energy']) {
    const src = serverDefaults?.[metric] || {};
    result[metric] = Object.keys(src).length > 0
      ? Object.fromEntries(Object.entries(src).map(([h, v]) => [parseInt(h), v]))
      : { ...SEED_DEFAULTS[metric] };
  }
  return result;
}

function sortedPairs(pts) {
  return Object.entries(pts)
    .map(([h, v]) => [parseInt(h), v])
    .sort((a, b) => a[0] - b[0]);
}

function buildPolyline(pts) {
  return sortedPairs(pts)
    .map(([h, v]) => `${hourToX(h)},${valueToY(v)}`)
    .join(' ');
}

function buildAreaPath(pts) {
  const pairs = sortedPairs(pts);
  if (!pairs.length) return '';
  const coords = pairs.map(([h, v]) => [hourToX(h), valueToY(v)]);
  const line = coords.map(([x, y]) => `${x},${y}`).join(' L ');
  const [fx] = coords[0];
  const [lx] = coords[coords.length - 1];
  return `M ${coords[0][0]},${coords[0][1]} L ${line} L ${lx},${SVG_H} L ${fx},${SVG_H} Z`;
}

const HOUR_TICKS = Array.from({ length: 25 }, (_, h) => h);
const VALUE_GRID = [1, 2, 3, 4, 5];
const TIME_LABELS = [0, 3, 6, 9, 12, 15, 18, 21, 24].map(h => ({
  h,
  x: (h / 24) * 100,
  label: h === 0 || h === 24 ? '12am' : h === 12 ? '12pm' : h < 12 ? `${h}am` : `${h - 12}pm`,
}));

function MetricTrack({ metricKey, label, sublabel, color, points, defaultPts, onChange }) {
  const svgRef = useRef(null);

  function getSvgCoords(e) {
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * SVG_W,
      y: ((e.clientY - rect.top) / rect.height) * SVG_H,
    };
  }

  function applyEvent(e) {
    const { x, y } = getSvgCoords(e);
    onChange(xToHour(x), yToValue(y));
  }

  function handlePointerDown(e) {
    e.currentTarget.setPointerCapture(e.pointerId);
    applyEvent(e);
  }

  function handlePointerMove(e) {
    if (!e.buttons) return;
    applyEvent(e);
  }

  const polyline = buildPolyline(points);
  const areaPath = buildAreaPath(points);
  const defaultPolyline = defaultPts ? buildPolyline(defaultPts) : '';

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.75 }}>
      {/* Label */}
      <Box sx={{ width: 72, flexShrink: 0 }}>
        <Typography variant="caption"
          sx={{ color, fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 600, display: 'block', lineHeight: 1.2 }}>
          {label}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.6rem' }}>
          {sublabel}
        </Typography>
      </Box>

      {/* SVG track */}
      <Box sx={{ flex: 1, cursor: 'crosshair', userSelect: 'none' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          style={{ width: '100%', height: 58, display: 'block', overflow: 'visible' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
        >
          {/* Track background */}
          <rect x={0} y={0} width={SVG_W} height={SVG_H} fill="rgba(255,255,255,0.02)" rx={3} />

          {/* Hour tick lines */}
          {HOUR_TICKS.map(h => (
            <line key={h} x1={hourToX(h)} y1={PAD_Y} x2={hourToX(h)} y2={SVG_H - PAD_Y}
              stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
          ))}

          {/* Value grid lines */}
          {VALUE_GRID.map(v => (
            <line key={v} x1={0} y1={valueToY(v)} x2={SVG_W} y2={valueToY(v)}
              stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
          ))}

          {/* Default/average line (dashed, dimmed) */}
          {defaultPolyline && (
            <polyline points={defaultPolyline} fill="none"
              stroke={color} strokeWidth={1.5} strokeDasharray="5 7" opacity={0.22} />
          )}

          {/* Area fill */}
          {areaPath && (
            <path d={areaPath} fill={color} opacity={0.07} />
          )}

          {/* Main line */}
          {polyline && (
            <polyline points={polyline} fill="none" stroke={color} strokeWidth={2.5} opacity={0.88} />
          )}

          {/* Dots at set points */}
          {sortedPairs(points).map(([h, v]) => (
            <circle key={h} cx={hourToX(h)} cy={valueToY(v)} r={4.5}
              fill={color} opacity={0.9} stroke="rgba(18,18,18,0.6)" strokeWidth={1.5} />
          ))}
        </svg>
      </Box>

      {/* Y-axis value labels */}
      <Box sx={{ width: 14, flexShrink: 0, position: 'relative', height: 58 }}>
        {[5, 3, 1].map(v => (
          <Typography key={v} variant="caption" sx={{
            position: 'absolute', right: 0,
            top: `${(valueToY(v) / SVG_H) * 100}%`,
            transform: 'translateY(-50%)',
            color: 'text.disabled', fontSize: '0.55rem', fontFamily: 'monospace',
          }}>
            {v}
          </Typography>
        ))}
      </Box>
    </Box>
  );
}

export default function StateTracker() {
  const today = getTodayStr();
  const [points, setPoints] = useState(null);
  const [defaults, setDefaults] = useState(null);
  const saveTimer = useRef(null);

  useEffect(() => {
    fetch(`/api/states/${today}`)
      .then(r => r.json())
      .then(({ data, defaults: defs }) => {
        const fullDefaults = buildFullDefaults(defs);
        setDefaults(fullDefaults);
        setPoints(data || fullDefaults);
      })
      .catch(() => {
        setPoints({ focused: { ...SEED_DEFAULTS.focused }, stressed: { ...SEED_DEFAULTS.stressed }, energy: { ...SEED_DEFAULTS.energy } });
        setDefaults(null);
      });
  }, [today]);

  function handleChange(metricKey, hour, value) {
    setPoints(prev => {
      const next = { ...prev, [metricKey]: { ...prev[metricKey], [hour]: value } };
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        fetch(`/api/states/${today}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        });
      }, 400);
      return next;
    });
  }

  if (!points) return null;

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 2, color: 'text.secondary' }}>
        State Tracking
      </Typography>

      {METRICS.map(m => (
        <MetricTrack
          key={m.key}
          metricKey={m.key}
          label={m.label}
          sublabel={m.sublabel}
          color={m.color}
          points={points[m.key] || {}}
          defaultPts={defaults?.[m.key]}
          onChange={(hour, value) => handleChange(m.key, hour, value)}
        />
      ))}

      {/* Time axis */}
      <Box sx={{ display: 'flex', ml: '84px', mr: '28px' }}>
        <Box sx={{ flex: 1, position: 'relative', height: 16, mt: 0.25 }}>
          {TIME_LABELS.map(({ h, x, label }) => (
            <Typography key={h} variant="caption" sx={{
              position: 'absolute', left: `${x}%`,
              transform: 'translateX(-50%)',
              color: 'text.disabled', fontSize: '0.6rem', fontFamily: 'monospace',
              whiteSpace: 'nowrap',
            }}>
              {label}
            </Typography>
          ))}
        </Box>
      </Box>
    </Paper>
  );
}
