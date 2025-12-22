# Agent Development Instructions

## Critical: Dual-Environment Architecture

**This application operates in two environments simultaneously:**

1. **ZSH Shell Environment** (`.zshrc`)
2. **Claude AI Environment** (`CLAUDE.md`, this file, and MCP configuration)

## Three Core Activities

This application supports three interconnected workflows:

1. **📋 Daily Task Tracking** - Tasks for today (terminal/daily log, `/t` commands)
2. **📝 Logging & Journaling** - Life data capture (Supabase, vector embeddings, semantic search)
3. **🎯 Planning & Backlog** - Future work (Google Tasks + Calendar, plan-driven)

**Critical Flow:**
```
Plans → Tasks → Google Tasks (backlog) 
  → User favorites → /t pull → Daily Log 
    → Google Calendar (time blocking)
```

### Why This Matters

Any changes to CLI commands, aliases, behaviors, or data structures **MUST be synchronized across BOTH environments**:

```
┌─────────────────────────────────────────────────────────┐
│  User's ZSH Shell                                       │
│  ├─ ~/.zshrc aliases (/t, todos, ent)                  │
│  ├─ Calls: daily-log-cli.js, statusline.js, etc.      │
│  └─ Terminal statusline prompt integration             │
└─────────────────────────────────────────────────────────┘
              ↕ (must stay synchronized)
┌─────────────────────────────────────────────────────────┐
│  Claude AI Assistant                                    │
│  ├─ CLAUDE.md instructions (slash commands)            │
│  ├─ This file (AGENT.md - architectural guidance)      │
│  ├─ MCP tools for Google Tasks, Supabase, etc.         │
│  └─ npm run scripts awareness                          │
└─────────────────────────────────────────────────────────┘
```

---

## When Making Changes

### 1. Adding/Modifying Slash Commands

**Example: Adding a new `/t` command**

**✅ DO THIS:**
1. Update `daily-log-cli.js` with new functionality
2. Add corresponding case in `.zshrc` `/t` function (around line 174-230)
3. Update `CLAUDE.md` slash commands section (lines 200-214)
4. Test in both ZSH terminal AND verify Claude knows about it

**❌ DON'T:**
- Add command only to CLI without updating `.zshrc`
- Document in `CLAUDE.md` without implementing in code
- Assume one environment will "figure it out"

### 2. Changing Context System

**Example: Modifying context tags (per, cul, prof, soc, proj)**

**✅ UPDATE ALL:**
- `daily-log-cli.js` - Context detection logic
- `.zshrc` - Context filter commands (`/t per`, `/t cul`, etc.)
- `CLAUDE.md` - Context auto-detection section (lines 262-278)
- `CLAUDE.md` - Context tags section (lines 299-307)

### 3. Modifying NPM Scripts

**Example: Changing `npm run log:*` commands**

**✅ UPDATE:**
- `app/backend/package.json` - Script definitions
- `CLAUDE.md` - NPM commands section (lines 217-233)
- Any `.zshrc` aliases that wrap these commands

### 4. Adding/Removing Data Structures

**Example: Adding new journal entry type**

**✅ UPDATE:**
- Backend code (daily-log-cli.js, etc.)
- Supabase schema if needed
- `CLAUDE.md` - Data Location table (lines 23-32)
- `CLAUDE.md` - Entry Formats section (lines 81-156)

---

## Key Files to Synchronize

| File | Purpose | What to Sync |
|------|---------|--------------|
| `~/.zshrc` | Shell aliases & functions | Command syntax, available options, file paths |
| `CLAUDE.md` | Claude's primary instructions | Command documentation, workflows, formats |
| `AGENT.md` | This file - meta guidance | Architectural patterns, sync requirements |
| `app/backend/package.json` | NPM scripts | Script names, parameters, what they do |
| `app/backend/daily-log-cli.js` | CLI implementation | Actual command behavior |
| `app/backend/statusline.js` | Status display | What info is shown in terminal |
| `.mcp.json` | MCP server configuration | Available tools and their descriptions |

---

## Common Pitfalls

### ❌ Pitfall 1: Out-of-Sync Command Documentation
```
User: "/t addS is broken"
Issue: Command added to .zshrc but Claude's docs still reference old syntax
```

**Prevention:** When adding commands, update `CLAUDE.md` in the same commit/session.

### ❌ Pitfall 2: Context Filter Confusion
```
User: "Why does /t -1 switch to the wrong task?"
Issue: Context filtering behavior changed in CLI but .zshrc or Claude docs not updated
```

**Prevention:** Test both filtered and unfiltered views after context changes.

