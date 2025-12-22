/**
 * Simple Express API for Time Tracking System
 * Provides REST API for reading/writing planning and tracking data.
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const WorkSession = require('./work_session');

const app = express();
const PORT = 5001;

// Middleware
app.use(cors());  // Allow frontend to connect
app.use(express.json());

const BASE_DIR = path.join(__dirname, '..', '..');

// Initialize work session manager
const sessionManager = new WorkSession(BASE_DIR);

// ============================================================================
// READ ENDPOINTS
// ============================================================================

app.get('/api/planning', (req, res) => {
  try {
    res.json(sessionManager.planning);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/tracking', (req, res) => {
  try {
    res.json(sessionManager.tracking);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/session', (req, res) => {
  try {
    const sessionData = sessionManager.currentSession;

    if (sessionData) {
      // Calculate elapsed time for current activity
      if (sessionData.current_activity) {
        const startTime = new Date(sessionData.current_activity.start_time);
        const now = new Date();
        const elapsedMs = now - startTime;
        const elapsedMinutes = elapsedMs / 60000;
        sessionData.current_activity.elapsed_minutes = Math.round(elapsedMinutes * 100) / 100;
      }

      res.json(sessionData);
    } else {
      res.json(null);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/stats', (req, res) => {
  try {
    const stats = sessionManager.tracking.aggregated_stats || {};
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// WRITE ENDPOINTS
// ============================================================================

app.post('/api/session/start', (req, res) => {
  try {
    sessionManager.startSession();
    res.json({
      success: true,
      session_id: sessionManager.currentSession.session_id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/session/end', (req, res) => {
  try {
    sessionManager.endSession();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/activity/switch', (req, res) => {
  /**
   * Switch to a task or planning activity.
   *
   * Body: {
   *   "type": "task_work" | "planning",
   *   "context_id": "...",
   *   "objective_id": "...",
   *   "project_id": "...",
   *   "task_id": "...",
   *   "scope": "daily" (for planning),
   *   "notes": "..."
   * }
   */
  try {
    const data = req.body;
    const activityType = data.type || 'planning';

    if (activityType === 'task_work') {
      const success = sessionManager.switchToTask(
        data.context_id,
        data.objective_id,
        data.project_id,
        data.task_id
      );
      res.json({ success });
    } else {
      // Switch to planning
      sessionManager.startActivity('planning', {
        scope: data.scope || 'daily',
        notes: data.notes || 'Planning session'
      });
      res.json({ success: true });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/context', (req, res) => {
  /**
   * Add a new context.
   *
   * Body: {
   *   "id": "context_id",
   *   "name": "Context Name"
   * }
   */
  try {
    const { id, name } = req.body;

    sessionManager.planning.contexts[id] = {
      name: name,
      objectives: {}
    };
    sessionManager._savePlanning();

    res.json({ success: true, id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/objective', (req, res) => {
  /**
   * Add a new objective.
   *
   * Body: {
   *   "context_id": "...",
   *   "title": "...",
   *   "scope": "yearly|weekly|quarterly"
   * }
   */
  try {
    const { context_id, title, scope = 'yearly' } = req.body;

    if (!sessionManager.planning.contexts[context_id]) {
      return res.status(404).json({ error: 'Context not found' });
    }

    const objId = `obj-${Date.now()}`;
    const objective = {
      id: objId,
      title: title,
      scope: scope,
      status: 'active',
      created: new Date().toISOString().split('T')[0],
      projects: {}
    };

    sessionManager.planning.contexts[context_id].objectives[objId] = objective;
    sessionManager._savePlanning();

    res.json({ success: true, id: objId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/project', (req, res) => {
  /**
   * Add a new project.
   *
   * Body: {
   *   "context_id": "...",
   *   "objective_id": "...",
   *   "title": "..."
   * }
   */
  try {
    const { context_id, objective_id, title } = req.body;

    const context = sessionManager.planning.contexts[context_id];
    if (!context) {
      return res.status(404).json({ error: 'Context not found' });
    }

    const objective = context.objectives[objective_id];
    if (!objective) {
      return res.status(404).json({ error: 'Objective not found' });
    }

    const projId = `proj-${Date.now()}`;
    const dialogueFile = `time-tracking/dialogues/${projId}-${title.toLowerCase().replace(/\s+/g, '-')}.md`;

    const project = {
      id: projId,
      title: title,
      status: 'active',
      created: new Date().toISOString().split('T')[0],
      dialogue_file: dialogueFile,
      tasks: []
    };

    objective.projects[projId] = project;
    sessionManager._savePlanning();

    // Create dialogue file
    const dialoguePath = path.join(BASE_DIR, dialogueFile);
    const dialogueDir = path.dirname(dialoguePath);

    if (!fs.existsSync(dialogueDir)) {
      fs.mkdirSync(dialogueDir, { recursive: true });
    }

    const dialogueContent = `# ${title}

**Project ID:** ${projId}
**Objective:** ${objective.title}
**Context:** ${context.name}
**Created:** ${new Date().toISOString().split('T')[0]}

---

## Planning

## Progress Log

`;

    fs.writeFileSync(dialoguePath, dialogueContent, 'utf8');

    res.json({ success: true, id: projId, dialogue_file: dialogueFile });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/task', (req, res) => {
  /**
   * Add a new task.
   *
   * Body: {
   *   "context_id": "...",
   *   "objective_id": "...",
   *   "project_id": "...",
   *   "title": "...",
   *   "plan_id": "..." (optional)
   * }
   */
  try {
    const { context_id, objective_id, project_id, title, plan_id } = req.body;

    const context = sessionManager.planning.contexts[context_id];
    if (!context) {
      return res.status(404).json({ error: 'Context not found' });
    }

    const objective = context.objectives[objective_id];
    if (!objective) {
      return res.status(404).json({ error: 'Objective not found' });
    }

    const project = objective.projects[project_id];
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const taskId = `task-${Date.now()}`;
    const task = {
      id: taskId,
      title: title,
      status: 'pending',
      created: new Date().toISOString().split('T')[0],
      plan_id: plan_id || null
    };

    if (!project.tasks) {
      project.tasks = [];
    }

    project.tasks.push(task);
    sessionManager._savePlanning();

    res.json({ success: true, id: taskId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/task/:task_id/status', (req, res) => {
  /**
   * Update task status.
   *
   * Body: {
   *   "status": "pending|in_progress|completed"
   * }
   */
  try {
    const { task_id } = req.params;
    const { status: newStatus } = req.body;

    // Find the task
    for (const ctx of Object.values(sessionManager.planning.contexts)) {
      if (ctx.objectives) {
        for (const obj of Object.values(ctx.objectives)) {
          if (obj.projects) {
            for (const proj of Object.values(obj.projects)) {
              if (proj.tasks) {
                for (const task of proj.tasks) {
                  if (task.id === task_id) {
                    task.status = newStatus;
                    if (newStatus === 'completed') {
                      task.completed = new Date().toISOString().split('T')[0];
                    }
                    sessionManager._savePlanning();
                    return res.json({ success: true });
                  }
                }
              }
            }
          }
        }
      }
    }

    res.status(404).json({ error: 'Task not found' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// DELETE ENDPOINTS
// ============================================================================

app.delete('/api/task/:context_id/:objective_id/:project_id/:task_id', (req, res) => {
  /**
   * Delete a task.
   */
  try {
    const { context_id, objective_id, project_id, task_id } = req.params;

    const context = sessionManager.planning.contexts[context_id];
    if (!context) {
      return res.status(404).json({ error: 'Context not found' });
    }

    const objective = context.objectives?.[objective_id];
    if (!objective) {
      return res.status(404).json({ error: 'Objective not found' });
    }

    const project = objective.projects?.[project_id];
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!project.tasks) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const taskIndex = project.tasks.findIndex(t => t.id === task_id);
    if (taskIndex === -1) {
      return res.status(404).json({ error: 'Task not found' });
    }

    project.tasks.splice(taskIndex, 1);
    sessionManager._savePlanning();

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/project/:context_id/:objective_id/:project_id', (req, res) => {
  /**
   * Delete a project and all its tasks.
   */
  try {
    const { context_id, objective_id, project_id } = req.params;

    const context = sessionManager.planning.contexts[context_id];
    if (!context) {
      return res.status(404).json({ error: 'Context not found' });
    }

    const objective = context.objectives?.[objective_id];
    if (!objective) {
      return res.status(404).json({ error: 'Objective not found' });
    }

    if (!objective.projects?.[project_id]) {
      return res.status(404).json({ error: 'Project not found' });
    }

    delete objective.projects[project_id];
    sessionManager._savePlanning();

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/objective/:context_id/:objective_id', (req, res) => {
  /**
   * Delete an objective and all its projects.
   */
  try {
    const { context_id, objective_id } = req.params;

    const context = sessionManager.planning.contexts[context_id];
    if (!context) {
      return res.status(404).json({ error: 'Context not found' });
    }

    if (!context.objectives?.[objective_id]) {
      return res.status(404).json({ error: 'Objective not found' });
    }

    delete context.objectives[objective_id];
    sessionManager._savePlanning();

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/context/:context_id', (req, res) => {
  /**
   * Delete a context and all its objectives.
   */
  try {
    const { context_id } = req.params;

    if (!sessionManager.planning.contexts[context_id]) {
      return res.status(404).json({ error: 'Context not found' });
    }

    delete sessionManager.planning.contexts[context_id];
    sessionManager._savePlanning();

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, '0.0.0.0', () => {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 TIME TRACKING API SERVER');
  console.log('='.repeat(80));
  console.log(`Running on: http://localhost:${PORT}`);
  console.log(`API Documentation: http://localhost:${PORT}/api/health`);
  console.log('='.repeat(80) + '\n');
});
