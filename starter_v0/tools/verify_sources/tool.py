from __future__ import annotations

import ipaddress
from typing import Any
from urllib.parse import urlparse

from tools._shared import domain, err, terms
from tools.fetch.tool import read_url


MAX_URLS = 5
SOCIAL_DOMAINS = {"x.com", "twitter.com", "reddit.com", "youtube.com", "facebook.com", "linkedin.com"}
PRIMARY_DOMAINS = {
    "anthropic.com", "arxiv.org", "deepmind.google", "google.com",
    "microsoft.com", "openai.com", "openreview.net",
}
REPORTING_DOMAINS = {"apnews.com", "bbc.com", "nytimes.com", "reuters.com", "techcrunch.com", "theverge.com", "wired.com"}
NEGATION_TERMS = {"no", "not", "never", "false", "deny", "denied", "khong", "chua"}


def _matches_domain(value: str, candidates: set[str]) -> bool:
    return any(value == candidate or value.endswith(f".{candidate}") for candidate in candidates)


def _valid_url(value: Any) -> tuple[str | None, str | None]:
    if not isinstance(value, str) or not value.strip():
        return None, "URL must be a non-empty string"

    try:
        parsed = urlparse(value.strip())
        host = (parsed.hostname or "").lower()
    except ValueError:
        return None, "URL is malformed"
    if parsed.scheme not in {"http", "https"} or not host:
        return None, "URL must be an absolute HTTP(S) URL"
    if host == "localhost" or host.endswith(".localhost"):
        return None, "Localhost URLs are not allowed"

    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return parsed.geturl(), None
    if not address.is_global:
        return None, "Non-public IP URLs are not allowed"
    return parsed.geturl(), None


def _source_tier(url: str) -> tuple[str, str]:
    host = (urlparse(url).hostname or "").lower()
    if _matches_domain(host, SOCIAL_DOMAINS):
        return "tier_3", "Social platforms are Tier 3 signals, not verified evidence."
    if _matches_domain(host, PRIMARY_DOMAINS) or host.endswith(".gov") or host.endswith(".gov.uk") or host.endswith(".europa.eu"):
        return "tier_1", "Official, regulatory, or primary research source domain."
    if _matches_domain(host, REPORTING_DOMAINS):
        return "tier_2", "Recognized reporting domain."
    return "tier_3", "Domain is not on the primary-source or reporting allowlist."


def _evidence_verdict(claim: str, text: str) -> str:
    claim_terms = terms(claim)
    evidence_terms = terms(text)
    overlap = claim_terms & evidence_terms
    minimum_overlap = max(1, (len(claim_terms) + 1) // 2)
    if len(overlap) < minimum_overlap:
        return "insufficient"
    if NEGATION_TERMS & evidence_terms:
        return "contradicts"
    return "supports"


def _excerpt(text: str, limit: int = 320) -> str:
    compact = " ".join((text or "").split())
    return compact if len(compact) <= limit else compact[: limit - 3] + "..."


def _overall_verdict(sources: list[dict[str, Any]]) -> str:
    verdicts = {source.get("verdict") for source in sources}
    if "supports" in verdicts and "contradicts" in verdicts:
        return "mixed"
    has_reliable_support = any(
        source.get("verdict") == "supports" and source.get("tier") in {"tier_1", "tier_2"}
        for source in sources
    )
    if has_reliable_support and verdicts <= {"supports", "insufficient", "error"}:
        return "verified"
    return "unverified"


def verify_sources(claim: str = "", urls: list[str] | None = None) -> dict[str, Any]:
    try:
        if not isinstance(claim, str) or not claim.strip():
            raise ValueError("claim is required")
        if not isinstance(urls, list) or not urls:
            raise ValueError("urls must contain at least one URL")
        if len(urls) > MAX_URLS:
            raise ValueError(f"urls must contain at most {MAX_URLS} URLs")

        sources: list[dict[str, Any]] = []
        seen: set[str] = set()
        for raw_url in urls:
            url, validation_error = _valid_url(raw_url)
            if validation_error or not url:
                sources.append({
                    "input_url": raw_url, "tier": None, "tier_reason": None, "verdict": "error",
                    "evidence_excerpt": "", "error": validation_error,
                })
                continue
            if url in seen:
                continue
            seen.add(url)

            tier, tier_reason = _source_tier(url)
            fetched = read_url(url)
            if fetched.get("error"):
                sources.append({
                    "input_url": raw_url, "url": url, "domain": domain(url), "tier": tier,
                    "tier_reason": tier_reason, "verdict": "error", "evidence_excerpt": "",
                    "error": fetched.get("message") or fetched["error"],
                })
                continue

            item = (fetched.get("items") or [{}])[0]
            summary = str(item.get("summary") or "")
            sources.append({
                "input_url": raw_url,
                "url": item.get("url") or url,
                "title": item.get("title") or url,
                "domain": domain(item.get("url") or url),
                "tier": tier,
                "tier_reason": tier_reason,
                "verdict": _evidence_verdict(claim, summary),
                "evidence_excerpt": _excerpt(summary),
                "error": None,
            })

        return {
            "tool": "verify_sources",
            "claim": claim,
            "sources": sources,
            "overall_verdict": _overall_verdict(sources),
            "limitations": [
                "Source tiers and evidence verdicts use deterministic heuristics.",
                "Inspect cited sources before publishing factual claims.",
            ],
        }
    except Exception as exc:
        return err("verify_sources", exc)
