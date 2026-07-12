"""
Incident risk scoring.

Combines the correlation pattern's base severity with a few transparent
factors (attack-chain breadth, privileged-account involvement, credential
access / exfiltration stages) into a single 0-100 score and a risk band.
Every point is attributable, so the UI can show *why* an incident scored
the way it did instead of an opaque number.
"""

from typing import Any, Dict, List

SEVERITY_BASE_POINTS = {"low": 25, "medium": 45, "high": 65, "critical": 80}

PRIVILEGED_USERS = {"admin", "administrator", "root"}

# MITRE ATT&CK technique IDs that indicate the incident reached a
# particularly damaging stage of the attack lifecycle.
EXFILTRATION_TECHNIQUES = {"T1041", "T1020", "T1567", "T1030"}
CREDENTIAL_ACCESS_TECHNIQUES = {"T1003", "T1003.001", "T1552", "T1555"}

MAX_CHAIN_BONUS = 25
CHAIN_POINTS_PER_STAGE = 5
PRIVILEGED_ACCOUNT_BONUS = 15
EXFILTRATION_BONUS = 10
CREDENTIAL_ACCESS_BONUS = 8

RISK_BAND_THRESHOLDS = (
    (90, "critical"),
    (70, "high"),
    (40, "medium"),
)


def _risk_band(score: int) -> str:
    for threshold, band in RISK_BAND_THRESHOLDS:
        if score >= threshold:
            return band
    return "low"


def compute_risk(
    incident_context: Dict[str, Any],
    matched_alerts: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Compute a 0-100 risk score for an incident.

    Args:
        incident_context: needs "severity" (pattern severity), "users"
            (list of usernames involved), and "mitre_techniques" (list of
            technique IDs) - the same shapes already assembled in
            CorrelationEngine._build_incident_doc.
        matched_alerts: the alerts that were correlated into this incident.

    Returns:
        {"risk_score": int, "risk_band": str, "risk_factors": [{"label", "points"}]}
    """
    factors: List[Dict[str, Any]] = []

    severity = incident_context.get("severity", "medium")
    base_points = SEVERITY_BASE_POINTS.get(severity, SEVERITY_BASE_POINTS["medium"])
    factors.append({"label": f"base severity ({severity})", "points": base_points})

    distinct_rule_ids = {a.get("rule_id") for a in matched_alerts if a.get("rule_id")}
    if len(distinct_rule_ids) > 1:
        chain_points = min((len(distinct_rule_ids) - 1) * CHAIN_POINTS_PER_STAGE, MAX_CHAIN_BONUS)
        factors.append({
            "label": f"attack-chain breadth ({len(distinct_rule_ids)} stages)",
            "points": chain_points,
        })

    users = {(u or "").lower() for u in incident_context.get("users", []) if u}
    if users & PRIVILEGED_USERS:
        factors.append({"label": "privileged account involved", "points": PRIVILEGED_ACCOUNT_BONUS})

    techniques = set(incident_context.get("mitre_techniques", []))
    if techniques & EXFILTRATION_TECHNIQUES:
        factors.append({"label": "data exfiltration stage", "points": EXFILTRATION_BONUS})
    if techniques & CREDENTIAL_ACCESS_TECHNIQUES:
        factors.append({"label": "credential access stage", "points": CREDENTIAL_ACCESS_BONUS})

    raw_score = sum(f["points"] for f in factors)
    score = max(0, min(100, raw_score))

    return {
        "risk_score": score,
        "risk_band": _risk_band(score),
        "risk_factors": factors,
    }
