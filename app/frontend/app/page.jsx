'use client';

import { useState } from 'react';
import {
  Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText,
  IconButton, Toolbar, AppBar, Typography, Divider,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChecklistIcon from '@mui/icons-material/Checklist';
import BarChartIcon from '@mui/icons-material/BarChart';
import RssFeedIcon from '@mui/icons-material/RssFeed';
import BoltIcon from '@mui/icons-material/Bolt';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';
import TasksView from '../src/components/TasksView';
import TimeView from '../src/components/TimeView';
import FeedsView from '../src/components/FeedsView';
import FocusTimeline from '../src/components/FocusTimeline';
import WorkoutView from '../src/components/WorkoutView';
import BudgetPanel from '../src/components/BudgetPanel';

const DRAWER_WIDTH = 240;
const DRAWER_COLLAPSED = 56;

const VIEWS = [
  { key: 'tasks', label: 'Tasks', icon: <ChecklistIcon /> },
  { key: 'feeds', label: 'Feeds', icon: <RssFeedIcon /> },
  { key: 'time', label: 'Time', icon: <BarChartIcon /> },
  { key: 'focus', label: 'Focus', icon: <BoltIcon /> },
  { key: 'workout', label: 'Workout', icon: <FitnessCenterIcon /> },
  { key: 'budget', label: 'Budget', icon: <AccountBalanceWalletIcon /> },
];

export default function Home() {
  const [open, setOpen] = useState(true);
  const [view, setView] = useState('tasks');

  const drawerWidth = open ? DRAWER_WIDTH : DRAWER_COLLAPSED;

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar variant="dense">
          <IconButton color="inherit" edge="start" onClick={() => setOpen(!open)} sx={{ mr: 1 }}>
            {open ? <ChevronLeftIcon /> : <MenuIcon />}
          </IconButton>
          <Typography variant="h6" noWrap>
            Entries Dashboard
          </Typography>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          transition: 'width 0.2s',
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            transition: 'width 0.2s',
            overflowX: 'hidden',
            boxSizing: 'border-box',
          },
        }}
      >
        <Toolbar variant="dense" />
        <Divider />
        <List>
          {VIEWS.map((v) => (
            <ListItemButton
              key={v.key}
              selected={view === v.key}
              onClick={() => setView(v.key)}
              sx={{ px: open ? 2 : 1.5, justifyContent: open ? 'initial' : 'center' }}
            >
              <ListItemIcon sx={{ minWidth: open ? 36 : 'auto', justifyContent: 'center' }}>
                {v.icon}
              </ListItemIcon>
              {open && <ListItemText primary={v.label} />}
            </ListItemButton>
          ))}
        </List>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, p: 3, mt: 6 }}>
        {view === 'tasks' && <TasksView />}
        {view === 'feeds' && <FeedsView />}
        {view === 'time' && <TimeView />}
        {view === 'focus' && <FocusTimeline />}
        {view === 'workout' && <WorkoutView />}
        {view === 'budget' && <BudgetPanel />}
      </Box>
    </Box>
  );
}
