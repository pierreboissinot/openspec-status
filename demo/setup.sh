#!/usr/bin/env bash
# Builds the throwaway project and Claude Code home that demo/demo.tape records,
# then prints the path of the env file to source.
set -euo pipefail

plugin="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
root="${1:?usage: demo/setup.sh <empty dir>}"
mkdir -p "$root/home/acme-app"
root="$(cd "$root" && pwd)"
project="$root/home/acme-app"

export GIT_AUTHOR_NAME=demo GIT_AUTHOR_EMAIL=demo@example.com
export GIT_COMMITTER_NAME=demo GIT_COMMITTER_EMAIL=demo@example.com

cd "$project"
git init --quiet --initial-branch main
HOME="$root/home" openspec init --tools none --no-animation . > /dev/null 2>&1

change() {
  local name="$1" done="$2"
  shift 2
  HOME="$root/home" openspec new change "$name" > /dev/null 2>&1
  printf '## Why\n\n%s\n' "$name" > "openspec/changes/$name/proposal.md"
  {
    echo "## Tasks"
    echo
    local i=0
    for task in "$@"; do
      i=$((i + 1))
      if [ "$i" -le "$done" ]; then echo "- [x] $i. $task"; else echo "- [ ] $i. $task"; fi
    done
  } > "openspec/changes/$name/tasks.md"
}

spec() {
  local name="$1"
  shift
  mkdir -p "openspec/specs/$name"
  {
    printf '# %s Specification\n\n## Purpose\n\nWhat %s covers.\n\n## Requirements\n' "$name" "$name"
    for requirement in "$@"; do
      printf '\n### Requirement: %s\nThe app SHALL %s.\n\n#### Scenario: %s\n- **WHEN** it applies\n- **THEN** the app does it\n' \
        "$requirement" "$requirement" "$requirement"
    done
  } > "openspec/specs/$name/spec.md"
}

spec theming "follow the system theme" "remember the chosen theme"
spec login "return to the requested page" "refuse an external return URL" "lock after five failures"

change add-dark-mode 3 \
  "Add the theme tokens" "Read the system preference" "Add the settings toggle" \
  "Persist the choice" "Theme the charts" "Update the screenshots" "Document the toggle"
change fix-login-redirect 4 \
  "Keep the return URL" "Validate it against the allow list" "Redirect after login" "Cover the open-redirect case"

git add --all
git commit --quiet --message "Plan dark mode and the login redirect fix"
git branch fix-login-redirect
git switch --quiet --create add-dark-mode

key=sk-ant-demo-placeholder-key
cat > "$root/home/.claude.json" <<EOF
{
  "hasCompletedOnboarding": true,
  "theme": "dark",
  "customApiKeyResponses": { "approved": ["${key: -20}"], "rejected": [] },
  "projects": {
    "$project": { "hasTrustDialogAccepted": true, "hasCompletedProjectOnboarding": true }
  }
}
EOF

# The demo only runs local commands. The unreachable base URL makes sure no API call
# is ever made, and keeps the remote-settings 401 warning out of the header.
cat > "$root/env.sh" <<EOF
for name in \$(compgen -e | grep -E '^(CLAUDECODE|CLAUDE_CODE_)'); do unset "\$name"; done
export HOME="$root/home"
export ANTHROPIC_API_KEY=$key
export ANTHROPIC_BASE_URL=http://127.0.0.1:9
export CLAUDE_CODE_PLUGIN_DIRS="$plugin"
export DISABLE_AUTOUPDATER=1
export PS1='\$ '
cd "$project"

# Edits the project behind the session's back: a task ticked after \$1 s, then, given \$2, a branch switch \$2 s later.
demo_changes() {
  ( sleep "\$1"; sed -i 's/- \[ \] 4\./- [x] 4./' openspec/changes/add-dark-mode/tasks.md
    [ -z "\${2:-}" ] || { sleep "\$2"; git switch --quiet fix-login-redirect; } ) > /dev/null 2>&1 &
}
EOF

echo "$root/env.sh"
