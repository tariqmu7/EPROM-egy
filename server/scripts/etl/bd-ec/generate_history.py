# BD / External-Contracts import, step 6 of 9 — GENERATE three months of
# assessment history (June / July / August 2026) + evidence records.
#
#   python scripts/etl/bd-ec/generate_history.py
#
# Reads (no Excel input — there is no real evaluation record to import):
#   data/bd-ec/livePlacement.json — the LIVE placement, written by
#   `node scripts/etl/bd-ec/dump_placement.mjs`. NOT users.json / jobProfiles.json:
#   those are what task 4 loaded, and the placement has been edited in the app
#   since. History generated against a stale placement lands on skills the person
#   is no longer required to have.
# Writes:
#   data/bd-ec/assessments.json, data/bd-ec/evidences.json
#
# ############################################################################
# THESE ARE DEMO SCORES. Nobody was evaluated. They exist so the app can be
# shown as if it had been running for three months. Every record says so in its
# own `comment` / `notes` field, so a row cannot be mistaken for a real
# evaluation once it is out of this script's sight. Delete them all before the
# system carries a real appraisal.
# ############################################################################
#
# The three rules this generator obeys:
#
# 1. A record is written ONLY in the shape the skill's own configuration can
#    actually be scored from (store.ts `computeSkillScore`):
#      * WRITTEN_EXAM / INTERVIEW / PRACTICAL_DEMO -> a direct assessment of the
#        same type; the LATEST one wins, so history is "earlier, lower".
#      * WORK_RECORD_REVIEW -> APPROVED evidence with an assignedScore; the
#        HIGHEST wins, so history is "earlier, lower" too.
#      * OJT_OBSERVATION -> a SELF/PEER/MANAGER trio (weights 10/30/60),
#        latest-per-rater.
#      * THREE_SIXTY_EVALUATION -> NOTHING IS WRITTEN. See the note below.
# 2. Coverage stays honest. A deliberate share of each person's requirements is
#    left with no record at all, so the measured / unknown split on every screen
#    shows a real hole rather than a screen full of green.
# 3. Every id is derived from (subject, skill, period, type), so a re-run
#    updates in place instead of doubling the history.
#
# KNOWN STORE BEHAVIOUR (flagged, not worked around): `computeSkillScore` takes
# the 360-degree branch only when the primary method is exactly
# 'OJT_OBSERVATION'. The 9 skills configured as 'THREE_SIXTY_EVALUATION' fall
# into the direct branch, where SELF/PEER/MANAGER records are ignored — writing
# them would produce records that score nothing. Those skills are therefore left
# unmeasured and reported at the end.
import datetime
import hashlib
import io
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data", "bd-ec")

DEMO_NOTE = "DEMO DATA - generated for the system trial, not a real evaluation."
# An honest attachment: a real, downloadable file that says what it is. An empty
# fileUrl renders a dead Download link on the approval screen.
DEMO_FILE_URL = (
    "data:text/plain;base64,"
    "REVNTyBldmlkZW5jZSByZWNvcmQgLSBubyByZWFsIGRvY3VtZW50IGlzIGF0dGFjaGVkLg=="
)

WAVES = [("2026-06-16", "2026-06"), ("2026-07-15", "2026-07"), ("2026-08-12", "2026-08")]
WINDOW = ("2026-06-01", "2026-08-21")  # nothing may be dated outside the demo window

SENIOR = {"GM", "AGM", "DM", "SH", "SP"}


def load(name):
    with io.open(os.path.join(DATA, name), encoding="utf-8") as fh:
        return json.load(fh)


def rnd(*parts):
    """Deterministic 0..1 — same inputs, same history, every run."""
    h = hashlib.md5("|".join(str(p) for p in parts).encode("utf-8")).hexdigest()
    return int(h[:12], 16) / float(0x1000000000000)


def pick(r, weighted):
    acc = 0.0
    for value, weight in weighted:
        acc += weight
        if r < acc:
            return value
    return weighted[-1][0]


def iso(date, hour):
    return "%sT%02d:00:00.000Z" % (date, hour)


def plus_days(date, days):
    d = datetime.date(*[int(x) for x in date.split("-")]) + datetime.timedelta(days=days)
    return d.isoformat()


