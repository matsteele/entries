import { execSync } from 'child_process';

const cache = {
  googleTasks: { data: null, fetchedAt: 0 },
  jira: { data: null, fetchedAt: 0 },
};
const CACHE_TTL = 60000;

function getGoogleAccessToken() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) return null;
  const tokenResponse = execSync(
    `curl -s -X POST https://oauth2.googleapis.com/token ` +
    `-d client_id="${GOOGLE_CLIENT_ID}" ` +
    `-d client_secret="${GOOGLE_CLIENT_SECRET}" ` +
    `-d refresh_token="${GOOGLE_REFRESH_TOKEN}" ` +
    `-d grant_type=refresh_token`,
    { encoding: 'utf8' }
  );
  return JSON.parse(tokenResponse).access_token || null;
}

export function fetchGoogleTasksFeed(force = false) {
  const now = Date.now();
  if (!force && cache.googleTasks.data && (now - cache.googleTasks.fetchedAt) < CACHE_TTL) {
    return cache.googleTasks.data;
  }

  const accessToken = getGoogleAccessToken();
  if (!accessToken) return { error: 'Google credentials not configured', tasks: [] };

  const listsData = JSON.parse(execSync(
    `curl -s -H "Authorization: Bearer ${accessToken}" ` +
    `"https://www.googleapis.com/tasks/v1/users/@me/lists"`,
    { encoding: 'utf8' }
  ));
  if (!listsData.items) return { tasks: [] };

  const results = [];
  for (const list of listsData.items) {
    const tasksData = JSON.parse(execSync(
      `curl -s -H "Authorization: Bearer ${accessToken}" ` +
      `"https://www.googleapis.com/tasks/v1/lists/${list.id}/tasks?showCompleted=false&showHidden=false&maxResults=100"`,
      { encoding: 'utf8' }
    ));
    if (!tasksData.items) continue;
    for (const task of tasksData.items) {
      if (task.status === 'completed') continue;
      results.push({
        id: task.id,
        title: task.title,
        notes: task.notes || null,
        due: task.due || null,
        updated: task.updated,
        listId: list.id,
        listName: list.title,
        status: task.status,
      });
    }
  }
  const data = { tasks: results };
  cache.googleTasks = { data, fetchedAt: now };
  return data;
}

// ─── Gmail ──────────────────────────────────────────────────────────────────

function getGmailAccessToken() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) return null;
  const tokenResponse = execSync(
    `curl -s -X POST https://oauth2.googleapis.com/token ` +
    `-d client_id="${GOOGLE_CLIENT_ID}" ` +
    `-d client_secret="${GOOGLE_CLIENT_SECRET}" ` +
    `-d refresh_token="${GMAIL_REFRESH_TOKEN}" ` +
    `-d grant_type=refresh_token`,
    { encoding: 'utf8' }
  );
  return JSON.parse(tokenResponse).access_token || null;
}

// Marketing / newsletter sender patterns
const MARKETING_PATTERNS = [
  /noreply/i, /no-reply/i, /newsletter/i, /marketing/i, /promo/i,
  /offers@/i, /deals@/i, /news@/i, /info@/i, /hello@/i,
  /unsubscribe/i, /mkt\./i, /campaign/i, /email\./i, /em\d?\./i,
];

const MARKETING_DOMAINS = [
  'amazon.com', 'amazonses.com', 'turbotax.intuit.com', 'regalcinemas.com',
  'lotilabs.com', 'biolongevitylabs.com', 'mansurgavriel.com', 'globe.com',
  'numastays.com', 'tf.com.br', 'optum.com', 'pacha-nyc.com',
];

const JOBS_PATTERNS = [
  /recruiter/i, /hiring/i, /job\b/i, /opportunity/i, /career/i,
  /talent\s*acquisition/i, /position/i, /role\b.*engineer/i, /interview/i,
  /applied\s+ml/i, /full\s+stack/i, /we.re\s+looking/i,
];

