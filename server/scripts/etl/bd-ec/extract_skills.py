# -*- coding: utf-8 -*-
"""BD / External-Contracts import, step 1 of 2 — READ the reviewed workbook.

Reads `ECMS_Upload_1_SKILL.xlsx` (the sheet Tariq's generate_ecms_import.py
produces from the two department catalogues) and writes it out as JSON in the
exact document shape `Skill` in src/types.ts describes — the same shape the
in-app BulkUpload SKILL importer builds, so a skill loaded this way is
indistinguishable from one uploaded through the UI.

Nothing here invents data: every field is copied from a cell, except the id
(derived from the sheet's Code so a re-run updates in place instead of
duplicating) and the assessmentMethods block (one block per skill carrying the
sheet's own Assessment Method, mirroring the legacy->inline shape store.ts
synthesises anyway).

    python extract_skills.py
"""
import json, os, re, sys

import openpyxl

SRC = r"C:\Users\tariq\Desktop\work\Work laptop\BD\BD and IC Job Profile\1_Final_Deliverables\ECMS_Import\ECMS_Upload_1_SKILL.xlsx"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "bd-ec", "skills.json")

# ECMS has exactly five categories (normalizeSkillCategory in src/utils).
CATEGORIES = {"technical": "Technical", "safety": "Safety", "management": "Management",
              "soft skills": "Soft Skills", "behavioral": "Behavioral"}
CRITICALITIES = {"SAFETY_CRITICAL", "HIGH", "STANDARD", "LOW"}
METHODS = {"OJT_OBSERVATION", "WORK_RECORD_REVIEW", "WRITTEN_EXAM",
           "PRACTICAL_DEMO", "INTERVIEW", "THREE_SIXTY_EVALUATION"}

COL = {
    "name": "Name",
    "category": "Category (Technical/Safety/Management/Soft Skills/Behavioral)",
    "criticality": "Criticality (SAFETY_CRITICAL/HIGH/STANDARD/LOW)",
    "method": "Assessment Method (OJT_OBSERVATION/WORK_RECORD_REVIEW/WRITTEN_EXAM/PRACTICAL_DEMO/INTERVIEW)",
    "question": "Assessment Question",
    "link": "Assessment Link",
    "code": "Code",
    "description": "Description",
}


def skill_id(code, name):
    """`BD-T-01 / EC-T-34` -> `sk-bd-t-01`. Stable, so a re-import updates."""
    first = (code or name).split("/")[0].strip()
    slug = re.sub(r"[^a-z0-9]+", "-", first.lower()).strip("-")
    return "sk-" + slug


def main():
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

    skills, seen_ids, seen_names, problems = [], {}, {}, []
    for n, row in enumerate(rows[1:], start=2):
        name = cell(row, "name")
        if not name:
            continue

        cat_raw = cell(row, "category").lower()
        if cat_raw not in CATEGORIES:
            problems.append("row %d: category %r is not one of the five ECMS categories" % (n, cat_raw))
        crit = cell(row, "criticality").upper()
        if crit not in CRITICALITIES:
            problems.append("row %d: criticality %r unknown" % (n, crit))
        method = cell(row, "method").upper()
        if method not in METHODS:
            problems.append("row %d: assessment method %r unknown" % (n, method))

        sid = skill_id(cell(row, "code"), name)
        if sid in seen_ids:
            problems.append("row %d: duplicate id %s (also row %d)" % (n, sid, seen_ids[sid]))
        seen_ids[sid] = n
        key = name.lower()
        if key in seen_names:
            problems.append("row %d: duplicate skill NAME %r (also row %d) - ECMS matches by name"
                            % (n, name, seen_names[key]))
        seen_names[key] = n

        levels = {}
        for lv in range(1, 6):
            desc = row[idx["Level %d Desc" % lv]]
            certs = row[idx["Level %d Certs" % lv]]
            levels[str(lv)] = {
                "level": lv,
                "description": "" if desc is None else str(desc).strip(),
                "requiredCertificates": [c.strip() for c in str(certs).split(",") if c.strip()] if certs else [],
            }
            if not levels[str(lv)]["description"]:
                problems.append("row %d: level %d has no description" % (n, lv))

        skills.append({
            "id": sid,
            "name": name,
            "category": CATEGORIES.get(cat_raw, "Technical"),
            "criticality": crit if crit in CRITICALITIES else "STANDARD",
            "levels": levels,
            "status": "APPROVED",
            "isArchived": False,
            "code": cell(row, "code"),
            "description": cell(row, "description"),
            # Inline assessment config (Skill.assessmentMethods) - how/when/who.
            # ONE_TIME + ALL is the neutral setting: it never makes a skill fall
            # due on its own, which is the right default until Tariq sets a real
            # frequency per skill in the Competency Standard form.
            "assessmentMethods": [{
                "id": "imp:%s" % sid,
                "method": method if method in METHODS else "OJT_OBSERVATION",
                "questions": [],
                "frequency": "ONE_TIME",
                "audience": "ALL",
            }],
            # Deprecated mirrors, written because store.ts still falls back to
            # them for legacy docs and the UI shows assessmentMethod directly.
            "assessmentMethod": method if method in METHODS else "OJT_OBSERVATION",
            "assessmentQuestion": cell(row, "question"),
            "assessmentLink": cell(row, "link"),
        })

    if problems:
        print("REFUSING TO WRITE - %d problem(s):" % len(problems))
        for p in problems[:40]:
            print("  -", p)
        sys.exit(1)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(skills, f, ensure_ascii=False, indent=1)
    print("wrote %d skills -> %s" % (len(skills), os.path.normpath(OUT)))
    by_cat = {}
    for s in skills:
        by_cat[s["category"]] = by_cat.get(s["category"], 0) + 1
    print("  categories:", by_cat)
    by_crit = {}
    for s in skills:
        by_crit[s["criticality"]] = by_crit.get(s["criticality"], 0) + 1
    print("  criticality:", by_crit)


if __name__ == "__main__":
    main()