### ❌ Pitfall 3: NPM Script Assumptions
```
Claude: "Run npm run log:switch to switch tasks"
Issue: No such script exists, Claude hallucinated based on pattern
```

**Prevention:** Verify all npm commands exist in `package.json` before documenting.

---

## Testing Checklist

Before considering any CLI/command change complete:

- [ ] **ZSH Test**: Run actual command in terminal (e.g., `/t add "test task"`)
- [ ] **Claude Test**: Ask Claude to explain/use the command
- [ ] **Documentation**: Verify `CLAUDE.md` mentions the command correctly
- [ ] **Code**: Confirm implementation in relevant `.js` file
- [ ] **NPM**: If applicable, verify script exists in `package.json`
- [ ] **MCP**: If using external tools, verify in `.mcp.json` or `.claude/settings.local.json`

---

## File Locations Reference

```
entries/
├── AGENT.md                          ← This file (architectural guidance)
├── CLAUDE.md                         ← Claude's primary instructions
├── .mcp.json                         ← MCP server config
├── .claude/
│   └── settings.local.json          ← Claude Code MCP tools
├── app/backend/
│   ├── daily-log-cli.js             ← Main CLI implementation
│   ├── statusline.js                ← Terminal status display
│   ├── time-tracker.js              ← Time tracking logic
│   └── package.json                 ← NPM scripts
└── ~/.zshrc                         ← User's shell config (EXTERNAL)
```

---

## Development Workflow

### For Adding New Features

1. **Design**: Plan the feature considering both environments
2. **Implement**: Code the functionality in backend files
3. **Expose in Shell**: Add/update `.zshrc` aliases or functions
4. **Expose in NPM**: Add scripts to `package.json` if needed
5. **Document for Claude**: Update `CLAUDE.md` with syntax and behavior
6. **Document for Agents**: Update this file if it affects architecture
7. **Test Both**: Verify in terminal AND with Claude
8. **Commit Together**: All changes in one logical unit

### For Debugging Issues

1. **Check Sync**: Compare `.zshrc`, `CLAUDE.md`, and actual code
2. **Verify Files**: Ensure file paths in `.zshrc` are correct
3. **Test Isolation**: Try command in terminal first, then via Claude
4. **Check Docs**: Look for outdated documentation causing confusion

---

## Why This Document Exists

This project is **unique** in that it serves as both:
- A **traditional CLI application** (used directly by the user in terminal)
- An **AI-mediated application** (used by Claude on behalf of the user)

Most applications are one or the other. This dual nature means:
- **The user** needs ZSH aliases for fast terminal access
- **Claude** needs clear documentation to understand available commands
- **Both** must agree on syntax, behavior, and available features

**When these environments drift apart, the user experience degrades.**

This file exists to prevent that drift and ensure smooth collaboration between:
- User ↔ Terminal (via `.zshrc`)
- User ↔ Claude (via `CLAUDE.md`)
- Claude ↔ Application (via code understanding and MCP)

---

## Quick Reference: Where to Update What

| Change Type | Files to Update |
|------------|-----------------|
| New `/t` command | `.zshrc`, `daily-log-cli.js`, `CLAUDE.md` |
| New context | `daily-log-cli.js`, `.zshrc`, `CLAUDE.md` (2 sections) |
| New npm script | `package.json`, `CLAUDE.md` |
| New journal type | Backend code, Supabase, `CLAUDE.md` (2 sections) |
| New MCP tool | `.mcp.json` or `.claude/settings.local.json`, `CLAUDE.md` if user-facing |
| Command syntax change | `.zshrc`, `CLAUDE.md`, test extensively |
| Context detection logic | `daily-log-cli.js`, `CLAUDE.md` auto-detection section |
| Task workflow change | `daily-log-cli.js`, `.zshrc`, `CLAUDE.md`, possibly Google Tasks integration |

### Current TODOs

**Pending Implementation:**
- `/t pull` - Command to pull favorited Google Tasks into daily log
- Google Calendar sync - Sync daily tasks with calendar for time blocking
- Complete Google Tasks → Daily Log → Calendar workflow

When implementing these, remember to update **all three** environments!

---

## For AI Agents Reading This

When you (Claude or another agent) are asked to modify this application:

1. **Always consider both environments** - terminal and AI assistant
2. **Always update documentation alongside code** - not as an afterthought
3. **Always test in both contexts** - ZSH commands AND npm scripts
4. **Never assume** - verify file paths, script names, and command syntax
5. **Ask if uncertain** - better to clarify than break the user's workflow

**Remember:** The user relies on this application multiple times per day, every day. Consistency and reliability across both environments is critical to their productivity.