def main():
    if not os.path.exists(os.path.join(DATA, "livePlacement.json")):
        print("REFUSING: livePlacement.json is missing.")
        print("Run: node scripts/etl/bd-ec/dump_placement.mjs")
        raise SystemExit(1)
    live = load("livePlacement.json")
    users = live["users"]
    admin_id = live.get("adminId")

    problems = []
    if not admin_id:
        problems.append("livePlacement.json has no admin id (rater of last resort)")

    skill_by_id = {
        s["id"]: {"name": s["name"], "criticality": s.get("criticality", "STANDARD"), "method": s["method"]}
        for s in live["skills"]
    }
    profile_by_id = {p["id"]: p["requiredSkills"] for p in live["jobProfiles"]}

    by_id = {u["id"]: u for u in users}

    assessments = []
    evidences = []
    report = []

    for user in sorted(users, key=lambda u: u["id"]):
        uid = user["id"]
        profile_id = user.get("jobProfileId")
        if not profile_id:
            continue
        if profile_id not in profile_by_id:
            problems.append("%s: job profile %s not found" % (uid, profile_id))
            continue

        manager_id = user.get("managerId") or admin_id
        if manager_id != admin_id and manager_id not in by_id:
            problems.append("%s: manager %s is not in this load" % (uid, manager_id))
            continue

        # Peers for the 360 blend: same org level, nearest first (same unit).
        peers = [
            o["id"] for o in users
            if o["id"] != uid and o.get("orgLevel") == user.get("orgLevel")
        ]
        peers.sort(key=lambda pid: (by_id[pid].get("departmentId") != user.get("departmentId"), pid))

        senior = user.get("orgLevel") in SENIOR
        measured = 0
        unknown = 0
        blocked_360 = 0

        for req in profile_by_id[profile_id]:
            sid = req["skillId"]
            required = int(req["requiredLevel"])
            skill = skill_by_id.get(sid)
            if not skill:
                problems.append("%s: required skill %s is not a live skill" % (uid, sid))
                continue

            method = skill["method"]
            if method == "THREE_SIXTY_EVALUATION":
                # See the header note: nothing written could be scored.
                blocked_360 += 1
                unknown += 1
                continue

            # Rule 2 — leave a real hole. Roughly a fifth of every person's
            # requirements has never been looked at.
            if rnd("cover", uid, sid) < 0.20:
                unknown += 1
                continue

            delta = pick(rnd("delta", uid, sid), [
                (1, 0.12), (0, 0.48), (-1, 0.28), (-2, 0.12)
            ] if senior else [
                (1, 0.08), (0, 0.38), (-1, 0.34), (-2, 0.20)
            ])
            target = max(1, min(5, required + delta))
            earlier = max(1, target - 1)
            has_history = target > 1 and rnd("hist", uid, sid) < 0.45
            measured += 1

            if method in ("WRITTEN_EXAM", "INTERVIEW", "PRACTICAL_DEMO"):
                waves = [WAVES[2]] if not has_history else [
                    WAVES[0 if rnd("wave", uid, sid) < 0.5 else 1], WAVES[2]
                ]
                scores = [target] if not has_history else [earlier, target]
                for (date, period), score in zip(waves, scores):
                    assessments.append({
                        "id": "asm-%s-%s-%s-%s" % (uid, sid, period, method.lower()),
                        "subjectId": uid,
                        "raterId": manager_id,
                        "skillId": sid,
                        "score": score,
                        "date": iso(date, 10),
                        "method": method,
                        "type": method,
                        "comment": "%s %s of %s." % (
                            DEMO_NOTE, method.replace("_", " ").title(), skill["name"]),
                        "isArchived": False,
                    })

            elif method == "WORK_RECORD_REVIEW":
                rounds = [(WAVES[2], target)]
                if has_history:
                    rounds.insert(0, (WAVES[0 if rnd("wave", uid, sid) < 0.5 else 1], earlier))
                for (date, period), score in rounds:
                    evidences.append({
                        "id": "ev-%s-%s-%s" % (uid, sid, period),
                        "userId": uid,
                        "skillId": sid,
                        "fileUrl": DEMO_FILE_URL,
                        "fileName": "demo-work-record.txt",
                        "notes": "%s Work record submitted for %s." % (DEMO_NOTE, skill["name"]),
                        "status": "APPROVED",
                        "submittedAt": iso(date, 9),
                        "reviewedAt": iso(plus_days(date, 4), 11),
                        "reviewedBy": manager_id,
                        "assignedScore": score,
                        "reviewerComment": "%s Reviewed and graded at level %d." % (DEMO_NOTE, score),
                    })

            else:  # OJT_OBSERVATION — the only method the 360 blend is reached by
                peer = peers[0] if peers else manager_id
                # Self 10 / Peer 30 / Manager 60: self one notch high is the
                # familiar pattern and still rounds to the target.
                trio = [
                    ("SELF", uid, min(5, target + 1)),
                    ("PEER", peer, target),
                    ("MANAGER", manager_id, target),
                ]
                rounds = [(WAVES[2], trio)]
                if has_history:
                    rounds.insert(0, (WAVES[0], [
                        (t, r, max(1, s - 1)) for (t, r, s) in trio
                    ]))
                for (date, period), members in rounds:
                    for kind, rater, score in members:
                        assessments.append({
                            "id": "asm-%s-%s-%s-%s" % (uid, sid, period, kind.lower()),
                            "subjectId": uid,
                            "raterId": rater,
                            "skillId": sid,
                            "score": score,
                            "date": iso(date, 13),
                            "method": "OJT_OBSERVATION",
                            "type": kind,
                            "comment": "%s %s observation of %s." % (
                                DEMO_NOTE, kind.title(), skill["name"]),
                            "isArchived": False,
                        })

        report.append((uid, user.get("orgLevel"), measured, unknown, blocked_360))

    # A manager with an empty approval queue looks broken. Give the two
    # supervisors something waiting on them — PENDING evidence scores nothing,
    # so this cannot inflate anybody's coverage.
    pending_for = [("u-3448", 2), ("u-3910", 2), ("9bry6ro95", 1), ("u-3851", 1)]
    for uid, count in pending_for:
        user = by_id.get(uid)
        if not user:
            problems.append("pending queue: %s is not in this load" % uid)
            continue
        wrr = [
            r["skillId"] for r in profile_by_id.get(user.get("jobProfileId"), [])
            if skill_by_id.get(r["skillId"], {}).get("method") == "WORK_RECORD_REVIEW"
        ]
        chosen = sorted(wrr, key=lambda sid: rnd("pending", uid, sid))[:count]
        for sid in chosen:
            evidences.append({
                "id": "ev-%s-%s-pending" % (uid, sid),
                "userId": uid,
                "skillId": sid,
                "fileUrl": DEMO_FILE_URL,
                "fileName": "demo-work-record.txt",
                "notes": "%s Work record submitted for %s, awaiting review." % (
                    DEMO_NOTE, skill_by_id[sid]["name"]),
                "status": "PENDING",
                "submittedAt": iso("2026-08-18", 9),
            })

    # validation: refuse rather than write something the app cannot read
    seen = {}
    for row in assessments:
        if not (1 <= row["score"] <= 5):
            problems.append("%s: score %s outside 1-5" % (row["id"], row["score"]))
        if not (WINDOW[0] <= row["date"][:10] <= WINDOW[1]):
            problems.append("%s: date %s outside the demo window" % (row["id"], row["date"][:10]))
        if row["id"] in seen:
            problems.append("%s: duplicate assessment id" % row["id"])
        seen[row["id"]] = True
    for row in evidences:
        if row["id"] in seen:
            problems.append("%s: duplicate evidence id" % row["id"])
        seen[row["id"]] = True
        if row["status"] == "APPROVED" and not row.get("assignedScore"):
            problems.append("%s: APPROVED evidence with no assignedScore scores nothing" % row["id"])
        if row.get("assignedScore") and not (1 <= row["assignedScore"] <= 5):
            problems.append("%s: assignedScore outside 1-5" % row["id"])
        if not (WINDOW[0] <= row["submittedAt"][:10] <= WINDOW[1]):
            problems.append("%s: submittedAt outside the demo window" % row["id"])

    if problems:
        print("REFUSING: %d problem(s):" % len(problems))
        for m in problems[:40]:
            print("  -", m)
        raise SystemExit(1)

    with io.open(os.path.join(DATA, "assessments.json"), "w", encoding="utf-8") as fh:
        json.dump(assessments, fh, ensure_ascii=False, indent=2)
    with io.open(os.path.join(DATA, "evidences.json"), "w", encoding="utf-8") as fh:
        json.dump(evidences, fh, ensure_ascii=False, indent=2)

    print("assessments: %d   evidences: %d" % (len(assessments), len(evidences)))
    print("%-14s %-5s %9s %8s %11s %7s" % (
        "user", "lvl", "measured", "unknown", "360-blocked", "cover%"))
    for uid, lvl, m, u, b in report:
        total = m + u
        print("%-14s %-5s %9d %8d %11d %6.0f%%" % (
            uid, lvl, m, u, b, 100.0 * m / total if total else 0))


if __name__ == "__main__":
    main()