const INFO_PATTERNS = [
  /shipped/i, /delivered/i, /tracking/i, /order\s+(confirm|update|status)/i,
  /receipt/i, /invoice/i, /security\s+alert/i, /sign.in/i, /verification/i,
  /password\s+reset/i, /your\s+account/i,
];

function categorizeEmail(email) {
  const from = email.from || '';
  const subject = email.subject || '';
  const snippet = email.snippet || '';
  const combined = `${from} ${subject} ${snippet}`;

  // Jobs first (high priority override)
  if (JOBS_PATTERNS.some(p => p.test(combined))) return 'jobs';

  // Marketing
  const fromLower = from.toLowerCase();
  if (MARKETING_DOMAINS.some(d => fromLower.includes(d))) return 'marketing';
  if (MARKETING_PATTERNS.some(p => p.test(from))) return 'marketing';
  // Subject-based marketing signals
  if (/sale|% off|discount|last chance|limited time|don.t miss|claim your/i.test(subject)) return 'marketing';

  // Informational
  if (INFO_PATTERNS.some(p => p.test(combined))) return 'informational';

  // Default: needs attention
  return 'attention';
}

export function fetchGmailFeed(force = false) {
  const now = Date.now();
  if (!force && cache.gmail && cache.gmail.data && (now - cache.gmail.fetchedAt) < CACHE_TTL * 60) {
    return cache.gmail.data;
  }

  const accessToken = getGmailAccessToken();
  if (!accessToken) return { error: 'Gmail credentials not configured', emails: [], categories: {} };

  // Fetch unread inbox messages
  const listData = JSON.parse(execSync(
    `curl -s -H "Authorization: Bearer ${accessToken}" ` +
    `"https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is%3Aunread+in%3Ainbox&maxResults=50"`,
    { encoding: 'utf8', timeout: 15000 }
  ));

  if (!listData.messages || listData.messages.length === 0) {
    const data = { emails: [], categories: { marketing: [], informational: [], attention: [], jobs: [] } };
    if (!cache.gmail) cache.gmail = {};
    cache.gmail = { data, fetchedAt: now };
    return data;
  }

  // Fetch message details (batch in groups of 10 for speed)
  const emails = [];
  for (const msg of listData.messages) {
    try {
      const detail = JSON.parse(execSync(
        `curl -s -H "Authorization: Bearer ${accessToken}" ` +
        `"https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date"`,
        { encoding: 'utf8', timeout: 10000 }
      ));
      const headers = detail.payload?.headers || [];
      const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
      const isStarred = (detail.labelIds || []).includes('STARRED');

      emails.push({
        id: detail.id,
        threadId: detail.threadId,
        from: getHeader('From'),
        subject: getHeader('Subject'),
        date: getHeader('Date'),
        snippet: detail.snippet || '',
        starred: isStarred,
        labelIds: detail.labelIds || [],
      });
    } catch {
      // skip failed fetches
    }
  }

  // Categorize
  const categories = { marketing: [], informational: [], attention: [], jobs: [] };
  for (const email of emails) {
    // Starred emails always go to attention
    if (email.starred) {
      email.category = 'attention';
    } else {
      email.category = categorizeEmail(email);
    }
    categories[email.category].push(email);
  }

  const data = { emails, categories };
  if (!cache.gmail) cache.gmail = {};
  cache.gmail = { data, fetchedAt: now };
  return data;
}

