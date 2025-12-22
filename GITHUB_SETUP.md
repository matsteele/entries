# GitHub Setup Instructions

## Step 1: Create a New Repository on GitHub

1. Go to [GitHub.com](https://github.com) and sign in
2. Click the **+** icon in the top right, then **New repository**
3. Name your repository (e.g., `personal-productivity-system` or `entries`)
4. Choose **Private** (recommended for personal data)
5. **DO NOT** initialize with README, .gitignore, or license (we already have these)
6. Click **Create repository**

## Step 2: Connect Your Local Repository to GitHub

After creating the repository on GitHub, you'll see a page with setup instructions. Use the commands for **pushing an existing repository**:

```bash
cd /Users/matthewsteele/projects/currentProjects/entries

# Add your GitHub repository as the remote origin
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# OR if you prefer SSH (recommended):
git remote add origin git@github.com:YOUR_USERNAME/YOUR_REPO_NAME.git

# Push your code to GitHub
git push -u origin main
```

**Replace** `YOUR_USERNAME` and `YOUR_REPO_NAME` with your actual GitHub username and repository name.

## Step 3: Verify the Push

After pushing, refresh your GitHub repository page. You should see all your code files, but **NOT** your sensitive data like:
- ❌ daily-logs/
- ❌ time-logs/
- ❌ google_auth.json
- ❌ decisions.json, goals.json, relationships.json
- ❌ .env files

## Future Updates

After making changes to your code:

```bash
# Check what's changed
git status

# Stage your changes
git add .

# Commit with a message
git commit -m "Description of changes"

# Push to GitHub
git push
```

## SSH Setup (Optional but Recommended)

To avoid entering your password every time:

1. [Generate an SSH key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent)
2. [Add the SSH key to your GitHub account](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/adding-a-new-ssh-key-to-your-github-account)
3. Use the SSH URL when adding the remote (as shown above)

## Security Reminder

✅ **Your .gitignore is configured to protect:**
- All personal logs and daily data
- Authentication files and API keys
- Time tracking information
- Personal goals and decisions
- Environment variables

Always review what's being committed with `git status` before pushing!

