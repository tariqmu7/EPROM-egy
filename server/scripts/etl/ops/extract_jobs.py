# -*- coding: utf-8 -*-
r"""Operations import, step 1 of 2 - READ the JOB workbook.

Reads the 844 Operations rows out of `ECMS_Upload_2_JOB.xlsx` (one row per
profile + skill) and writes eight `JobProfile` documents in the exact shape
src/types.ts describes - a flat `requiredSkills` list of {skillId, requiredLevel}.

Nothing is invented. Every field is copied from a cell except:
  * the id, derived from the sheet's Code so a re-run updates in place
    (`OP-FR` -> `jp-op-fr`);
  * `departmentId`, which is the ASSISTANT_GENERAL unit `d-canal-ops`. The eight
    profiles are shared by all three sites - the section a person sits in is
    recorded on the person, not on the profile.

Skill names are resolved against `data/ops/skills.json` (extracted first) because
ECMS stores skillIds, and this REFUSES on any unknown name: a silently dropped
requirement is a gap the system would never report.

Note the two SP profiles. `OP-SPS` (Shift Supervisor) and `OP-SPE` (Senior
Operations Engineer) are both org level SP in the same unit; ECMS keys a profile
on Title + Department, so they are two profiles, not a collision.

    python extract_jobs.py
"""
import json, os, re, sys

import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = r"C:\Users\tariq\Desktop\work\Work laptop\BD\ECMS\Job Profiles\1_Final_Deliverables\ECMS_Import\ECMS_Upload_2_JOB.xlsx"
SKILLS = os.path.join(HERE, "..", "data", "ops", "skills.json")
OUT = os.path.join(HERE, "..", "data", "ops", "jobProfiles.json")

OPS_UNIT = "Operations - Canal Cities & Sinai"
DEPARTMENT_ID = "d-canal-ops"

ORG_LEVELS = {"CEO", "ACEO", "GM", "AGM", "DM", "SH", "SP", "JP", "FR"}

COL = {
    "title": "Title",
    "description": "Description",
    "code": "Code",
    "department": "Department Name",
    "skill": "Skill Name",
    "level": "Required Level (1-5)",
    "org": "Org Level (CEO/ACEO/GM/AGM/DM/SH/SP/JP/FR)",
}


def profile_id(code):
    return "jp-" + re.sub(r"[^a-z0-9]+", "-", code.lower()).strip("-")


def main():
    with open(SKILLS, encoding="utf-8") as f:
        catalogue = json.load(f)
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

    profiles, problems, seen_titles = {}, [], {}
    used = 0
    for n, row in enumerate(rows[1:], start=2):
        if cell(row, "department") != OPS_UNIT:
            continue
        used += 1
        code = cell(row, "code")
        if not code:
            problems.append("row %d: no Code" % n)
            continue
        pid = profile_id(code)
        org = cell(row, "org").upper()
        if org not in ORG_LEVELS:
            problems.append("row %d: org level %r unknown" % (n, org))

        skill_name = cell(row, "skill")
        sid = by_name.get(skill_name.lower())
        if not sid:
            problems.append("row %d: skill %r is not in the extracted catalogue" % (n, skill_name))
            continue

        try:
            lvl = int(float(cell(row, "level")))
        except ValueError:
            problems.append("row %d: required level %r is not a number" % (n, cell(row, "level")))
            continue
        if not 1 <= lvl <= 5:
            problems.append("row %d: required level %d out of the 1-5 scale" % (n, lvl))
            continue

        p = profiles.setdefault(pid, {
            "id": pid,
            "title": cell(row, "title"),
            "description": cell(row, "description"),
            "code": code,
            "departmentId": DEPARTMENT_ID,
            "orgLevel": org,
            "requiredSkills": [],
            "isArchived": False,
        })
        if p["title"] != cell(row, "title") or p["orgLevel"] != org:
            problems.append("row %d: %s disagrees with an earlier row on title/org level" % (n, code))
        if any(r["skillId"] == sid for r in p["requiredSkills"]):
            problems.append("row %d: %s requires %r twice" % (n, code, skill_name))
        p["requiredSkills"].append({"skillId": sid, "requiredLevel": lvl})

    if not used:
        problems.append("no rows for department %r" % OPS_UNIT)

    # ECMS keys a profile on Title + Department. Two profiles sharing a title in
    # one unit would be one profile as far as the app is concerned.
    for p in profiles.values():
        key = p["title"].lower()
        if key in seen_titles:
            problems.append("title %r is used by both %s and %s in the same unit"
                            % (p["title"], seen_titles[key], p["code"]))
        seen_titles[key] = p["code"]
        if not p["requiredSkills"]:
            problems.append("%s has no required skills" % p["code"])
        if not p["description"]:
            problems.append("%s has no description" % p["code"])

    if problems:
        print("REFUSING TO WRITE - %d problem(s):" % len(problems))
        for p in problems[:40]:
            print("  -", p)
        sys.exit(1)

    out = list(profiles.values())
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    print("wrote %d job profiles (%d requirement rows) -> %s" % (len(out), used, os.path.normpath(OUT)))
    for p in out:
        print("  %-8s %-3s %3d skills  %s" % (p["code"], p["orgLevel"], len(p["requiredSkills"]), p["title"]))


if __name__ == "__main__":
    main()
