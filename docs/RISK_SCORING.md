# Incident Risk Scoring

Every correlated incident gets a transparent 0-100 risk score, computed by
`correlation-engine/risk.py` and attached in `CorrelationEngine._build_incident_doc`.
The score is never an opaque number - every point is attributable to a
specific factor, returned alongside the score as `risk_factors`.

## Formula

| Factor | Points | Notes |
|---|---|---|
| Base severity | 25 / 45 / 65 / 80 | From the correlation pattern's `severity` (low/medium/high/critical) |
| Attack-chain breadth | +5 per additional distinct rule stage, capped at +25 | Rewards incidents that chain multiple different detections, not just repeats of one rule |
| Privileged account involved | +15 | Any of `admin`, `administrator`, `root` appears in the incident's `users` |
| Data exfiltration stage | +10 | Incident's MITRE techniques include an exfiltration technique (T1041, T1020, T1567, T1030) |
| Credential access stage | +8 | Incident's MITRE techniques include a credential-access technique (T1003, T1003.001, T1552, T1555) |

The raw sum is clamped to `[0, 100]`.

## Bands

| Score | Band |
|---|---|
| 90-100 | critical |
| 70-89 | high |
| 40-69 | medium |
| 0-39 | low |

## Where it shows up

- **Incident document** - every incident written to the `incidents` index carries `risk_score`, `risk_band`, and `risk_factors` (see `scripts/init-db.py` for the explicit `risk_score`/`risk_band` field mapping).
- **API** - `GET /incidents?sort_by=risk` returns incidents ordered by `risk_score` descending instead of the default newest-first.
- **UI** - the Incidents page shows a risk badge per incident (hover for the factor breakdown) and a "Highest risk" sort toggle; the Dashboard shows the highest-risk open incident and the average risk across open incidents.

## Extending it

`compute_risk()` in `correlation-engine/risk.py` takes a small context dict
(`severity`, `users`, `mitre_techniques`) plus the list of matched alerts -
it doesn't touch OpenSearch, so it's trivial to unit test (see
`tests/test_risk_scoring.py`) or extend with new factors (e.g. asset
criticality, time-of-day) without touching the correlation engine itself.
