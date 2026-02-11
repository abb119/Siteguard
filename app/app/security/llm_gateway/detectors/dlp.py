"""
Data Loss Prevention (DLP) detector — PII and secret redaction.
"""
import re
import math
from typing import Dict, List, Tuple


# (regex, type, redaction template)
PII_PATTERNS: List[Tuple[str, str, str]] = [
    (r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b", "email", "[REDACTED_EMAIL]"),
    (r"\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b", "phone", "[REDACTED_PHONE]"),
    (r"\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b", "ssn", "[REDACTED_SSN]"),
    (r"\b(?:\d{4}[-\s]?){3}\d{4}\b", "credit_card", "[REDACTED_CC]"),
    (r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b", "ipv4", "[REDACTED_IP]"),
]

# Known API key patterns
SECRET_PATTERNS: List[Tuple[str, str, str]] = [
    (r"sk-[a-zA-Z0-9]{20,}", "openai_key", "sk-****"),
    (r"ghp_[a-zA-Z0-9]{36,}", "github_token", "ghp_****"),
    (r"AKIA[0-9A-Z]{16}", "aws_access_key", "AKIA****"),
    (r"xox[bpas]-[a-zA-Z0-9-]+", "slack_token", "xox*-****"),
    (r"AIza[0-9A-Za-z_-]{35}", "google_api_key", "AIza****"),
    (r"Bearer\s+[a-zA-Z0-9_.~+/=-]{20,}", "bearer_token", "Bearer ****"),
]


def _shannon_entropy(s: str) -> float:
    """Calculate Shannon entropy for high-entropy secret detection."""
    if not s:
        return 0.0
    freq = {}
    for c in s:
        freq[c] = freq.get(c, 0) + 1
    length = len(s)
    return -sum((count / length) * math.log2(count / length) for count in freq.values())


def detect_dlp(text: str) -> Dict:
    """
    Scan text for PII and secrets. Returns hits and redacted version.
    """
    hits = []
    redacted = text

    # PII scan
    for pattern, pii_type, redacted_template in PII_PATTERNS:
        for match in re.finditer(pattern, text):
            original = match.group()
            hits.append({
                "type": pii_type,
                "original": original,
                "redacted": redacted_template,
                "position": match.start(),
            })
            redacted = redacted.replace(original, redacted_template, 1)

    # Secret scan
    for pattern, secret_type, redacted_template in SECRET_PATTERNS:
        for match in re.finditer(pattern, text):
            original = match.group()
            hits.append({
                "type": secret_type,
                "original": original[:8] + "***",
                "redacted": redacted_template,
                "position": match.start(),
            })
            redacted = redacted.replace(original, redacted_template, 1)

    # High-entropy substring detection (generic secrets)
    words = text.split()
    for word in words:
        if len(word) >= 20 and _shannon_entropy(word) > 4.0:
            # Likely a secret/token
            if not any(h["position"] == text.find(word) for h in hits):
                hits.append({
                    "type": "high_entropy_secret",
                    "original": word[:8] + "***",
                    "redacted": "[REDACTED_SECRET]",
                    "position": text.find(word),
                })
                redacted = redacted.replace(word, "[REDACTED_SECRET]", 1)

    return {
        "hits": hits,
        "hit_count": len(hits),
        "redacted_text": redacted,
        "has_pii": any(h["type"] in ("email", "phone", "ssn", "credit_card") for h in hits),
        "has_secrets": any(h["type"] not in ("email", "phone", "ssn", "credit_card", "ipv4") for h in hits),
    }
