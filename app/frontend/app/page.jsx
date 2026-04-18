'use client';

import { useState, useEffect } from 'react';
import {
  Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText,
  IconButton, Toolbar, AppBar, Typography, Divider,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import BarChartIcon from '@mui/icons-material/BarChart';
import RssFeedIcon from '@mui/icons-material/RssFeed';
import BoltIcon from '@mui/icons-material/Bolt';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import BedtimeIcon from '@mui/icons-material/Bedtime';
import MedicationIcon from '@mui/icons-material/Medication';
import EmailIcon from '@mui/icons-material/Email';
import FlagIcon from '@mui/icons-material/Flag';
import ExploreIcon from '@mui/icons-material/Explore';
import TimeView from '../src/components/TimeView';
import FeedsView from '../src/components/FeedsView';
import FocusTimeline from '../src/components/FocusTimeline';
import WorkoutView from '../src/components/WorkoutView';
import BudgetPanel from '../src/components/BudgetPanel';
import MealsView from '../src/components/MealsView';
import SleepView from '../src/components/SleepView';
import SupplementsView from '../src/components/SupplementsView';
import EmailView from '../src/components/EmailView';
import PlanningView from '../src/components/PlanningView';
import IntentionMatrix from '../src/components/IntentionMatrix';
import { ActiveTask } from '../src/components/TasksView';
import { useAllTasks, useTaskAction } from '../src/hooks/useApi';

const DRAWER_WIDTH = 240;
const DRAWER_COLLAPSED = 56;

const VIEWS = [
  { key: 'focus', label: 'Focus', icon: <BoltIcon /> },
  { key: 'planning', label: 'Planning', icon: <FlagIcon /> },
  { key: 'intentions', label: 'Intentions', icon: <ExploreIcon /> },
  { key: 'email', label: 'Email', icon: <EmailIcon /> },
  { key: 'feeds', label: 'Feeds', icon: <RssFeedIcon /> },
  { key: 'time', label: 'Time', icon: <BarChartIcon /> },
  { key: 'meals', label: 'Meals', icon: <RestaurantIcon /> },
  { key: 'sleep', label: 'Sleep', icon: <BedtimeIcon /> },
  { key: 'supplements', label: 'Supplements', icon: <MedicationIcon /> },
  { key: 'workout', label: 'Workout', icon: <FitnessCenterIcon /> },
];

export default function Home() {
  const [open, setOpen] = useState(true);
  const [view, setView] = useState('focus');
  const [viewParams, setViewParams] = useState({});
  const [mounted, setMounted] = useState(false);
  const { data: tasksData } = useAllTasks();
  const taskAction = useTaskAction();
  const currentTask = tasksData?.current?.task || null;

  // Sync view from URL params on mount and popstate
  useEffect(() => {
    setMounted(true);
    const syncFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const v = params.get('view');
      if (v && VIEWS.some(vw => vw.key === v)) {
        setView(v);
        const p = {};
        for (const [key, val] of params.entries()) {
          if (key !== 'view') p[key] = val;
        }
        setViewParams(p);
      }
    };
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  // Update URL when view changes
  const changeView = (v, params = {}) => {
    setView(v);
    setViewParams(params);
    const url = new URL(window.location);
    url.searchParams.set('view', v);
    // Clear old params
    for (const key of [...url.searchParams.keys()]) {
      if (key !== 'view' && key !== 'date') url.searchParams.delete(key);
    }
    for (const [key, val] of Object.entries(params)) {
      url.searchParams.set(key, val);
    }
    window.history.pushState({}, '', url);
  };

  const drawerWidth = open ? DRAWER_WIDTH : DRAWER_COLLAPSED;

  if (!mounted) return null;

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
              onClick={() => changeView(v.key)}
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

      <Box component="main" sx={{
        flexGrow: 1, p: 3, mt: 6,
        minWidth: 0,
      }}>
        {/* Sticky current task bar — visible across all views */}
        <Box sx={{
          position: 'sticky',
          top: 48, // below dense AppBar
          zIndex: (t) => t.zIndex.appBar - 1,
          mx: -3, mt: -3, mb: 2, px: 3,
        }}>
          <ActiveTask task={currentTask} action={taskAction} pending={tasksData?.pending} routine={tasksData?.routine} sticky />
        </Box>
        {view === 'focus'   && <FocusTimeline onNavigate={changeView} />}
        {view === 'planning' && <PlanningView initialGoalId={viewParams.goalId} />}
        {view === 'intentions' && <IntentionMatrix onNavigate={changeView} />}
        {view === 'sleep'   && <SleepView />}
        {view === 'email'   && <EmailView />}
        {view === 'feeds'   && <FeedsView />}
        {view === 'time'    && <TimeView />}
        {view === 'meals'   && <MealsView />}
        {view === 'supplements' && <SupplementsView />}
        {view === 'workout' && <WorkoutView />}
      </Box>
    </Box>
  );
}
