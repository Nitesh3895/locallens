---
name: git-multi-account-setup
description: Set up a separate GitHub account for a specific local repo without affecting the global git config or office/work account. Use when the user wants to push to a personal GitHub from a work machine, use multiple git accounts, or isolate git credentials per folder.
---
NEW_TOKEN =

# Git Multi-Account Setup (PAT-Based, Folder-Scoped)

Set up a **separate GitHub account** for one specific local folder using HTTPS + Personal Access Token. The global/work git config remains completely untouched.

## Prerequisites

- Git installed
- A GitHub account for the personal repo
- A Personal Access Token (PAT) from that account

## How to Generate a PAT

1. Log in to the **personal** GitHub account
2. Go to **Settings > Developer settings > Personal access tokens > Tokens (classic)**
   - URL: `https://github.com/settings/tokens`
3. Click **"Generate new token (classic)"**
4. Name: something descriptive (e.g., `my-project-local`)
5. Scopes: check **`repo`** (full control of private repositories)
6. Generate and **copy the token immediately** (it won't be shown again)

## Setup Steps

### Step 1: Initialize git (if not already)

```bash
cd /path/to/your/project
git init
```

### Step 2: Set local user identity

These only apply inside this folder. Global config is untouched.

```bash
git config --local user.name "YourGitHubUsername"
git config --local user.email "your-personal-email@example.com"
```

### Step 3: Set up isolated credential storage

This stores credentials inside `.git/` — invisible to all other repos.

```bash
git config --local credential.helper 'store --file=.git/.credentials'
git config --local credential.useHttpPath true
```

### Step 4: Add the remote

```bash
git remote add origin https://github.com/YourUsername/your-repo.git
```

### Step 5: Store the PAT

Replace `YOUR_PAT` with the actual token, `YourUsername` with GitHub username, and the repo URL.

```bash
echo "https://YourUsername:YOUR_PAT@github.com/YourUsername/your-repo.git" > .git/.credentials
```

### Step 6: First push

```bash
git add .
git commit -m "Initial commit"
git push --set-upstream origin main
```

## Verification

Run this to confirm local vs global are separate:

```bash
echo "=== This repo ===" && git config --local user.name && git config --local user.email
echo "=== Global (should be work account) ===" && git config --global user.name && git config --global user.email
```

## How It Works

| Setting | Scope | Where stored |
|---------|-------|-------------|
| `user.name` / `user.email` | This folder only | `.git/config` |
| `credential.helper` | This folder only | `.git/config` |
| PAT credentials | This folder only | `.git/.credentials` (inside `.git/`, not tracked) |
| Global git config | All other repos | `~/.gitconfig` (untouched) |

## Key Safety Points

- `.git/.credentials` lives **inside** `.git/` — it's never committed or visible to other repos
- `credential.useHttpPath true` prevents credential leaking to other GitHub URLs
- No global config is modified — `git config --local` is always used
- Other repos on the same machine continue using the global/work account

## Rotating a PAT

If a token is compromised or expires:

1. Revoke the old token at `https://github.com/settings/tokens`
2. Generate a new one with the same scopes
3. Update the local credentials:

```bash
echo "https://YourUsername:NEW_TOKEN@github.com/YourUsername/your-repo.git" > .git/.credentials
```

## Troubleshooting

**Push uses wrong account?**
```bash
git config --local user.name   # should show personal username
git config --local user.email  # should show personal email
```

**Authentication fails?**
```bash
cat .git/.credentials   # verify the token URL is correct
```

**Want to check nothing leaked globally?**
```bash
git config --global credential.helper   # should NOT show the store file
```


**to update the token**
```bash
cd "/Users/nitesh.kumar/Downloads/copy files/iphone_syncer"
echo "https://Nitesh3895:TOKEN@github.com/..." > .git/.credentials
git push --force origin main
```