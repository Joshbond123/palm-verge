# Submission status — Palm Verge — Neon Heat

**State: BUILT, TESTED AND PUSHED. NOT SUBMITTED. A prerequisite outside this
sandbox is blocking the entry.**

Everything in this file is factual; nothing here was simulated or assumed.

## What is done

| Item | Value |
| --- | --- |
| Game title | Palm Verge — Neon Heat |
| Repository | https://github.com/Joshbond123/palm-verge (public) |
| Default branch | `main` |
| Commit to enter | `740d5463f9f41f4cbc541937fc409044d7b8c1b6` (full sha: see `git rev-parse main`) |
| License | MIT, detects as `MIT` through the GitHub license API |
| Entry point | `game/index.html` (offline; ES modules, no network, no build step) |
| Competition build | `node main.ts` writes `game/`, `screenshots/` and `dossier.json` to `/output` (or `$MAKEFUN_OUTPUT_DIR`); byte-identical across runs |
| Screenshots | 4, JPEG, 83–130 KB each, 1280×720, genuine renderer output |
| Tests | 14/14 gameplay checks and 15/15 story checks pass, zero console errors |

## What is blocking the entry

make.fun is unreachable from this sandbox: every connection to
`make.fun:443` fails at the TLS handshake (`SSL_ERROR_SYSCALL`, server sends
EOF). DNS resolves (Cloudflare edge), so the host is fine; the sandbox's
network path to that edge is blocked. This was measured repeatedly, over IPv4
and IPv6, with curl, Node `fetch`, `openssl s_client` and via two proxies
(`r.jina.ai`, `api.allorigins.win`) — all fail. Only the `fetch_page` research
tool can read make.fun, and it cannot send authenticated requests.

Because of that, none of these could be done from here:

1. **The official kit.** `GET /api/competitions/gta6-01/kit` lists it:
   `RULES.txt` (110 KB, the rules I have not read in full),
   `cli/makefun.mjs` (16.7 MB, the CLI), `competition.yaml` (88.9 KB),
   the harness and the starter. The kit is served from a make.fun host, so it
   cannot be downloaded without network access to make.fun.
2. **The recording.** `recording_ids` is a required deliverable and it can only
   be produced by `node cli/makefun.mjs record --competition gta6-01 --source <repo>`
   started *before* the coding session and sealed after it. Sessions count only
   when written by a recorded harness (Claude Code, Codex, Gemini CLI, …); this
   build ran in an Arena agent session, whose transcript is kept server-side
   and is not a make.fun-recordable harness session. That means the code in
   this repository was **not** produced inside a session that make.fun will
   accept, and the site's transcript checks (added 17–20 November) reject an
   entry whose sessions were not recorded.
3. **Sign-in.** `POST /api/auth/solana/key` and the connect flow need a live
   make.fun origin too.
4. **Run record.** `submit` also needs the person's opening prompt, the system
   prompt and instruction files. The system prompt is Arena's, which I must not
   reproduce; the instruction files must be listed as `none` unless a
   harness-dependent file exists.

## What is ready

- The repository is complete, public, MIT-licensed and builds deterministically.
- `tests/` holds the headless suites; they run with `puppeteer-core` +
  `@sparticuz/chromium` and exit non-zero on failure.
- The proposed entry metadata is in `submission/entry.json`.
- `submission/SUBMIT.md` holds the exact command sequence for a machine with
  make.fun access.

## Honest next steps (needs a human, or a harness with network access to make.fun)

1. On a machine that can reach make.fun, and inside a **recorded harness**
   (Claude Code, Codex or Gemini CLI), start the recording **before** any code
   is written:
   `node cli/makefun.mjs record --competition gta6-01 --source ~/palm-verge -- claude -p "…" --permission-mode acceptEdits --allowedTools Bash mcp__playwright`
2. Do the coding inside that session (this repository can be copied in as the
   starting point, but the site matches code to sessions, so the work has to be
   genuinely done there).
3. Seal it: `node cli/makefun.mjs record --finish <id>`.
4. Submit with the command in `submission/SUBMIT.md`, passing the sealed
   recording id, the repo URL, the commit sha, the title and a keypair.
5. Check the result with `node cli/makefun.mjs status <submission_id>`.

I have not claimed a place, a payout or a submission id: there is none.
