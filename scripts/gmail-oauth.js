#!/usr/bin/env node
// Quick OAuth flow to get a refresh token with Gmail + Tasks + Calendar scopes
const http = require('http');
const { execSync } = require('child_process');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:9876';
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',   // read, label, archive, trash
  'https://www.googleapis.com/auth/gmail.send',      // send/reply
  'https://www.googleapis.com/auth/tasks',           // keep existing tasks access
  'https://www.googleapis.com/auth/calendar',        // keep calendar access
].join(' ');

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
  `client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&access_type=offline` +
  `&prompt=consent`;

console.log('\n🔑 Opening Google OAuth consent screen...\n');
console.log('If it doesn\'t open automatically, visit:\n');
console.log(authUrl + '\n');

// Open browser
try { execSync(`open "${authUrl}"`); } catch {}

// Listen for the redirect
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:9876`);
  const code = url.searchParams.get('code');

  if (!code) {
    res.writeHead(400);
    res.end('No code received');
    return;
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  const tokens = await tokenRes.json();

  if (tokens.refresh_token) {
    console.log('\n✅ Got refresh token!\n');
    console.log('GOOGLE_REFRESH_TOKEN=' + tokens.refresh_token);
    console.log('\nScopes:', tokens.scope);

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h1>✅ Success!</h1><p>You can close this tab. Check the terminal for your refresh token.</p>');
  } else {
    console.error('\n❌ Error:', JSON.stringify(tokens, null, 2));
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end('<h1>❌ Error</h1><pre>' + JSON.stringify(tokens, null, 2) + '</pre>');
  }

  server.close();
  process.exit(0);
});

server.listen(9876, () => {
  console.log('Waiting for Google redirect on http://localhost:9876 ...\n');
});

// Timeout after 2 minutes
setTimeout(() => {
  console.log('⏰ Timed out waiting for auth. Run again.');
  server.close();
  process.exit(1);
}, 120000);
