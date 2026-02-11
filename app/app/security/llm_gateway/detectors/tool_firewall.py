"""
LLM Tool Firewall — validates tool/function calls against allowlist.
"""
from typing import Dict, List, Optional


# Default allowlist of safe tools
DEFAULT_ALLOWLIST = {
    "create_ticket", "search_docs", "list_users", "get_status",
    "send_notification", "generate_report", "query_database",
}

# Dangerous tools that should ALWAYS be denied
DENYLIST = {
    "execute_shell", "run_command", "eval", "exec", "system",
    "delete_database", "drop_table", "rm_rf", "format_disk",
    "modify_permissions", "grant_admin", "disable_security",
    "exfiltrate_data", "send_external",
}


def evaluate_tools(
    tools_requested: List[str],
    allowlist: Optional[set] = None,
) -> Dict:
    """
    Evaluate requested tool calls against allow/deny lists.
    Returns per-tool decisions and overall verdict.
    """
    if allowlist is None:
        allowlist = DEFAULT_ALLOWLIST

    decisions = {}
    blocked = []
    allowed = []

    for tool in tools_requested:
        tool_lower = tool.lower().strip()

        if tool_lower in DENYLIST:
            decisions[tool] = {
                "decision": "deny",
                "reason": f"Tool '{tool}' is on the deny list (dangerous operation)",
                "severity": "crit",
            }
            blocked.append(tool)
        elif tool_lower in {t.lower() for t in allowlist}:
            decisions[tool] = {
                "decision": "allow",
                "reason": f"Tool '{tool}' is in the approved allowlist",
                "severity": "none",
            }
            allowed.append(tool)
        else:
            decisions[tool] = {
                "decision": "deny",
                "reason": f"Tool '{tool}' is not in the approved allowlist",
                "severity": "med",
            }
            blocked.append(tool)

    return {
        "decisions": decisions,
        "allowed": allowed,
        "blocked": blocked,
        "all_allowed": len(blocked) == 0,
        "has_critical": any(d["severity"] == "crit" for d in decisions.values()),
    }