export function gmailAction(action, ids) {
  const accessToken = getGmailAccessToken();
  if (!accessToken) throw new Error('Gmail credentials not configured');

  const results = [];
  for (const id of ids) {
    try {
      switch (action) {
        case 'trash':
          execSync(
            `curl -s -X POST -H "Authorization: Bearer ${accessToken}" ` +
            `"https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/trash"`,
            { encoding: 'utf8', timeout: 10000 }
          );
          break;
        case 'star':
          execSync(
            `curl -s -X POST -H "Authorization: Bearer ${accessToken}" ` +
            `-H "Content-Type: application/json" ` +
            `-d '{"addLabelIds":["STARRED"]}' ` +
            `"https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/modify"`,
            { encoding: 'utf8', timeout: 10000 }
          );
          break;
        case 'archive':
          execSync(
            `curl -s -X POST -H "Authorization: Bearer ${accessToken}" ` +
            `-H "Content-Type: application/json" ` +
            `-d '{"removeLabelIds":["INBOX"]}' ` +
            `"https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/modify"`,
            { encoding: 'utf8', timeout: 10000 }
          );
          break;
        case 'read':
          execSync(
            `curl -s -X POST -H "Authorization: Bearer ${accessToken}" ` +
            `-H "Content-Type: application/json" ` +
            `-d '{"removeLabelIds":["UNREAD"]}' ` +
            `"https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/modify"`,
            { encoding: 'utf8', timeout: 10000 }
          );
          break;
        case 'label-jobs': {
          // Get or create "jobs" label
          const labelsResp = JSON.parse(execSync(
            `curl -s -H "Authorization: Bearer ${accessToken}" ` +
            `"https://gmail.googleapis.com/gmail/v1/users/me/labels"`,
            { encoding: 'utf8', timeout: 10000 }
          ));
          let jobsLabel = (labelsResp.labels || []).find(l => l.name.toLowerCase() === 'jobs');
          if (!jobsLabel) {
            jobsLabel = JSON.parse(execSync(
              `curl -s -X POST -H "Authorization: Bearer ${accessToken}" ` +
              `-H "Content-Type: application/json" ` +
              `-d '{"name":"jobs","labelListVisibility":"labelShow","messageListVisibility":"show"}' ` +
              `"https://gmail.googleapis.com/gmail/v1/users/me/labels"`,
              { encoding: 'utf8', timeout: 10000 }
            ));
          }
          execSync(
            `curl -s -X POST -H "Authorization: Bearer ${accessToken}" ` +
            `-H "Content-Type: application/json" ` +
            `-d '{"addLabelIds":["${jobsLabel.id}"]}' ` +
            `"https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/modify"`,
            { encoding: 'utf8', timeout: 10000 }
          );
          break;
        }
      }
      results.push({ id, ok: true });
    } catch (err) {
      results.push({ id, ok: false, error: err.message });
    }
  }

  // Invalidate cache
  if (cache.gmail) cache.gmail.fetchedAt = 0;

  return results;
}

export function fetchJiraFeed(force = false) {
  const now = Date.now();
  if (!force && cache.jira.data && (now - cache.jira.fetchedAt) < CACHE_TTL) {
    return cache.jira.data;
  }

  const { ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN, ATLASSIAN_DOMAIN } = process.env;
  const domain = ATLASSIAN_DOMAIN || 'cultivo.atlassian.net';
  if (!ATLASSIAN_EMAIL || !ATLASSIAN_API_TOKEN) return { error: 'Jira credentials not configured', tickets: [] };

  const jqlPayload = JSON.stringify({
    jql: 'assignee=currentUser() AND status in (Ready, "In Progress", Untriaged, "In Review") ORDER BY updated DESC',
    maxResults: 50,
    fields: ['summary', 'status', 'priority', 'issuetype', 'updated', 'assignee'],
  });
  const response = JSON.parse(execSync(
    `curl -s -u "${ATLASSIAN_EMAIL}:${ATLASSIAN_API_TOKEN}" ` +
    `-H "Content-Type: application/json" ` +
    `--data '${jqlPayload}' ` +
    `"https://${domain}/rest/api/3/search/jql"`,
    { encoding: 'utf8' }
  ));
  if (!response.issues) return { tickets: [] };

  const tickets = response.issues.map(issue => ({
    key: issue.key,
    summary: issue.fields.summary,
    status: issue.fields.status?.name,
    priority: issue.fields.priority?.name,
    type: issue.fields.issuetype?.name,
    updated: issue.fields.updated,
    url: `https://${domain}/browse/${issue.key}`,
  }));
  const data = { tickets };
  cache.jira = { data, fetchedAt: now };
  return data;
}
