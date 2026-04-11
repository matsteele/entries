import { useState } from 'react';
import {
  Box, Typography, Paper, Chip, Collapse, IconButton,
  List, ListItem, ListItemText, LinearProgress, Stack, Button,
  Tooltip, Badge,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import DeleteIcon from '@mui/icons-material/Delete';
import StarIcon from '@mui/icons-material/Star';
import WorkIcon from '@mui/icons-material/Work';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import InfoIcon from '@mui/icons-material/Info';
import StorefrontIcon from '@mui/icons-material/Storefront';
import AddTaskIcon from '@mui/icons-material/AddTask';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import { useEmails, useEmailAction, useTaskAction } from '../hooks/useApi';

const CATEGORY_CONFIG = {
  attention: {
    label: 'Needs Attention',
    icon: <NotificationsActiveIcon />,
    color: '#f44336',
    description: 'Emails that need your response or action',
  },
  jobs: {
    label: 'Jobs',
    icon: <WorkIcon />,
    color: '#9c27b0',
    description: 'Job opportunities and recruiter outreach',
  },
  informational: {
    label: 'Informational',
    icon: <InfoIcon />,
    color: '#2196f3',
    description: 'Shipping, receipts, security alerts, account notifications',
  },
  marketing: {
    label: 'Marketing',
    icon: <StorefrontIcon />,
    color: '#ff9800',
    description: 'Newsletters, promotions, sales',
  },
};

const CATEGORY_ORDER = ['attention', 'jobs', 'informational', 'marketing'];

function parseSender(from) {
  // "Name" <email@domain.com> → { name, email }
  const match = from.match(/^"?([^"<]*)"?\s*<?([^>]*)>?$/);
  if (match) return { name: match[1].trim() || match[2], email: match[2] };
  return { name: from, email: from };
}

function formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffH = Math.floor(diffMs / 3600000);
    if (diffH < 1) return `${Math.floor(diffMs / 60000)}m ago`;
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD}d ago`;
    return d.toLocaleDateString();
  } catch {
    return dateStr;
  }
}

function EmailCategoryGroup({ category, emails, emailAction, taskAction, selected, onToggle, onSelectAll }) {
  const [expanded, setExpanded] = useState(category === 'attention' || category === 'jobs');
  const config = CATEGORY_CONFIG[category];
  const allSelected = emails.length > 0 && emails.every(e => selected.has(e.id));

  return (
    <Paper sx={{ mb: 2 }}>
      <Box
        sx={{
          display: 'flex', alignItems: 'center', p: 1.5,
          borderLeft: `4px solid ${config.color}`,
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <IconButton
          size="small"
          onClick={() => onSelectAll(category, !allSelected)}
          sx={{ mr: 1 }}
        >
          {allSelected ? <CheckBoxIcon fontSize="small" /> : <CheckBoxOutlineBlankIcon fontSize="small" />}
        </IconButton>

        <Box
          onClick={() => setExpanded(!expanded)}
          sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', cursor: 'pointer' }}
        >
          <Box sx={{ color: config.color, mr: 1, display: 'flex' }}>{config.icon}</Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{config.label}</Typography>
          <Chip label={emails.length} size="small" sx={{ ml: 1, height: 22 }} />
        </Box>

        <Stack direction="row" spacing={0.5}>
          {(category === 'marketing' || category === 'informational') && emails.length > 0 && (
            <Tooltip title={`Delete all ${config.label}`}>
              <Button
                size="small"
                variant="outlined"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={() => {
                  const ids = emails.map(e => e.id);
                  emailAction.mutate({ action: 'trash', ids });
                }}
                disabled={emailAction.isPending}
                sx={{ fontSize: '0.7rem' }}
              >
                Delete All
              </Button>
            </Tooltip>
          )}
          {category === 'attention' && selected.size > 0 && (
            <Tooltip title="Create task from selected">
              <Button
                size="small"
                variant="outlined"
                startIcon={<AddTaskIcon />}
                onClick={() => {
                  const selEmails = emails.filter(e => selected.has(e.id));
                  for (const email of selEmails) {
                    const sender = parseSender(email.from);
                    taskAction.mutate({
                      action: 'add-task',
                      title: `Email: ${email.subject} (from ${sender.name})`,
                      context: 'prof',
                    });
                  }
                }}
                disabled={taskAction.isPending}
                sx={{ fontSize: '0.7rem' }}
              >
                To Task
              </Button>
            </Tooltip>
          )}
          {selected.size > 0 && (
            <Tooltip title="Delete selected">
              <Button
                size="small"
                variant="outlined"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={() => {
                  const ids = emails.filter(e => selected.has(e.id)).map(e => e.id);
                  if (ids.length > 0) emailAction.mutate({ action: 'trash', ids });
                }}
                disabled={emailAction.isPending}
                sx={{ fontSize: '0.7rem' }}
              >
                Delete ({[...selected].filter(id => emails.some(e => e.id === id)).length})
              </Button>
            </Tooltip>
          )}
        </Stack>

        <IconButton size="small" onClick={() => setExpanded(!expanded)} sx={{ ml: 0.5 }}>
          {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>

      <Collapse in={expanded}>
        {emails.length === 0 ? (
          <Box sx={{ p: 2, opacity: 0.5 }}>
            <Typography variant="body2" color="text.secondary">No emails in this category</Typography>
          </Box>
        ) : (
          <List dense disablePadding>
            {emails.map(email => {
              const sender = parseSender(email.from);
              const isSelected = selected.has(email.id);
              return (
                <ListItem
                  key={email.id}
                  sx={{
                    pl: 2, pr: 12,
                    borderBottom: '1px solid', borderColor: 'divider',
                    bgcolor: isSelected ? 'action.selected' : 'transparent',
                    cursor: 'pointer',
                    '&:hover': { bgcolor: isSelected ? 'action.selected' : 'action.hover' },
                  }}
                  onClick={() => onToggle(email.id)}
                  secondaryAction={
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      {email.starred && (
                        <StarIcon fontSize="small" sx={{ color: '#ffc107' }} />
                      )}
                      {category === 'attention' && (
                        <Tooltip title="Create task">
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              taskAction.mutate({
                                action: 'add-task',
                                title: `Email: ${email.subject} (from ${sender.name})`,
                                context: 'prof',
                              });
                            }}
                          >
                            <AddTaskIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {category === 'jobs' && (
                        <Tooltip title="Create task">
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              taskAction.mutate({
                                action: 'add-task',
                                title: `Job: ${email.subject} (from ${sender.name})`,
                                context: 'prof',
                              });
                            }}
                          >
                            <AddTaskIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            emailAction.mutate({ action: 'trash', ids: [email.id] });
                          }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  }
                >
                  <IconButton
                    size="small"
                    sx={{ mr: 1 }}
                    onClick={(e) => { e.stopPropagation(); onToggle(email.id); }}
                  >
                    {isSelected
                      ? <CheckBoxIcon fontSize="small" />
                      : <CheckBoxOutlineBlankIcon fontSize="small" />
                    }
                  </IconButton>
                  <ListItemText
                    primary={
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 140, maxWidth: 180 }} noWrap>
                          {sender.name}
                        </Typography>
                        <Typography variant="body2" noWrap sx={{ flexGrow: 1 }}>
                          {email.subject}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                          {formatDate(email.date)}
                        </Typography>
                      </Stack>
                    }
                    secondary={
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', maxWidth: '80%' }}>
                        {email.snippet}
                      </Typography>
                    }
                  />
                </ListItem>
              );
            })}
          </List>
        )}
      </Collapse>
    </Paper>
  );
}

export default function EmailView() {
  const { data, isLoading, error, refetch } = useEmails();
  const emailAction = useEmailAction();
  const taskAction = useTaskAction();
  const [selected, setSelected] = useState(new Set());

  const categories = data?.categories || { marketing: [], informational: [], attention: [], jobs: [] };
  const totalEmails = data?.emails?.length || 0;

  const handleToggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = (category, selectAll) => {
    setSelected(prev => {
      const next = new Set(prev);
      const ids = (categories[category] || []).map(e => e.id);
      for (const id of ids) {
        if (selectAll) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
        <Typography variant="h5">Email</Typography>
        <Badge badgeContent={totalEmails} color="primary">
          <Typography variant="body2" color="text.secondary">unread</Typography>
        </Badge>
        <Box sx={{ flexGrow: 1 }} />
        <Button
          size="small"
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={() => refetch()}
          disabled={isLoading}
        >
          Refresh
        </Button>
        {(categories.marketing.length > 0 || categories.informational.length > 0) && (
          <Button
            size="small"
            variant="contained"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={() => {
              const ids = [
                ...categories.marketing.map(e => e.id),
                ...categories.informational.map(e => e.id),
              ];
              if (ids.length > 0) emailAction.mutate({ action: 'trash', ids });
            }}
            disabled={emailAction.isPending}
          >
            Clear Noise ({categories.marketing.length + categories.informational.length})
          </Button>
        )}
      </Stack>

      {isLoading && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Typography color="error" sx={{ mb: 2 }}>Error loading emails: {error.message}</Typography>}

      {CATEGORY_ORDER.map(cat => (
        <EmailCategoryGroup
          key={cat}
          category={cat}
          emails={categories[cat] || []}
          emailAction={emailAction}
          taskAction={taskAction}
          selected={selected}
          onToggle={handleToggle}
          onSelectAll={handleSelectAll}
        />
      ))}

      {totalEmails === 0 && !isLoading && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary">Inbox Zero</Typography>
          <Typography variant="body2" color="text.secondary">No unread emails. Nice work.</Typography>
        </Paper>
      )}
    </Box>
  );
}
