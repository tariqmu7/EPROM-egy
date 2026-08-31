# -*- coding: utf-8 -*-
"""BD / External-Contracts import, step 1 of 2 — READ the reviewed JOB workbook.

Reads `ECMS_Upload_2_JOB.xlsx` (579 requirement rows, one per profile+skill) and
writes it out as JSON in the exact document shape `JobProfile` in src/types.ts
describes — one document per position, with a flat `requiredSkills` list.

Nothing here invents data. Every field is copied from a cell except:
  * the id, derived from the sheet's Code so a re-run updates in place;
  * `departmentId`, resolved from the workbook's Department Name through the
    SECTION map below (Tariq's decision: profiles hang on the SECTION units);
  * the External-Contracts ladder is written TWICE — once on the External
    Contracts & Offers section and once on the Project Contract Follow-up
    section (ids suffixed `-fu`), because the two sections share one catalogue
    but each section must own its own profiles.

Skill names are resolved against the loaded catalogue (`data/bd-ec/skills.json`)
because ECMS stores skillIds, and the script REFUSES if any name is unknown —
a silently dropped requirement is a gap the system would never report.

    python extract_jobs.py
"""
import json, os, re, sys

import openpyxl

HERE = os.path.dirname(__file__)
SRC = r"C:\Users\tariq\Desktop\work\Work laptop\BD\BD and IC Job Profile\1_Final_Deliverables\ECMS_Import\ECMS_Upload_2_JOB.xlsx"
SKILLS = os.path.join(HERE, "..", "data", "bd-ec", "skills.json")
OUT = os.path.join(HERE, "..", "data", "bd-ec", "jobProfiles.json")

ORG_LEVELS = {"CEO", "ACEO", "GM", "AGM", "DM", "SH", "SP", "JP", "FR"}

# Workbook Department Name -> the SECTION unit the profile hangs on.
DEPARTMENTS = {
    "Business Development": ["sect-bizdev-mkt-bd"],
    # One catalogue, two sections: the ladder is duplicated onto the follow-up
    # section so people sitting there are covered by a profile of their own.
    "External Contracts/Bids & Project Contract Follow-up": [
        "sect-bizdev-ext-contracts",
        "sect-bizdev-ext-followup",
    ],
}
# Suffix + title tag for every department after the first for a given ladder.
COPY_TAG = {"sect-bizdev-ext-followup": ("fu", "Project Contract Follow-up")}

COL = {
    "title": "Title",
    "description": "Description",
    "code": "Code",
    "department": "Department Name",
    "skill": "Skill Name",
    "level": "Required Level (1-5)",
    "orgLevel": "Org Level (CEO/ACEO/GM/AGM/DM/SH/SP/JP/FR)",
}


def profile_id(code):
    """`BD-FR` -> `jp-bd-fr`. Stable, so a re-import updates in place."""
    return "jp-" + re.sub(r"[^a-z0-9]+", "-", code.lower()).strip("-")


def main():
    catalogue = json.load(open(SKILLS, encoding="utf-8"))
    by_name = {s["name"].strip().lower(): s["id"] for s in catalogue}

    ws = openpyxl.load_workbook(SRC, data_only=True).worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    header = [str(c).strip() if c is not None else "" for c in rows[0]]
    idx = {h: i for i, h in enumerate(header)}
    for key, col in COL.items():
        if col not in idx:
            sys.exit("missing expected column: %s" % col)

    def cell(row, key):
        v = row[idx[COL[key]]]
        return "" if v is None else str(v).strip()

    profiles, order, problems, unknown_skills = {}, [], [], {}
    for n, row in enumerate(rows[1:], start=2):
        code = cell(row, "code")
        skill_name = cell(row, "skill")
        if not code or not skill_name:
            continue

        depts = DEPARTMENTS.get(cell(row, "department"))
        if depts is None:
            problems.append("row %d: department %r has no section mapping" % (n, cell(row, "department")))
            continue

        org_level = cell(row, "orgLevel").upper()
        if org_level not in ORG_LEVELS:
            problems.append("row %d: org level %r unknown" % (n, org_level))

        try:
            level = int(float(cell(row, "level")))
        except ValueError:
            problems.append("row %d: required level %r is not a number" % (n, cell(row, "level")))
            continue
        if not 1 <= level <= 5:
            problems.append("row %d: required level %d is outside the 1-5 scale" % (n, level))
            continue

        skill_id = by_name.get(skill_name.lower())
        if skill_id is None:
            unknown_skills.setdefault(skill_name, n)
            continue

        for dept in depts:
            tag = COPY_TAG.get(dept)
            pid = profile_id(code) + ("-" + tag[0] if tag else "")
            p = profiles.get(pid)
            if p is None:
                p = profiles[pid] = {
                    "id": pid,
                    "title": cell(row, "title") + (" (%s)" % tag[1] if tag else ""),
                    "description": cell(row, "description"),
                    "departmentId": dept,
                    "orgLevel": org_level,
                    "requiredSkills": [],
                    "code": code + ("-" + tag[0].upper() if tag else ""),
                    "isArchived": False,
                }
                order.append(pid)
            elif p["orgLevel"] != org_level:
                problems.append("row %d: code %s carries two org levels (%s and %s)"
                                % (n, code, p["orgLevel"], org_level))
            seen = {r["skillId"]: r for r in p["requiredSkills"]}
            if skill_id in seen:
                if seen[skill_id]["requiredLevel"] != level:
                    problems.append("row %d: %s requires %s at both level %d and %d"
                                    % (n, code, skill_name, seen[skill_id]["requiredLevel"], level))
                continue
            p["requiredSkills"].append({"skillId": skill_id, "requiredLevel": level})

    for name, n in unknown_skills.items():
        problems.append("row %d: skill name %r is not in the loaded catalogue" % (n, name))

    if problems:
        print("REFUSING TO WRITE - %d problem(s):" % len(problems))
        for p in problems[:40]:
            print("  -", p)
        sys.exit(1)

    out = [profiles[pid] for pid in order]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("wrote %d job profiles -> %s" % (len(out), os.path.normpath(OUT)))
    for p in out:
        print("  %-14s %-4s %-27s %3d skills  %s"
              % (p["code"], p["orgLevel"], p["departmentId"], len(p["requiredSkills"]), p["title"]))


if __name__ == "__main__":
    main()
