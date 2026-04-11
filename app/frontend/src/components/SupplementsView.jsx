'use client';

import { useState } from 'react';
import {
  Box, Typography, Paper, Stack, Chip, Checkbox, Tabs, Tab,
  IconButton, Tooltip, Collapse, Divider, Button, TextField,
  Select, MenuItem, FormControl, InputLabel,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const fetchJson = (url) => fetch(url).then(r => r.json());

function useSupplements() {
  return useQuery({ queryKey: ['supplements'], queryFn: () => fetchJson('/api/supplements'), refetchInterval: 30000 });
}

function useSupplementAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => fetch('/api/supplements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplements'] }),
  });
}

// ─── Category Header ─────────────────────────────────────────────────────────
function CategoryHeader({ category, cfg, count }) {
  return (
    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1, mt: 2 }}>
      <Typography sx={{ fontSize: '1.1rem' }}>{cfg.emoji}</Typography>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{cfg.name}</Typography>
      <Chip label={count} size="small" sx={{ height: 20, fontSize: '0.7rem' }} />
      <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>{cfg.description}</Typography>
    </Stack>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function todayStr() { return new Date().toLocaleDateString('en-CA'); }

function getTodayEntries(history, id) {
  const today = todayStr();
  return (history?.[id] || []).filter(ts => ts.startsWith(today));
}

function formatTakenTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// ─── Supplement Row ──────────────────────────────────────────────────────────
function SupplementRow({ supp, history, action, showTaken, showStock, onDelete }) {
  const todayEntries = getTodayEntries(history, supp.id);
  const taken = todayEntries.length > 0;
  const lastTaken = taken ? todayEntries[todayEntries.length - 1] : null;

  return (
    <Paper sx={{ px: 2, py: 1.25, mb: 0.75, opacity: showTaken && taken ? 0.5 : 1, borderLeft: supp.inStock ? '3px solid #4caf50' : '3px solid rgba(255,255,255,0.1)' }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        {showTaken && (
          <Tooltip title={taken ? 'Undo (remove last entry today)' : 'Mark as taken now'}>
            <Checkbox
              size="small"
              checked={taken}
              onChange={() => action.mutate(taken
                ? { action: 'untake', supplementId: supp.id }
                : { action: 'take', supplementId: supp.id }
              )}
              sx={{ p: 0.5 }}
            />
          </Tooltip>
        )}
        {showStock && (
          <Tooltip title={supp.inStock ? 'Mark as out of stock' : 'Mark as in stock'}>
            <Checkbox
              size="small"
              checked={supp.inStock}
              onChange={() => action.mutate({ action: 'toggle-stock', supplementId: supp.id })}
              sx={{ p: 0.5, color: supp.inStock ? '#4caf50' : 'rgba(255,255,255,0.3)', '&.Mui-checked': { color: '#4caf50' } }}
            />
          </Tooltip>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{supp.name}</Typography>
            {!supp.inStock && <Chip label="Need" size="small" color="warning" variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />}
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.4 }}>
            {supp.description}
          </Typography>
          <Typography variant="caption" sx={{ color: '#90caf9', fontFamily: 'monospace', fontSize: '0.7rem' }}>
            {supp.dosage}
          </Typography>
        </Box>
        {showTaken && lastTaken && (
          <Tooltip title={todayEntries.length > 1 ? `Taken ${todayEntries.length}x today` : 'Taken today'}>
            <Typography variant="caption" sx={{ color: '#66bb6a', fontFamily: 'monospace', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
              {formatTakenTime(lastTaken)}{todayEntries.length > 1 ? ` (×${todayEntries.length})` : ''}
            </Typography>
          </Tooltip>
        )}
        {onDelete && (
          <IconButton size="small" color="error" onClick={() => onDelete(supp.id)} sx={{ opacity: 0.5, '&:hover': { opacity: 1 } }}>
            <DeleteIcon sx={{ fontSize: 16 }} />
          </IconButton>
        )}
      </Stack>
    </Paper>
  );
}

// ─── Protocol Checklist View ─────────────────────────────────────────────────
function ProtocolView({ data, action, protocolId }) {
  const { supplements, protocols, categories, history } = data;
  const [openCats, setOpenCats] = useState({});
  const toggle = (cat) => setOpenCats(prev => ({ ...prev, [cat]: !prev[cat] }));

  const protocol = protocols[protocolId];
  const protocolSupps = supplements.filter(s => s.protocols?.includes(protocolId));

  const grouped = {};
  for (const s of protocolSupps) {
    if (!grouped[s.category]) grouped[s.category] = [];
    grouped[s.category].push(s);
  }

  const totalCount = protocolSupps.length;
  const takenCount = protocolSupps.filter(s => getTodayEntries(history, s.id).length > 0).length;
  const needCount = protocolSupps.filter(s => !s.inStock).length;
  const notTakenIds = protocolSupps.filter(s => getTodayEntries(history, s.id).length === 0).map(s => s.id);

  const CAT_ORDER = ['builders', 'hormonal', 'blood-flow', 'raw-materials', 'management', 'bulking', 'cutting', 'post-cycle', 'side-effects', 'daily', 'pre-workout', 'recovery', 'longevity', 'gear'];

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
        <Typography variant="h6">{protocol?.name || protocolId}</Typography>
        <Chip label={`${takenCount}/${totalCount} taken`} size="small"
          color={takenCount === totalCount ? 'success' : 'default'}
          sx={{ fontFamily: 'monospace' }} />
        {needCount > 0 && (
          <Chip icon={<ShoppingCartIcon sx={{ fontSize: 14 }} />} label={`${needCount} needed`} size="small" color="warning" variant="outlined" />
        )}
        <Box sx={{ flex: 1 }} />
        {notTakenIds.length > 0 && (
          <Button
            size="small"
            variant="contained"
            color="success"
            onClick={() => action.mutate({ action: 'take-all', supplementIds: notTakenIds })}
            disabled={action.isPending}
          >
            Take All ({notTakenIds.length})
          </Button>
        )}
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {protocol?.description}
      </Typography>

      {CAT_ORDER.map(cat => {
        const catSupps = grouped[cat];
        if (!catSupps?.length) return null;
        const cfg = categories[cat] || { name: cat, emoji: '💊', description: '' };
        const isOpen = openCats[cat] !== false;
        return (
          <Box key={cat}>
            <Stack direction="row" alignItems="center" sx={{ cursor: 'pointer' }} onClick={() => toggle(cat)}>
              <CategoryHeader category={cat} cfg={cfg} count={catSupps.length} />
              <IconButton size="small">{isOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}</IconButton>
            </Stack>
            <Collapse in={isOpen}>
              {catSupps.map(s => (
                <SupplementRow key={s.id} supp={s} history={history} action={action} showTaken showStock={false} />
              ))}
            </Collapse>
          </Box>
        );
      })}

      {/* Shopping list */}
      {needCount > 0 && (
        <Box sx={{ mt: 3 }}>
          <Divider sx={{ mb: 2 }} />
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
            <ShoppingCartIcon sx={{ fontSize: 20, color: '#ffa726' }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Need to Buy</Typography>
          </Stack>
          {protocolSupps.filter(s => !s.inStock).map(s => {
            const cfg = categories[s.category] || {};
            return (
              <Paper key={s.id} sx={{ px: 2, py: 1, mb: 0.5, borderLeft: '3px solid #ffa726' }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>{cfg.emoji} {s.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{s.dosage}</Typography>
                  <Tooltip title="Mark as purchased">
                    <Checkbox
                      size="small"
                      checked={false}
                      onChange={() => action.mutate({ action: 'toggle-stock', supplementId: s.id })}
                      sx={{ p: 0.5 }}
                    />
                  </Tooltip>
                </Stack>
              </Paper>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

// ─── Full Inventory View ─────────────────────────────────────────────────────
function InventoryView({ data, action }) {
  const { supplements, categories } = data;
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: '', category: 'management', description: '', dosage: '', protocols: '' });

  const grouped = {};
  for (const s of supplements) {
    if (!grouped[s.category]) grouped[s.category] = [];
    grouped[s.category].push(s);
  }

  const CAT_ORDER = ['builders', 'hormonal', 'blood-flow', 'raw-materials', 'management', 'bulking', 'cutting', 'post-cycle', 'side-effects', 'daily', 'pre-workout', 'recovery', 'longevity', 'gear'];
  const inStockCount = supplements.filter(s => s.inStock).length;

  const handleAdd = () => {
    if (!form.name.trim()) return;
    action.mutate({
      action: 'add-supplement',
      ...form,
      protocols: form.protocols ? form.protocols.split(',').map(p => p.trim()) : [],
    }, { onSuccess: () => { setForm({ name: '', category: 'management', description: '', dosage: '', protocols: '' }); setAddOpen(false); } });
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
        <Typography variant="h6">Supplement Inventory</Typography>
        <Chip label={`${inStockCount}/${supplements.length} in stock`} size="small" sx={{ fontFamily: 'monospace' }} />
        <Box sx={{ flex: 1 }} />
        <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setAddOpen(!addOpen)}>
          Add
        </Button>
      </Stack>

      {addOpen && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Stack spacing={1.5}>
            <TextField size="small" label="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} fullWidth />
            <Stack direction="row" spacing={1}>
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel>Category</InputLabel>
                <Select value={form.category} label="Category" onChange={e => setForm({ ...form, category: e.target.value })}>
                  {Object.entries(categories).map(([key, cfg]) => (
                    <MenuItem key={key} value={key}>{cfg.emoji} {cfg.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField size="small" label="Dosage" value={form.dosage} onChange={e => setForm({ ...form, dosage: e.target.value })} sx={{ flex: 1 }} />
            </Stack>
            <TextField size="small" label="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} fullWidth multiline rows={2} />
            <TextField size="small" label="Protocols (comma-separated)" value={form.protocols} onChange={e => setForm({ ...form, protocols: e.target.value })} fullWidth placeholder="joint-recovery" />
            <Button size="small" variant="contained" onClick={handleAdd} disabled={!form.name.trim()}>Save</Button>
          </Stack>
        </Paper>
      )}

      {CAT_ORDER.map(cat => {
        const catSupps = grouped[cat];
        if (!catSupps?.length) return null;
        const cfg = categories[cat] || { name: cat, emoji: '💊', description: '' };
        return (
          <Box key={cat}>
            <CategoryHeader category={cat} cfg={cfg} count={catSupps.length} />
            {catSupps.map(s => (
              <SupplementRow
                key={s.id} supp={s} history={data.history} action={action}
                showTaken={false} showStock
                onDelete={(id) => action.mutate({ action: 'delete-supplement', supplementId: id })}
              />
            ))}
          </Box>
        );
      })}
    </Box>
  );
}

// ─── Main View ───────────────────────────────────────────────────────────────
export default function SupplementsView() {
  const { data, isLoading } = useSupplements();
  const action = useSupplementAction();
  const [tab, setTab] = useState(0); // 0 = inventory, 1 = protocol
  const [selectedProtocol, setSelectedProtocol] = useState('');

  if (isLoading || !data) return <Typography color="text.secondary">Loading supplements...</Typography>;
  if (data.error) return <Typography color="error">{data.error}</Typography>;

  const protocolKeys = Object.keys(data.protocols || {});
  if (!selectedProtocol && protocolKeys.length) {
    // lazy init without setState in render
  }
  const activeProtocol = selectedProtocol || protocolKeys[0] || '';

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ '& .MuiTab-root': { fontSize: '0.8rem', minHeight: 40 } }}>
          <Tab label="Inventory" />
          <Tab label="Protocol" />
        </Tabs>
        {tab === 1 && (
          <FormControl size="small" sx={{ minWidth: 200, ml: 2 }}>
            <Select
              value={activeProtocol}
              onChange={(e) => setSelectedProtocol(e.target.value)}
              displayEmpty
              sx={{ fontSize: '0.8rem', height: 36 }}
            >
              {protocolKeys.map(k => (
                <MenuItem key={k} value={k}>{data.protocols[k].name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </Stack>

      {tab === 0 && <InventoryView data={data} action={action} />}
      {tab === 1 && activeProtocol && <ProtocolView data={data} action={action} protocolId={activeProtocol} />}
    </Box>
  );
}
