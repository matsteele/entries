'use client';

import { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Chip,
  Accordion, AccordionSummary, AccordionDetails,
  TextField, Button, Table, TableBody, TableCell,
  TableHead, TableRow, CircularProgress, Divider,
  IconButton, Stack,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';
import AddIcon from '@mui/icons-material/Add';

const STRUCTURE_LABELS = [
  { key: 'warmup',   label: 'Warmup',    duration: '8m',  color: '#4caf50' },
  { key: 'skill',    label: 'Skill',     duration: '6m',  color: '#2196f3' },
  { key: 'wod',      label: 'WoD',       duration: '15m', color: '#e91e63' },
  { key: 'wod2',     label: 'WoD 2',     duration: '15m', color: '#e91e63' },
  { key: 'strength', label: 'Strength',  duration: '12m', color: '#ff5722' },
  { key: 'cashout',  label: 'Cash Out',  duration: '5m',  color: '#9c27b0' },
];

function LogForm({ movementKey, movementName, onLog }) {
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [sets, setSets] = useState('3');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!weight || !reps) return;
    setLoading(true);
    await onLog(movementKey, { weight: Number(weight), reps: Number(reps), sets: Number(sets), notes });
    setWeight('');
    setReps('');
    setNotes('');
    setLoading(false);
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <TextField
          label="Weight (lbs)"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          type="number"
          size="small"
          sx={{ width: 110 }}
          required
        />
        <TextField
          label="Reps"
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          type="number"
          size="small"
          sx={{ width: 80 }}
          required
        />
        <TextField
          label="Sets"
          value={sets}
          onChange={(e) => setSets(e.target.value)}
          type="number"
          size="small"
          sx={{ width: 80 }}
        />
        <TextField
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          size="small"
          sx={{ width: 160 }}
        />
        <Button
          type="submit"
          variant="contained"
          size="small"
          disabled={loading}
          startIcon={<AddIcon />}
          sx={{ bgcolor: '#ff5722', '&:hover': { bgcolor: '#e64a19' } }}
        >
          Log
        </Button>
      </Stack>
    </Box>
  );
}

