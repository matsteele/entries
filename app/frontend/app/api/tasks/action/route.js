import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
export const dynamic = 'force-dynamic';

const CLI = path.resolve(process.cwd(), '..', 'cli', 'daily-log-cli.js');
const NODE = '/Users/matthewsteele/.nvm/versions/node/v22.13.0/bin/node';
const TRACKING_DIR = path.resolve(process.cwd(), '..', '..', 'tracking');
const PENDING_FILE = path.join(TRACKING_DIR, 'pending.json');
const COMPLETED_FILE = path.join(TRACKING_DIR, 'completed.json');

/** Complete a Google Task via API (best-effort, non-blocking) */
function completeGoogleTask(googleTaskId, googleTaskListId) {
  try {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) return;
    const tokenRes = execSync(
      `curl -s -X POST https://oauth2.googleapis.com/token ` +
      `-d client_id="${GOOGLE_CLIENT_ID}" ` +
      `-d client_secret="${GOOGLE_CLIENT_SECRET}" ` +
      `-d refresh_token="${GOOGLE_REFRESH_TOKEN}" ` +
      `-d grant_type=refresh_token`,
      { encoding: 'utf8', timeout: 5000 }
    );
    const accessToken = JSON.parse(tokenRes).access_token;
    if (!accessToken) return;
    execSync(
      `curl -s -X PATCH ` +
      `-H "Authorization: Bearer ${accessToken}" ` +
      `-H "Content-Type: application/json" ` +
      `-d '{"status":"completed"}' ` +
      `"https://www.googleapis.com/tasks/v1/lists/${googleTaskListId}/tasks/${googleTaskId}"`,
      { encoding: 'utf8', timeout: 5000 }
    );
  } catch (e) { /* best-effort */ }
}

/** Find Google Task metadata from a task being completed */
function findGoogleTaskMeta(taskId) {
  // Check pending tasks
  try {
    const pending = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
    const task = pending.find(t => t.id === taskId);
    if (task?.googleTaskId && task?.googleTaskListId) {
      return { googleTaskId: task.googleTaskId, googleTaskListId: task.googleTaskListId };
    }
  } catch (e) { /* ignore */ }
  // Check completed tasks (task may have just been moved there)
  try {
    const completed = JSON.parse(fs.readFileSync(COMPLETED_FILE, 'utf8'));
    const task = completed.find(t => t.id === taskId);
    if (task?.googleTaskId && task?.googleTaskListId) {
      return { googleTaskId: task.googleTaskId, googleTaskListId: task.googleTaskListId };
    }
  } catch (e) { /* ignore */ }
  return null;
}

function runCli(...args) {
  const escaped = args.map(a => `'${String(a).replace(/'/g, "'\\''")}'`).join(' ');
  return execSync(`${NODE} ${CLI} ${escaped}`, { encoding: 'utf8', timeout: 10000 });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action, ...params } = body;

    let output;
    switch (action) {
      case 'switch-to': {
        if (!params.taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 });
        output = runCli('switch-to-id', params.taskId);
        break;
      }
      case 'complete-task': {
        if (!params.taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 });
        const gtMeta = findGoogleTaskMeta(params.taskId);
        output = runCli('complete-task-id', params.taskId);
        if (gtMeta) completeGoogleTask(gtMeta.googleTaskId, gtMeta.googleTaskListId);
        break;
      }
      case 'complete-current': {
        // Check current task for Google Task metadata before completing
        let currentGtMeta = null;
        try {
          const currentFile = path.join(TRACKING_DIR, 'current.json');
          const current = JSON.parse(fs.readFileSync(currentFile, 'utf8'));
          if (current.task?.sourceId) currentGtMeta = findGoogleTaskMeta(current.task.sourceId);
        } catch (e) { /* ignore */ }
        output = runCli('complete-current');
        if (currentGtMeta) completeGoogleTask(currentGtMeta.googleTaskId, currentGtMeta.googleTaskListId);
        break;
      }
      case 'pause-current':
        output = runCli('set-pending');
        break;
      case 'delete-task': {
        if (!params.taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 });
        // Local delete only — does NOT remove from Google Tasks.
        // The local list is "tasks planned for today"; removing here just
        // means "not doing it today", not "never doing it".
        output = runCli('delete-task-id', params.taskId);
        break;
      }
      case 'set-focus': {
        if (!params.taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 });
        output = runCli('focus-id', params.taskId, params.level);
        break;
      }
      case 'set-priority': {
        if (!params.taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 });
        output = runCli('pri-id', params.taskId, params.level);
        break;
      }
      case 'add-task': {
        const taskStr = params.context ? `${params.title} ${params.context}` : params.title;
        output = runCli('pending', taskStr);
        break;
      }
      case 'pull-goog':
        output = runCli('pull-goog');
        break;
      case 'pull-jira':
        output = runCli('jira');
        break;
      case 'add-note': {
        if (!params.text) return NextResponse.json({ error: 'text required' }, { status: 400 });
        output = runCli('note', params.text);
        break;
      }
      case 'add-from-feed': {
        const feedTaskStr = params.context ? `${params.title} ${params.context}` : params.title;
        output = runCli('pending', feedTaskStr);
        // Attach Google Task metadata to the newly created pending task
        if (params.googleTaskId) {
          try {
            const pending = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
            const last = pending[pending.length - 1];
            if (last) {
              last.googleTaskId = params.googleTaskId;
              if (params.googleTaskListId) last.googleTaskListId = params.googleTaskListId;
              fs.writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2) + '\n');
            }
          } catch (e) { /* metadata is best-effort */ }
        }
        break;
      }
      case 'delete-by-plan-id': {
        if (!params.actionId) return NextResponse.json({ error: 'actionId required' }, { status: 400 });
        try {
          const pending = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
          const idx = pending.findIndex(t => t.actionId === params.actionId);
          if (idx >= 0) {
            const taskId = pending[idx].id;
            output = runCli('delete-task-id', taskId);
          } else {
            output = 'Task not found in pending';
          }
        } catch (e) { output = e.message; }
        break;
      }
      case 'add-from-plan': {
        if (!params.title) return NextResponse.json({ error: 'title required' }, { status: 400 });
        const planTaskStr = params.context ? `${params.title} ${params.context}` : params.title;
        output = runCli('pending', planTaskStr);
        // Attach goal lineage metadata to the newly created pending task
        try {
          const pending = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
          const last = pending[pending.length - 1];
          if (last) {
            if (params.actionId) last.actionId = params.actionId;
            if (params.epicId) last.epicId = params.epicId;
            if (params.projectId) last.projectId = params.projectId;
            if (params.goalId) last.goalId = params.goalId;
            if (params.goalTitle) last.goalTitle = params.goalTitle;
            if (params.projectTitle) last.projectTitle = params.projectTitle;
            if (params.epicTitle) last.epicTitle = params.epicTitle;
            if (params.estimatedMinutes) last.estimatedMinutes = params.estimatedMinutes;
            fs.writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2) + '\n');
          }
        } catch (e) { /* metadata is best-effort */ }
        break;
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    return NextResponse.json({ ok: true, output });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
