# LLM web-app generation study, November 2026 — data

Data from a study in which ten large language models each built small full-stack web applications
from the same 30 task specifications, under one agent harness and one resource budget. Every
generated app was built, started, tested against its task's acceptance checks, and scanned by 34
static and dynamic analyzers.

The platform that generated and analyzed the apps is
[AutoLLM_Code_Analyzer_rework](https://github.com/GrabowMar/AutoLLM_Code_Analyzer_rework)
(commit `900cc95`; `findings.csv` and `tables/` use the counting corrections of its pull request #145).
This repository holds the data only.

## Design

| | |
|---|---|
| Apps | 285 (one per model and task; no repeats) |
| Tasks | 30, each with a written specification, an API contract and acceptance checks (`task.json` in every run folder) |
| Stack | Flask backend + React frontend, from the starter `flask-react-minimal@1` |
| Harness | `opencode/1.18.35`, agentic, behind a recording gateway |
| Budget | 60 model requests per run, identical for every model |
| Generated | 2026-11-09 to 2026-11-11 |

| Model | Route | Apps | Tested | Build fail | Start fail | Cut off at the request cap |
|---|---|---|---|---|---|---|
| Claude Opus 5.5 | Anthropic API | 30 | 30 | 0 | 0 | 0 |
| Claude Sonnet 5.5 | Anthropic API | 30 | 30 | 0 | 0 | 0 |
| DeepSeek v4 Pro | OpenCode Go | 30 | 29 | 0 | 1 | 9 |
| DeepSeek v4.1 Flash | OpenCode Go | 30 | 30 | 0 | 0 | 19 |
| HY4 | OpenCode Go | 29 | 26 | 3 | 0 | 28 |
| MiMo v2.6 Flash | OpenCode Go | 30 | 30 | 0 | 0 | 21 |
| MiMo v2.6 Pro | OpenCode Go | 29 | 28 | 1 | 0 | 8 |
| MiniMax M3 | OpenCode Go | 30 | 30 | 0 | 0 | 30 |
| Qwen 3.8 Flash | OpenCode Go | 30 | 28 | 2 | 0 | 21 |
| GPT-6.1 Sol | OpenRouter | 17 | 17 | 0 | 0 | 5 |

These counts can be recomputed from `evaluations.csv` (`outcome`, `truncated`).

## Read this before comparing models

- **The request cap binds unevenly.** No Claude run reached the 60-request cap; most runs of five
  other models did. For those models the data describes what was delivered within 60 requests, not
  finished work. `truncated` marks the affected runs; report them separately.
- **One app per model and task.** Run-to-run variation cannot be separated from model differences.
  Task explains more of the variance in pass rate than model does.
- **GPT-6.1 Sol covers 17 of the 30 tasks.** That arm was stopped early for cost.
- **Model and route are confounded.** The three routes do not support the same request options.
- **Security findings are unverified tool output.** No injection vulnerability was confirmed by
  hand in any app. The ZAP SQL injection alerts that were checked were false positives. Wapiti rows
  with rule `internal-server-error` are plain HTTP 500 responses an attack payload provoked: a
  robustness signal, not a vulnerability. Several high-volume static rules (for example bandit `B608`) were false
  positives in every sample inspected. Treat counts as analyzer output, not as vulnerabilities.
- **Dynamic scans cover only apps that started** (278 of 285), over plain HTTP in a test
  deployment, so "HTTP only" and missing-header findings describe the deployment as much as the app.

## Layout

```
runs.csv            one row per app: model, task, stack, harness, outcome, tokens, timing
evaluations.csv     one row per app: outcome, acceptance pass rates, security probe counts
index.csv           run id -> folder
findings.csv        every analyzer finding counted by the study tables (13,923 rows)
tool_results.csv    every analyzer execution: status, duration, skip reason, scan scope
excluded_dirs.csv   directories left out of code/ (see Curation)
tables/
  common_tools/     study tables over the analyzers that measured every app
  all_tools/        the same tables including analyzers that measured only some apps (dynamic scanners)
runs/<model>/<task>__<run id prefix>/
  code/             the app as delivered
  files.csv         every path of the app tree: origin (starter / authored / modified), blob hash, source lines
  manifest.json     the frozen run manifest: model, sampling, budget, starter, prompts, evaluation plan
  task.json         the task specification the model was given
  resolved_lock.json  the dependency lock used for the build
  run.json          run record
  evaluation.json   build / start / test stages and per-check results of the evaluation in effect
  transcript/
    trajectory.json       parsed agent steps, tool calls, edits and shell commands
    calls.jsonl.zst       every model request and response through the gateway (zstd-compressed JSON lines)
    gateway_events.jsonl  gateway lifecycle and budget events
    harness.out           raw harness output
    changes.patch         diff of the delivered app against the starter
    exit.json, state.json, name_status.txt
```

### Tables

Each folder under `tables/` holds `issues_per_app.csv`, `issues_by_model.csv`, `issues_by_task.csv`,
`issues_by_model_task.csv`, `issues_by_tool.csv`, `issues_by_tool_rule.csv`, `tool_overlap.csv`,
`issue_clusters.csv` and `summary.json` (parameters, totals, tool coverage).

Findings from different tools about the same defect are merged into one issue. Counts are split by
where the issue sits: the model's own code, code inherited from the starter, tests, agent scratch
scripts, dependencies and the running app. Formatting-only rules and findings the tools raised at
their lowest confidence are counted in separate columns so they can be included or left out.
Severity columns named `*_normalized_*` are a heuristic mapping; `tool_severity` in `findings.csv`
is the label the tool itself printed.

## Curation

- **Installed third-party trees are not included in `code/`.** Some agents left Python virtual
  environments and, in one case, a browser cache inside the app folder (53 directories, about
  790 MB). They are listed in `excluded_dirs.csv`, and every one of their files still appears in the
  run's `files.csv` with its hash. The analyzers did not report findings in them.
- **Transcripts are from the attempt that produced the app.** 13 runs have two attempts;
  `index.csv` gives the attempt count and which attempt is included.
- **Findings are the latest result of each tool for each app**, which is what the tables count.
  Earlier pilot and superseded analysis runs are not included.
- **Evaluations are the one in effect** for each run (suite `eval-v2@2`).
- **Revision of 2026-11-13.** Two counting rules were corrected after the first publication and
  `findings.csv` and `tables/` were regenerated; nothing else changed. (1) The 13 Wapiti server-error
  rows carried the attack module (`sql`, `file`, `exec`) as their rule id and are now
  `internal-server-error`, which merges them into one runtime issue class per app (5 apps, 1–2 fewer
  runtime issues each; the module of each row is in the previous revision of `findings.csv`). (2) Seven duplicated blocks that exist only between app code and a test or
  scratch script were counted as app-code issues and are now counted with the test code (3 apps).
- **One third-party email address** printed by a package tool in one transcript was replaced with
  `redacted@example.com`. Nothing else was altered.

## Reading the compressed call logs

```
zstd -dc runs/<model>/<task>__<id>/transcript/calls.jsonl.zst | head -1 | python3 -m json.tool
```

## License

MIT, see `LICENSE`. It covers the data, tables and documentation in this repository, including the
generated application code. Third-party material quoted in the transcripts (package manager output,
library source excerpts) remains under its own terms.
