"""
Prompt injection detector — weighted keyword scoring.
Returns a 0..1 injection score.
"""
import re
from typing import Dict, List, Tuple

# (pattern, weight, description)
INJECTION_SIGNALS: List[Tuple[str, float, str]] = [
    (r"ignore\s+(previous|all|above|prior|your|the)\s+(instructions?|rules?|prompts?|safety|guidelines?)", 0.40, "Instruction override attempt"),
    (r"ignore\s+(rules?|instructions?|safety|policies?)", 0.35, "Bare ignore command"),
    (r"(disregard|forget|bypass)\s+(your|the|all)\s+(instructions?|rules?|guidelines?|policy|safety)", 0.40, "Policy bypass attempt"),
    (r"(bypass|override|circumvent)\s+(all\s+)?(safety|security|restrictions?|filters?|protections?)", 0.40, "Safety bypass attempt"),
    (r"act\s+as\s+(a\s+)?(system|admin|root|developer|unrestricted)", 0.30, "Role impersonation"),
    (r"you\s+are\s+now\s+(a\s+)?", 0.25, "Identity override"),
    (r"(reveal|show|display|print|output)\s+(your|the|hidden|secret|system|all)\s*(prompt|instructions?|rules?|config)?", 0.45, "System prompt extraction"),
    (r"(reveal|show|display|print)\s+.{0,20}(system\s*prompt|instructions?|rules?)", 0.40, "Indirect prompt extraction"),
    (r"pretend\s+(you|that)\s+(are|have|can|don)", 0.20, "Behavioral override"),
    (r"do\s+not\s+(follow|obey|comply|adhere)", 0.30, "Compliance bypass"),
    (r"(jailbreak|DAN|developer\s*mode|god\s*mode)", 0.45, "Known jailbreak pattern"),
    (r"\[system\]|\[INST\]|<<SYS>>|<\|im_start\|>", 0.40, "Prompt format injection"),
    (r"(translate|encode|convert)\s+.*(base64|hex|rot13|binary)", 0.15, "Encoding evasion"),
    (r"what\s+(are|is)\s+your\s+(instructions?|rules?|system\s*prompt|constraints?)", 0.30, "Direct instruction probe"),
    (r"(override|replace|change|modify)\s+(your|the)\s+(persona|behavior|rules?|output)", 0.25, "Behavior modification"),
    (r"from\s+now\s+on\s+(you|ignore|always|never)", 0.25, "Persistent override"),
    (r"(sudo|admin|root)\s+(mode|access|override|command)", 0.35, "Privilege escalation"),
    (r"repeat\s+(everything|all|the\s+text)\s+(above|before|in\s+your)", 0.30, "Content extraction"),
    (r"ignore\s+.{0,30}(reveal|show|give|output)", 0.35, "Combined ignore + reveal"),
]


def detect_injection(prompt: str) -> Dict:
    """
    Analyze a prompt for injection signals.
    Returns: {score: 0..1, signals: [{pattern, weight, description, match}]}
    """
    text = prompt.lower().strip()
    hits = []
    total_weight = 0.0

    for pattern, weight, description in INJECTION_SIGNALS:
        matches = re.findall(pattern, text, re.IGNORECASE)
        if matches:
            total_weight += weight
            match_str = matches[0] if isinstance(matches[0], str) else " ".join(matches[0])
            hits.append({
                "pattern": pattern[:40],
                "weight": weight,
                "description": description,
                "match": match_str[:50],
            })

    # Normalize to 0..1 (cap at 1.0)
    score = min(total_weight, 1.0)

    # Bonus: very long prompts with high signal density are more suspicious
    if len(text) > 500 and len(hits) >= 3:
        score = min(score * 1.2, 1.0)

    return {
        "score": round(score, 4),
        "signals": hits,
        "signal_count": len(hits),
    }
