# Wave-capture helper for the R2 Claude arm (D-010): reads a wave spec JSON
# (written by the orchestrator) and writes each raw response verbatim to
# runs/R2/raw/<model>/<batch>.txt plus appends compliance rows.
# Kept in tools/ so the capture path itself is part of the committed harness.
import json
import os
import sys

spec_path = sys.argv[1]
spec = json.load(open(spec_path, encoding="utf8"))
base = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
raw_root = os.path.join(base, "runs", spec["run"], "raw")
comp_path = os.path.join(base, "runs", spec["run"], "compliance.json")

for row in spec["captures"]:
    d = os.path.join(raw_root, row["model"])
    os.makedirs(d, exist_ok=True)
    fname = row["batch"] + (".repair.txt" if row.get("repair") else ".txt")
    with open(os.path.join(d, fname), "w", encoding="utf8", newline="\n") as f:
        f.write(row["text"])

if os.path.exists(comp_path):
    comp = json.load(open(comp_path, encoding="utf8"))
else:
    comp = {
        "run": spec["run"],
        "note": "D-010 compliance: tool_uses must be exactly 1 (the prompt-file Read). Captured from the Agent-tool usage report per call.",
        "rows": [],
    }
for row in spec["captures"]:
    comp["rows"].append({
        "model": row["model"],
        "batch": row["batch"],
        "agent_id": row["agent_id"],
        "tool_uses": row["tool_uses"],
        # Memory-only arms: exactly one tool use (the prompt-file Read).
        # Retrieval arm (R2V): searches are permitted, so the ==1 criterion does
        # not apply; the spec passes an explicit value (or null = not applicable).
        "compliant": row["compliant"] if "compliant" in row else row["tool_uses"] == 1,
        "duration_ms": row["duration_ms"],
        "subagent_tokens": row["subagent_tokens"],
        **({"repair": True} if row.get("repair") else {}),
    })
json.dump(comp, open(comp_path, "w", encoding="utf8"), indent=1)
print(f"captured {len(spec['captures'])} responses; compliance rows now {len(comp['rows'])}")
