import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import path from 'path';
export const dynamic = 'force-dynamic';

const CLI = path.resolve(process.cwd(), '..', 'cli', 'daily-log-cli.js');
const NODE = '/Users/matthewsteele/.nvm/versions/node/v22.13.0/bin/node';

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
      case 'switch-to':
        output = runCli('switch-to', params.taskN);
        break;
      case 'complete-task':
        output = runCli('complete-task', params.taskN);
        break;
      case 'complete-current':
        output = runCli('complete-current');
        break;
      case 'delete-task':
        output = runCli('delete-task', params.taskN);
        break;
      case 'set-focus':
        output = runCli(`focus-${params.taskN}`, params.level);
        break;
      case 'set-priority':
        output = runCli(`pri-${params.taskN}`, params.level);
        break;
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
      case 'add-from-feed': {
        const feedTaskStr = params.context ? `${params.title} ${params.context}` : params.title;
        output = runCli('pending', feedTaskStr);
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
