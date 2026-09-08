# -*- coding: utf-8 -*-
r"""Operations (Canal Cities & Sinai) import, step 1 of 2 - the ORG UNITS.

Reads `ops_departments.json` (produced and self-checked by
`BD\ECMS\Job Profiles\_working\generate_ops_departments.py`) and re-validates it
against the live org-chart export before letting it anywhere near the database.

It invents nothing: every document is copied through. What it adds is the
refusal - a missing parent, a duplicate id, a name that collides with a unit
that already exists under a different id, or a child listed before its parent
would each produce an org chart with a unit nobody can navigate to.

One of the 16 documents is a RENAME, not a new unit: `d-canal-ops` is live as
plain "Operations", a name shared with `d-west-ops` and `d-south-ops`. Every
ECMS importer matches a department by name and takes the first match, so the
name must be made unique before any job profile or person is attached to it.
The id is unchanged, so nobody and nothing moves.

    python extract_departments.py
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = r"C:\Users\tariq\Desktop\work\Work laptop\BD\ECMS\Job Profiles\1_Final_Deliverables\ECMS_Import\ops_departments.json"
LIVE = os.path.join(HERE, "..", "data", "departments.json")
OUT = os.path.join(HERE, "..", "data", "ops", "departments.json")

TYPES = {"COMPANY", "EXECUTIVE", "SECTOR", "GENERAL", "ASSISTANT_GENERAL",
         "DEPARTMENT", "SECTION", "POSITION"}


def main():
    with open(SRC, encoding="utf-8") as f:
        docs = json.load(f)
    with open(LIVE, encoding="utf-8") as f:
        live = json.load(f)

    live_by_id = {d["id"]: d["data"] for d in live}
    live_name_owner = {}
    for d in live:
        live_name_owner.setdefault((d["data"].get("name") or "").strip().lower(), []).append(d["id"])

    problems, seen = [], set()
    renames, creates = [], []

    for n, doc in enumerate(docs, start=1):
        did, data = doc.get("id"), doc.get("data") or {}
        if not did:
            problems.append("doc %d: no id" % n)
            continue
        if did in seen:
            problems.append("%s: duplicate id" % did)
        seen.add(did)
        if data.get("id") != did:
            problems.append("%s: data.id is %r" % (did, data.get("id")))
        if not re.fullmatch(r"[a-z0-9-]+", did):
            problems.append("%s: id is off-convention" % did)
        if data.get("type") not in TYPES:
            problems.append("%s: type %r unknown" % (did, data.get("type")))
        name = (data.get("name") or "").strip()
        if not name:
            problems.append("%s: no name" % did)
        if not data.get("nameAr"):
            problems.append("%s: no Arabic name" % did)

        parent = data.get("parentId")
        if parent and parent not in live_by_id and parent not in seen:
            problems.append("%s: parent %s neither live nor listed earlier in this file" % (did, parent))

        # A name already held by ANOTHER unit is the bug this whole load exists
        # to avoid - the importers match by name and take the first hit.
        owners = [i for i in live_name_owner.get(name.lower(), []) if i != did]
        if owners:
            problems.append("%s: name %r is already held by %s" % (did, name, ", ".join(owners)))

        if did in live_by_id:
            old = (live_by_id[did].get("name") or "").strip()
            if old != name:
                renames.append((did, old, name))
            elif live_by_id[did] != data:
                renames.append((did, old, name + "  (fields changed, name unchanged)"))
        else:
            creates.append(did)

    if problems:
        print("REFUSING TO WRITE - %d problem(s):" % len(problems))
        for p in problems[:40]:
            print("  -", p)
        sys.exit(1)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(docs, f, ensure_ascii=False, indent=1)

    print("wrote %d org units -> %s" % (len(docs), os.path.normpath(OUT)))
    print("  new units : %d" % len(creates))
    print("  renames   : %d" % len(renames))
    for did, old, new in renames:
        print("     %s : %r -> %r" % (did, old, new))
    by_type = {}
    for d in docs:
        by_type[d["data"]["type"]] = by_type.get(d["data"]["type"], 0) + 1
    print("  by type   : " + ", ".join("%s %d" % kv for kv in sorted(by_type.items())))


if __name__ == "__main__":
    main()
