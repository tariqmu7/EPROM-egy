# -*- coding: utf-8 -*-
"""BD / External-Contracts import, step 3 — DERIVE the GM / AGM / DM profiles.

The reviewed workbook stops at Section Head. The four positions above it
(one GM, two AGMs, one DM) have no catalogue of their own, so this script
builds them by extending the Section Head sets upward with an explicit,
reviewable rule instead of hand-typing 400 requirement rows.

    THESE REQUIRED LEVELS ARE THIS SCRIPT'S JUDGEMENT, NOT EPROM's CATALOGUE.
    They are meant to be reviewed and edited before anyone is measured on them.

The rule, stated once so it can be argued with:

  * BREADTH grows with the span of control. A DM inherits the ladder of the
    section under it; an AGM inherits the ladder(s) of its sections; the GM
    inherits every skill in both ladders (a requirement missing here would be
    invisible in the GM's gap, ITP and TNA figures).
  * DEPTH of LEADERSHIP is Expert from DM upward: Management, Behavioral,
    Soft Skills and Safety are all pinned at 5. A section head is already at
    4-5 on these, so this is a small, defensible step.
  * DEPTH of TECHNICAL work does NOT keep climbing. A DM/AGM still approves
    the work, so technical sits at the section-head level with a floor of 4.
    A GM judges it rather than does it, so technical is clamped to 3-4 —
    deliberately BELOW the section head on the deepest specialisms, which is
    what stops the GM carrying 123 permanent Expert gaps.

Inputs are the already-extracted files (nothing is re-read from Excel):
  data/bd-ec/skills.json, data/bd-ec/jobProfiles.json
Output:
  data/bd-ec/jobProfilesLeadership.json  (load with load-jobs.mjs <file>)

    python derive_leadership.py
"""
import json, os, sys

HERE = os.path.dirname(__file__)
DATA = os.path.join(HERE, "..", "data", "bd-ec")
SKILLS = os.path.join(DATA, "skills.json")
PROFILES = os.path.join(DATA, "jobProfiles.json")
OUT = os.path.join(DATA, "jobProfilesLeadership.json")

LEADERSHIP_CATEGORIES = {"Management", "Behavioral", "Soft Skills", "Safety"}

# id, code, orgLevel, departmentId, source Section-Head codes, title, description
SPEC = [
    (
        "jp-bd-gm", "BD-GM", "GM", "g-bizdev", ["BD-SH", "EC-SH"],
        "General Manager, Business Development & External Contracting",
        "Leads the whole Business Development & External Contracting general department: "
        "the Business Development and Marketing Programs line and the External Contracts, "
        "Bids and Project Contract Follow-up line. Accountable for the commercial pipeline, "
        "contract exposure and the capability of both ladders.",
    ),
    (
        "jp-bd-agm", "BD-AGM", "AGM", "d-bizdev-mkt", ["BD-SH"],
        "Assistant General Manager, Business Development & Marketing Programs",
        "Runs the Business Development and Marketing Programs departments: opportunity "
        "screening, market and competitor analysis, proposals and the marketing programme "
        "plan. Approves the technical work of both section heads.",
    ),
    (
        "jp-ec-agm", "EC-AGM", "AGM", "d-bizdev-ext", ["EC-SH"],
        "Assistant General Manager, External Contracts & Project Contract Follow-up",
        "Runs the External Contracts & Offers and Project Contract Follow-up departments: "
        "tendering, contract drafting and negotiation, claims and variation control, and "
        "the follow-up of contracts in execution.",
    ),
    (
        "jp-bd-dm", "BD-DM", "DM", "dept-bizdev-mkt-programs", ["BD-SH"],
        "Department Manager, Marketing Programs",
        "Manages the Marketing Programs department on the Business Development competency "
        "ladder: annual marketing programme, client and market coverage, and the section's "
        "delivery against the business development plan.",
    ),
]


def required_level(category, section_head_level, org_level):
    """The rule above, in one place."""
    if category in LEADERSHIP_CATEGORIES:
        return 5
    if org_level == "GM":
        return min(max(section_head_level, 3), 4)
    return max(section_head_level, 4)


def main():
    skills = {s["id"]: s for s in json.load(open(SKILLS, encoding="utf-8"))}
    profiles = {p["code"]: p for p in json.load(open(PROFILES, encoding="utf-8"))}

    problems, out = [], []
    for pid, code, org_level, dept, sources, title, description in SPEC:
        # Union of the source ladders, each skill taken at its DEEPEST source level.
        base = {}
        for src in sources:
            sp = profiles.get(src)
            if sp is None:
                problems.append("%s: source profile %s not found" % (code, src))
                continue
            for r in sp["requiredSkills"]:
                base[r["skillId"]] = max(base.get(r["skillId"], 0), r["requiredLevel"])

        required = []
        for skill_id, sh_level in base.items():
            skill = skills.get(skill_id)
            if skill is None:
                problems.append("%s: skill %s is not in the catalogue" % (code, skill_id))
                continue
            required.append({
                "skillId": skill_id,
                "requiredLevel": required_level(skill["category"], sh_level, org_level),
            })
        # Stable order: category, then name — so a re-run diffs cleanly.
        required.sort(key=lambda r: (skills[r["skillId"]]["category"], skills[r["skillId"]]["name"]))

        if not required:
            problems.append("%s: derived no requirements" % code)
        out.append({
            "id": pid, "title": title, "description": description,
            "departmentId": dept, "orgLevel": org_level,
            "requiredSkills": required, "code": code, "isArchived": False,
        })

    if problems:
        print("REFUSING TO WRITE - %d problem(s):" % len(problems))
        for p in problems[:40]:
            print("  -", p)
        sys.exit(1)

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("wrote %d leadership profiles -> %s" % (len(out), os.path.normpath(OUT)))
    for p in out:
        mix = {}
        for r in p["requiredSkills"]:
            key = (skills[r["skillId"]]["category"], r["requiredLevel"])
            mix[key] = mix.get(key, 0) + 1
        print("  %-7s %-4s %-27s %3d skills  %s" % (p["code"], p["orgLevel"], p["departmentId"],
                                                    len(p["requiredSkills"]), p["title"]))
        print("          " + "  ".join("%s L%d x%d" % (c, l, n) for (c, l), n in sorted(mix.items())))


if __name__ == "__main__":
    main()
