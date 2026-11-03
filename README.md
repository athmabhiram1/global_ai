# Context Curator

**A Bifrost plugin that decides which sources are allowed to speak to your model.**

> Compression asks how few tokens. We ask which sources are allowed to speak.

---

## The problem

Your agent searched the web, called four tools, and pasted all of it into the prompt.
Some of it is a current primary source. Some of it is a stale blog post. Some of it is a
domain you would never trust. The gateway forwarded all of it without an opinion, and when
the answer is wrong nobody can say which chunk caused it.

Every existing tool solves one slice:

| Tool | What it does | What it does not do |
|---|---|---|
| Prompt compressors | Shrink text | Decide whether the text deserved to be there |
| Rerankers | Reorder chunks | Drop anything, or explain a drop |
| RAG frameworks | Filter at retrieval time | Apply one policy across every app behind a gateway |
| Guardrails | Block unsafe content | Judge source authority or freshness |

Context Curator sits **in the request path of the gateway** and enforces one source policy
across every application, deterministically, with a reason code for every decision.

## What it does

For each request, before the provider is called:

1. **Segments** candidate context out of tool results and explicit `<context>` blocks.
   User-authored prose is never touched.
2. **Attributes** each chunk to a source: URL, domain, fetch time, content hash.
3. **Scores** it on relevance, authority, freshness, independence, and learned utility.
4. **Enforces** policy: denied domains, maximum age per freshness class, minimum independent
   sources, and a context token budget.
5. **Refreshes** stale chunks through Tavily, within a per-request credit budget.
6. **Rewrites** the request, keeping the chunks that earned their place.
7. **Records** every keep and drop, with a reason.

Then, on demand, it can **prove** a decision: replay the same request with one chunk removed
and diff the answer at sentence level. If the answer changes, that chunk mattered.

## Why this is not another wrapper

The admission path contains **no LLM**. Weights are fixed, published, and tested with golden
values. The same request, policy, and reputation table always produce the same decision.

The LLM is used in exactly one place: off the request path, when a human asks the system to
explain or re-verify something. *Deterministic where trust is decided, AI where language is
understood.*

## Quickstart

```bash
docker run --rm -p 8080:8080 -p 8090:8090 \
  -e OPENAI_API_KEY=sk-... \
  -e TAVILY_API_KEY=tvly-... \
  ghcr.io/athmabhiram/context-curator:latest
```

| Port | What |
|---|---|
| `8080` | Bifrost gateway (OpenAI-compatible) with the plugin loaded |
| `8090` | Context Curator UI and API |

Point any OpenAI SDK at `http://localhost:8080/v1` and nothing else changes. The gateway
curates the context on the way through.

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-4o-mini",
    "messages": [
      {"role": "system", "content": "Answer using only the provided context."},
      {"role": "user", "content": "How much is the Pro plan?"},
      {"role": "tool", "tool_call_id": "c1", "content": "Pro is $49/seat/month. Source: https://example.com/pricing (fetched 2026-11-03)"}
    ]
  }'
```

Then open <http://localhost:8090> to see what was kept, what was dropped, and why.

## Build from source

Requires Docker only. Go and Node are not needed on the host.

```bash
git clone https://github.com/athmabhiram/context-curator
cd context-curator
docker build -t context-curator:dev .
docker run --rm -p 8080:8080 -p 8090:8090 \
  -e OPENAI_API_KEY=sk-... -e TAVILY_API_KEY=tvly-... \
  context-curator:dev
```

The image builds Bifrost from a pinned upstream commit with dynamic linking enabled, compiles
the plugin as a Go shared object against the same module graph, and ships both in one
container with the sidecar. Same Debian release on both sides, so the plugin and the binary
never disagree about libc.

## How it is put together

```
                    ┌─────────────────────────────────────────┐
   your app ───────►│  Bifrost :8080                          │
                    │    └─ contextcurator.so  (PreRequestHook)│──────► OpenAI
                    │         segment → score → select → rewrite│
                    └───────────────┬─────────────────────────┘
                                    │ decisions
                                    ▼
                    ┌─────────────────────────────────────────┐
                    │  cc-sidecar :8090                        │
                    │    UI · decisions · autopsy · reputation │
                    └───────────────┬─────────────────────────┘
                                    │
                              SQLite (/data)
```

The plugin runs **once per request**, inside Bifrost, before routing. Mutations it makes to
the request are committed and observed by the provider call and by every fallback attempt.

The sidecar exists because a Go plugin cannot register HTTP routes. It serves the UI and the
API, and shares one SQLite database with the plugin.

## Configuration

Policy lives next to Bifrost's config at `/data/bifrost/config.json`, in the plugin's `config`
block. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §8 for the full schema.

```json
{
  "plugins": [{
    "name": "context-curator",
    "enabled": true,
    "path": "/plugins/contextcurator.so",
    "placement": "pre_builtin",
    "order": 10,
    "config": {
      "enabled": true,
      "mode": "rewrite",
      "budget": { "max_context_tokens": 4000, "max_chunks": 8 },
      "freshness": { "classes": { "price": 24, "version": 720, "law": 168 } },
      "authority": { "deny": ["content-farm.example"] },
      "independence": { "min_sources": 2 }
    }
  }]
}
```

Modes:

| Mode | Behaviour |
|---|---|
| `annotate` | Record decisions, change nothing. The safe default. |
| `rewrite` | Drop inadmissible chunks. |
| `block` | Reject the request when policy is violated. |

## Drop reason codes

Every dropped chunk carries exactly one:

`stale` · `duplicate_of:<id>` · `authority_denied` · `low_relevance` · `over_budget` ·
`policy_min_sources` · `refresh_failed` · `provenance_unknown`

A decision with a drop and no reason is a bug, and the type system enforces it.

## Tavily

Tavily is the freshness oracle. When a chunk is older than its class allows, the curator
refreshes it through Bifrost's relay (`/relay/tavily/search`), so the traffic is priced,
budgeted, and logged by the gateway itself, with direct HTTP as the fallback.

A Tavily outage degrades the decision to `annotate` and marks affected chunks
`refresh_failed`. It never blocks a request.

## Documentation

| Document | Contents |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | Problem, users, requirements, metrics, demo |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Components, hooks, data model, scoring, Docker |
| [`docs/VERIFICATION.md`](docs/VERIFICATION.md) | Prior-art audit and the corrections it forced |
| [`docs/SETUP.md`](docs/SETUP.md) | Detailed setup and operation |
| [`docs/superpowers/plans/`](docs/superpowers/plans/) | Wave-by-wave implementation plan |

## Status

Built during the Geek Room Global AI Hackathon, November 2026.

- Bifrost track: plugin, extension points, setup docs, tests.
- Tavily track: pre-emptive stale-source detection with per-chunk freshness scores.

## Licence

Apache 2.0, matching Bifrost.
