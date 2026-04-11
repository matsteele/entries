#!/usr/bin/env node
/**
 * Gmail CLI — manage emails from the terminal.
 *
 * Usage:
 *   node gmail-cli.js trash <id,...>          Move emails to trash
 *   node gmail-cli.js delete <id,...>         Permanently delete emails
 *   node gmail-cli.js star <id,...>           Star emails
 *   node gmail-cli.js unstar <id,...>         Remove star
 *   node gmail-cli.js archive <id,...>        Archive (remove from inbox)
 *   node gmail-cli.js read <id,...>           Mark as read
 *   node gmail-cli.js unread <id,...>         Mark as unread
 *   node gmail-cli.js label <id,...> <label>  Apply a label (creates if needed)
 *   node gmail-cli.js labels                  List all labels
 *   node gmail-cli.js auth                    Run OAuth flow to get refresh token
 *
 * Requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN in .env
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { google } = require('googleapis');
const http = require('http');
const { URL } = require('url');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;

const SCOPES = [
  'https://mail.google.com/',
];

function getOAuth2Client() {
  const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, 'http://localhost:3847/oauth2callback');
  if (REFRESH_TOKEN) {
    oauth2.setCredentials({ refresh_token: REFRESH_TOKEN });
  }
  return oauth2;
}

function getGmail() {
  const auth = getOAuth2Client();
  return google.gmail({ version: 'v1', auth });
}

function parseIds(idStr) {
  return idStr.split(',').map(s => s.trim()).filter(Boolean);
}

// ─── Auth flow ──────────────────────────────────────────────────────────────

async function runAuthFlow() {
  // Use 'urn:ietf:wg:oauth:2.0:oob' style — Desktop app, no redirect needed.
  // Google deprecated OOB, so we use a localhost redirect but auto-capture the code.
  const REDIRECT = 'http://localhost:3847/oauth2callback';
  const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT);
  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  // Try to open browser automatically
  const { execSync } = require('child_process');
  try { execSync(`open "${authUrl}"`); } catch {}

  console.log('\n🔗 Auth URL (should open automatically):\n');
  console.log(authUrl);
  console.log('\nWaiting for callback on http://localhost:3847 ...\n');

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, 'http://localhost:3847');
        const code = url.searchParams.get('code');
        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Missing code parameter');
          return;
        }
        const { tokens } = await oauth2.getToken(code);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h2>✅ Gmail auth successful! You can close this tab.</h2>');
        server.close();

        console.log('✅ Got refresh token. Add this to your .env file:\n');
        console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
        console.log('');
        resolve(tokens);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error: ' + err.message);
        server.close();
        reject(err);
      }
    });
    server.listen(3847);
  });
}

// ─── Gmail operations ───────────────────────────────────────────────────────

async function modifyMessages(ids, addLabelIds = [], removeLabelIds = []) {
  const gmail = getGmail();
  const results = [];
  for (const id of ids) {
    try {
      await gmail.users.messages.modify({
        userId: 'me',
        id,
        requestBody: { addLabelIds, removeLabelIds },
      });
      results.push({ id, ok: true });
    } catch (err) {
      results.push({ id, ok: false, error: err.message });
    }
  }
  return results;
}

async function trashMessages(ids) {
  const gmail = getGmail();
  const results = [];
  for (const id of ids) {
    try {
      await gmail.users.messages.trash({ userId: 'me', id });
      results.push({ id, ok: true });
    } catch (err) {
      results.push({ id, ok: false, error: err.message });
    }
  }
  return results;
}

async function deleteMessages(ids) {
  const gmail = getGmail();
  const results = [];
  for (const id of ids) {
    try {
      await gmail.users.messages.delete({ userId: 'me', id });
      results.push({ id, ok: true });
    } catch (err) {
      results.push({ id, ok: false, error: err.message });
    }
  }
  return results;
}

async function listLabels() {
  const gmail = getGmail();
  const res = await gmail.users.labels.list({ userId: 'me' });
  return res.data.labels || [];
}

async function getOrCreateLabel(name) {
  const gmail = getGmail();
  const labels = await listLabels();
  const existing = labels.find(l => l.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;

  const res = await gmail.users.labels.create({
    userId: 'me',
    requestBody: {
      name,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show',
    },
  });
  return res.data.id;
}

async function emailToTask(ids, listId) {
  const gmail = getGmail();
  const { google: goog } = require('googleapis');
  const tasksAuth = new goog.auth.OAuth2(CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  tasksAuth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const tasks = goog.tasks({ version: 'v1', auth: tasksAuth });

  const results = [];
  for (const id of ids) {
    try {
      const detail = await gmail.users.messages.get({
        userId: 'me', id, format: 'metadata',
        metadataHeaders: ['From', 'Subject'],
      });
      const headers = detail.data.payload?.headers || [];
      const subject = headers.find(h => h.name === 'Subject')?.value || '(no subject)';
      const from = headers.find(h => h.name === 'From')?.value || '';
      const link = `https://mail.google.com/mail/u/0/#inbox/${id}`;

      const task = await tasks.tasks.insert({
        tasklist: listId,
        requestBody: {
          title: subject,
          notes: `From: ${from}\n\n${link}`,
        },
      });
      results.push({ id, ok: true, title: subject, taskId: task.data.id });
    } catch (err) {
      results.push({ id, ok: false, error: err.message });
    }
  }
  return results;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd) {
    console.log('Usage: gmail-cli.js <command> [args]');
    console.log('Commands: auth, trash, delete, star, unstar, archive, read, unread, label, labels, task');
    process.exit(1);
  }

  if (cmd === 'auth') {
    await runAuthFlow();
    return;
  }

  if (!REFRESH_TOKEN) {
    console.error('❌ No GMAIL_REFRESH_TOKEN in .env. Run: node gmail-cli.js auth');
    process.exit(1);
  }

  switch (cmd) {
    case 'trash': {
      const ids = parseIds(args[1]);
      const results = await trashMessages(ids);
      const ok = results.filter(r => r.ok).length;
      console.log(`🗑️  Trashed ${ok}/${ids.length} emails`);
      results.filter(r => !r.ok).forEach(r => console.error(`  ❌ ${r.id}: ${r.error}`));
      break;
    }

    case 'delete': {
      const ids = parseIds(args[1]);
      const results = await deleteMessages(ids);
      const ok = results.filter(r => r.ok).length;
      console.log(`💀 Permanently deleted ${ok}/${ids.length} emails`);
      results.filter(r => !r.ok).forEach(r => console.error(`  ❌ ${r.id}: ${r.error}`));
      break;
    }

    case 'star': {
      const ids = parseIds(args[1]);
      const results = await modifyMessages(ids, ['STARRED'], []);
      const ok = results.filter(r => r.ok).length;
      console.log(`⭐ Starred ${ok}/${ids.length} emails`);
      break;
    }

    case 'unstar': {
      const ids = parseIds(args[1]);
      const results = await modifyMessages(ids, [], ['STARRED']);
      const ok = results.filter(r => r.ok).length;
      console.log(`Unstarred ${ok}/${ids.length} emails`);
      break;
    }

    case 'archive': {
      const ids = parseIds(args[1]);
      const results = await modifyMessages(ids, [], ['INBOX']);
      const ok = results.filter(r => r.ok).length;
      console.log(`📦 Archived ${ok}/${ids.length} emails`);
      break;
    }

    case 'read': {
      const ids = parseIds(args[1]);
      const results = await modifyMessages(ids, [], ['UNREAD']);
      const ok = results.filter(r => r.ok).length;
      console.log(`👁️  Marked ${ok}/${ids.length} as read`);
      break;
    }

    case 'unread': {
      const ids = parseIds(args[1]);
      const results = await modifyMessages(ids, ['UNREAD'], []);
      const ok = results.filter(r => r.ok).length;
      console.log(`Marked ${ok}/${ids.length} as unread`);
      break;
    }

    case 'label': {
      const ids = parseIds(args[1]);
      const labelName = args[2];
      if (!labelName) {
        console.error('Usage: gmail-cli.js label <id,...> <label-name>');
        process.exit(1);
      }
      const labelId = await getOrCreateLabel(labelName);
      const results = await modifyMessages(ids, [labelId], []);
      const ok = results.filter(r => r.ok).length;
      console.log(`🏷️  Labeled ${ok}/${ids.length} emails as "${labelName}"`);
      break;
    }

    case 'task': {
      const ids = parseIds(args[1]);
      const listId = args[2] || '@default';
      const results = await emailToTask(ids, listId);
      const ok = results.filter(r => r.ok).length;
      console.log(`📋 Created ${ok}/${ids.length} tasks`);
      results.filter(r => r.ok).forEach(r => console.log(`  ✅ ${r.title}`));
      results.filter(r => !r.ok).forEach(r => console.error(`  ❌ ${r.id}: ${r.error}`));
      break;
    }

    case 'labels': {
      const labels = await listLabels();
      labels.sort((a, b) => a.name.localeCompare(b.name));
      labels.forEach(l => console.log(`  ${l.name} (${l.id})`));
      break;
    }

    default:
      console.error(`Unknown command: ${cmd}`);
      process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
