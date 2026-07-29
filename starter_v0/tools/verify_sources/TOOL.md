---
name: verify_sources
track: core
kind: live_api
provider: Firecrawl
requires_env: [FIRECRAWL_API_KEY]
inputs: [claim, urls]
outputs: [sources, overall_verdict, limitations]
side_effect: false
---
# verify_sources

Checks a factual claim against one to five HTTP(S) URLs explicitly supplied by
the user. It reads each URL through Firecrawl, then returns a deterministic
source tier and an evidence verdict.

- `tier_1`: allowlisted primary/research domains and government/regulatory domains.
- `tier_2`: allowlisted reporting domains.
- `tier_3`: social platforms and unrecognized domains; signal only, not verified fact.

The tool does not search for new sources. It returns one error per unreadable or
invalid URL and continues with the remaining URLs. Its `supports`,
`contradicts`, and `insufficient` verdicts are heuristics; users must inspect
the cited sources before publishing.
