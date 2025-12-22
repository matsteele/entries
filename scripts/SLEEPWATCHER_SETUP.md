# Sleepwatcher Auto-Pause Setup

This guide explains how to set up automatic task pausing when your laptop goes to sleep.

## What This Does

When you close your laptop lid (putting it to sleep), the current task in your daily log will automatically:
- Be moved to pending tasks
- Have time tracked and saved
- Get a note added: "Auto-paused (laptop sleep)"

## Prerequisites

- macOS (sleepwatcher is a macOS-specific tool)
- Homebrew installed

## Setup Instructions

### 1. Install sleepwatcher

```bash
brew install sleepwatcher
```

### 2. Configure sleepwatcher to use our script

Create a `.sleep` file in your home directory that points to our pause script:

```bash
echo "/Users/matthewsteele/projects/currentProjects/entries/scripts/on-sleep.sh" > ~/.sleep
chmod +x ~/.sleep
```

### 3. Start the sleepwatcher service

```bash
brew services start sleepwatcher
```

That's it! Sleepwatcher is now running and will call our pause script whenever your Mac goes to sleep.

## Verify It's Working

1. Start a task: `npm run log:current "Test task for sleepwatcher"`
2. Close your laptop lid for a few seconds
3. Open it back up
4. Check the log: `npm run log:show`
5. You should see "Test task for sleepwatcher" in pending tasks with a note: "Auto-paused (laptop sleep)"

## Managing the Service

### Check if sleepwatcher is running:
```bash
brew services list | grep sleepwatcher
```

### Stop sleepwatcher:
```bash
brew services stop sleepwatcher
```

### Restart sleepwatcher:
```bash
brew services restart sleepwatcher
```

### View sleepwatcher logs:
```bash
tail -f /usr/local/var/log/sleepwatcher.log
```

## Uninstall

If you want to remove this feature:

1. Stop the service:
   ```bash
   brew services stop sleepwatcher
   ```

2. Remove the configuration:
   ```bash
   rm ~/.sleep
   ```

3. (Optional) Uninstall sleepwatcher completely:
   ```bash
   brew uninstall sleepwatcher
   ```

## Troubleshooting

### Script not running on sleep

1. Check if sleepwatcher is running:
   ```bash
   brew services list | grep sleepwatcher
   ```

2. Verify the `.sleep` file exists and points to the correct script:
   ```bash
   cat ~/.sleep
   ```

3. Make sure the script is executable:
   ```bash
   ls -l /Users/matthewsteele/projects/currentProjects/entries/scripts/on-sleep.sh
   ```
   (Should show `-rwxr-xr-x`)

4. Test the script manually:
   ```bash
   /Users/matthewsteele/projects/currentProjects/entries/scripts/on-sleep.sh
   ```

### Permission issues

If you see permission errors, make sure both files are executable:

```bash
chmod +x ~/.sleep
chmod +x /Users/matthewsteele/projects/currentProjects/entries/scripts/on-sleep.sh
```

## How It Works

1. **sleepwatcher** is a macOS daemon that monitors system sleep/wake events
2. When your Mac goes to sleep, sleepwatcher reads `~/.sleep` for a command to run
3. It executes our script: `/Users/matthewsteele/projects/currentProjects/entries/scripts/on-sleep.sh`
4. Our script runs: `npm run log:pause-current --silent`
5. The pause-current command moves your current task to pending with the time tracked

## Notes

- **Silent mode**: The `--silent` flag prevents npm from showing unnecessary output
- **Brief closures**: Currently, any sleep event triggers the pause (even brief lid closures). Future enhancement could add a minimum task duration threshold
- **No current task**: If there's no current task when sleep occurs, the script exits silently without error