function MovementCard({ movementKey, movement, onLog, highlight }) {
  const logs = movement.logs || [];
  const lastEntry = logs[logs.length - 1];
  const recentLogs = logs.slice(-5).reverse();

  return (
    <Accordion
      sx={{
        bgcolor: highlight ? 'rgba(255,87,34,0.08)' : 'rgba(255,255,255,0.04)',
        border: highlight ? '1px solid rgba(255,87,34,0.4)' : '1px solid rgba(255,255,255,0.08)',
        borderRadius: '6px !important',
        mb: 1,
        '&:before': { display: 'none' },
      }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', pr: 1 }}>
          <Typography sx={{ fontWeight: 500, flex: 1 }}>{movement.name}</Typography>
          {highlight && <Chip label="Today" size="small" sx={{ bgcolor: '#ff5722', color: '#fff', fontSize: '0.7rem' }} />}
          {lastEntry && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Last: {lastEntry.weight}lbs × {lastEntry.reps} ({lastEntry.date})
            </Typography>
          )}
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        <LogForm movementKey={movementKey} movementName={movement.name} onLog={onLog} />
        {recentLogs.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', mb: 1, display: 'block' }}>
              Recent History
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: 'text.secondary', py: 0.5, fontSize: '0.75rem' }}>Date</TableCell>
                  <TableCell sx={{ color: 'text.secondary', py: 0.5, fontSize: '0.75rem' }}>Weight</TableCell>
                  <TableCell sx={{ color: 'text.secondary', py: 0.5, fontSize: '0.75rem' }}>Reps</TableCell>
                  <TableCell sx={{ color: 'text.secondary', py: 0.5, fontSize: '0.75rem' }}>Sets</TableCell>
                  <TableCell sx={{ color: 'text.secondary', py: 0.5, fontSize: '0.75rem' }}>Notes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {recentLogs.map((log, i) => (
                  <TableRow key={i}>
                    <TableCell sx={{ py: 0.5, fontSize: '0.8rem' }}>{log.date}</TableCell>
                    <TableCell sx={{ py: 0.5, fontSize: '0.8rem' }}>{log.weight} lbs</TableCell>
                    <TableCell sx={{ py: 0.5, fontSize: '0.8rem' }}>{log.reps}</TableCell>
                    <TableCell sx={{ py: 0.5, fontSize: '0.8rem' }}>{log.sets}</TableCell>
                    <TableCell sx={{ py: 0.5, fontSize: '0.8rem', color: 'text.secondary' }}>{log.notes}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

export default function WorkoutView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [emailStatus, setEmailStatus] = useState(null);

  useEffect(() => {
    fetch('/api/workout')
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleEmail = async () => {
    setEmailStatus('sending');
    const res = await fetch('/api/workout/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ program: data.program, movements: data.movements }),
    });
    const result = await res.json();
    setEmailStatus(result.ok ? 'sent' : `error: ${result.error}`);
    setTimeout(() => setEmailStatus(null), 4000);
  };

  const handleLog = async (movementKey, entry) => {
    const res = await fetch('/api/workout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ movement: movementKey, ...entry }),
    });
    const result = await res.json();
    if (result.movement) {
      setData((prev) => ({
        ...prev,
        movements: {
          ...prev.movements,
          [movementKey]: result.movement,
        },
      }));
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!data) {
    return <Typography color="error">Failed to load workout data.</Typography>;
  }

  const { program, movements } = data;
  const todayMovementKeys = new Set(program?.strength || []);

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      {/* Today's Program */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FitnessCenterIcon sx={{ color: '#ff5722' }} />
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              {program.day} — {program.focus} Day
            </Typography>
          </Box>
          <Button
            variant="outlined"
            size="small"
            onClick={handleEmail}
            disabled={emailStatus === 'sending'}
            sx={{ borderColor: '#ff5722', color: '#ff5722', '&:hover': { borderColor: '#ff7043', bgcolor: 'rgba(255,87,34,0.08)' } }}
          >
            {emailStatus === 'sending' ? 'Sending…' : emailStatus === 'sent' ? '✓ Sent!' : emailStatus ? emailStatus : '📧 Email Program'}
          </Button>
        </Box>

        <Grid container spacing={2}>
          {STRUCTURE_LABELS.map(({ key, label, duration, color }) => (
            <Grid item xs={12} sm={6} md={3} key={key}>
              <Card
                sx={{
                  bgcolor: 'rgba(255,255,255,0.04)',
                  border: `1px solid ${color}40`,
                  height: '100%',
                }}
              >
                <CardContent sx={{ pb: '12px !important' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="caption" sx={{ color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                      {label}
                    </Typography>
                    <Chip label={duration} size="small" sx={{ bgcolor: `${color}20`, color, fontSize: '0.7rem', height: 20 }} />
                  </Box>
                  {key === 'strength' ? (
                    <Box>
                      {program.strength.map((mk) => (
                        <Typography key={mk} variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.8 }}>
                          • {movements[mk]?.name || mk}
                        </Typography>
                      ))}
                    </Box>
                  ) : key === 'wod' || key === 'wod2' ? (
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>{program[key]?.name}</Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.78rem' }}>{program[key]?.description}</Typography>
                    </Box>
                  ) : key === 'cashout' ? (
                    <Box>
                      {program.cashout.map((c, i) => (
                        <Typography key={i} variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.8 }}>• {c}</Typography>
                      ))}
                    </Box>
                  ) : (
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      {program[key]}
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>

      <Divider sx={{ my: 3, borderColor: 'rgba(255,255,255,0.1)' }} />

      {/* Lift Tracker */}
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
          Lift Tracker
        </Typography>

        {/* Today's movements first */}
        {program.strength.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="caption" sx={{ color: '#ff5722', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, mb: 1, display: 'block' }}>
              Today's Movements
            </Typography>
            {program.strength.map((mk) =>
              movements[mk] ? (
                <MovementCard
                  key={mk}
                  movementKey={mk}
                  movement={movements[mk]}
                  onLog={handleLog}
                  highlight
                />
              ) : null
            )}
          </Box>
        )}

        {/* All other movements */}
        <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, mb: 1, display: 'block' }}>
          All Movements
        </Typography>
        {Object.entries(movements)
          .filter(([mk]) => !todayMovementKeys.has(mk))
          .map(([mk, movement]) => (
            <MovementCard
              key={mk}
              movementKey={mk}
              movement={movement}
              onLog={handleLog}
              highlight={false}
            />
          ))}
      </Box>
    </Box>
  );
}
