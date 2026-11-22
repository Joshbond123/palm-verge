# Submitting Palm Verge — Neon Heat

Run these on a machine with network access to `make.fun`, **inside the same
recorded harness session that wrote the code**. Do not skip step 1: the
competition rejects an entry with no sealed recording, and the recording must
start before any code is written.

```bash
# 0. Kit (once): unpack the official kit for gta6-01 somewhere outside the repo.
#    GET https://make.fun/api/competitions/gta6-01/kit  -> kit.json (manifest)
#    GET https://make.fun/c/gta6-01/kit                 -> the kit tarball
cd kit

# 1. Start the recording BEFORE writing code, then build inside it.
node cli/makefun.mjs record --competition gta6-01 --source ~/palm-verge -- \
  claude -p "<the person's prompt, word for word>" \
  --permission-mode acceptEdits --allowedTools Bash mcp__playwright

# 2. When the build is done, seal it.  --finish runs on the same machine, as the
#    same user, with the same environment and git config that recorded it.
node cli/makefun.mjs record --finish <recording-id>

# 3. Confirm the recording is sealed and note the id.
node cli/makefun.mjs recordings --competition gta6-01

# 4. Submit.
node cli/makefun.mjs submit --competition gta6-01 \
  --recording <recording-id> \
  --repo-url https://github.com/Joshbond123/palm-verge \
  --commit 740d5463f9f41f4cbc541937fc409044d7b8c1b6 \
  --title "Palm Verge — Neon Heat" \
  --keypair ~/makefun-keypair.json \
  --repo ~/palm-verge

# 5. Keep the id from step 4 and check it.
node cli/makefun.mjs status <submission-id>
```

Notes that matter:

- `--repo ~/palm-verge` lets `submit` reconstruct the run record from your
  copies of the recorded sessions in the repository.
- The system prompt must be passed (`--system-prompt <file>`, redacted of
  anything private but never cut down to a summary) unless a recorded session
  already carries it. An entry with no system prompt is rejected.
- Instruction files: `submit` collects `CLAUDE.md` / `AGENTS.md` if it finds
  them. This repository has none, so `--instructions none` is correct.
- MCP: this bounty's prerequisites name Playwright MCP. If the recorded session
  used it, allow it with `mcp__playwright` in `--allowedTools` (as above) and
  pass `--mcp playwright=@playwright/mcp@0.0.85` if `submit` cannot read it from
  the harness config.
- If a different session started the build (an orchestrator, a resumed chat),
  every parent link up to the person's own prompt has to be sent, up to four.
- Quota: 5 entries a day, 50 a day per account and 40 per account in total for
  this bounty; the newest entry replaces earlier ones unless you pin an earlier
  one with `node cli/makefun.mjs final gta6-01 <submission-id>`.

## The build itself

The repository is ready to enter as-is. To rebuild and re-verify it:

```bash
node --version            # must be 22.18 or newer
node main.ts              # writes game/, screenshots/, dossier.json to /output
                          # (or $MAKEFUN_OUTPUT_DIR); identical bytes each run
node serve.ts             # http://127.0.0.1:8080 for manual play

# Headless suites (need puppeteer-core + @sparticuz/chromium, or local Chrome)
node tests/gameplay.test.mjs      # 14 checks: movement, cars, police, combat, save
node tests/story.test.mjs         # 15 checks: all six missions to story complete
node tests/screenshots.mjs        # re-capture screenshots/ deterministically
```
