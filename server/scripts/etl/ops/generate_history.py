# Operations (Canal Cities & Sinai) demo history, step 2 of 3 - GENERATE TWO
# YEARS of assessment history + evidence records for the invented roster.
#
#   python scripts/etl/ops/generate_history.py
#
# Reads  data/ops/livePlacement.json  (written by dump_placement.mjs - the LIVE
#        placement, never users.json, which is only what the load wrote).
# Writes data/ops/assessments.json, data/ops/evidences.json
#
# ############################################################################
# THESE ARE DEMO SCORES FOR INVENTED PEOPLE. Nobody was evaluated. They exist so
# the system can be shown as if the Operations department had been using it for
# two years. Every record says so in its own comment / notes field, and every id
# carries the person's `u-9...` test-data id, so the whole two years is one
# DELETE away. Remove them before the system carries a real appraisal.
# ############################################################################
#
# The rules this generator obeys (the same as the bd-ec generator next door,
# plus tenure):
#
# 1. A record is written ONLY in the shape the skill's own configuration can be
#    scored from (store.ts `computeSkillScore`):
#      * WRITTEN_EXAM / INTERVIEW / PRACTICAL_DEMO -> a direct record of the same
#        type; the LATEST one wins, so history is "earlier, lower".
#      * WORK_RECORD_REVIEW -> APPROVED evidence carrying an assignedScore; the
#        HIGHEST wins, so history is "earlier, lower" too.
#      * OJT_OBSERVATION -> a SELF / PEER / MANAGER trio (weights 10/30/60),
#        counted latest-per-rater.
#      * THREE_SIXTY_EVALUATION -> NOTHING IS WRITTEN. `computeSkillScore` takes
#        the 360 branch only when the primary method is exactly OJT_OBSERVATION,
#        so SELF/PEER/MANAGER rows on these skills would score nothing and only
#        look assessed. They are left unmeasured and counted in the report.
# 2. Coverage stays honest. Roughly a third of every person's requirements has
#    never been looked at, so the measured / unknown split on every screen shows
#    a real hole instead of a screen full of green - and "X of Y measured" keeps
#    meaning something.
# 3. Nobody is assessed before they arrived. Each person gets a joining wave from
#    their rung (a Fresh engineer has months of history, a Section Head two
#    years), and no record is dated before it.
# 4. Every id is derived from (subject, skill, period, type), so a re-run updates
#    in place instead of doubling the history.
#
# It also keeps the file under the API's 10,000-row page cap: the SPA reads a
# collection in ONE bounded query, so a history bigger than that would be
# silently truncated in the browser and every score computed from a partial set.
import datetime
import hashlib
import io
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data", "ops")

DEMO_NOTE = "DEMO DATA - invented for the system trial, not a real evaluation."
# An honest attachment: a real, downloadable file that says what it is. An empty
# fileUrl renders a dead Download link on the approval screen.
DEMO_FILE_URL = (
    "data:text/plain;base64,"
    "REVNTyBldmlkZW5jZSByZWNvcmQgLSBubyByZWFsIGRvY3VtZW50IGlzIGF0dGFjaGVkLg=="
)

# Two years of half-yearly evaluation campaigns, oldest first.
WAVES = [
    ("2024-11-13", "2024-11"),
    ("2025-05-14", "2025-05"),
    ("2025-11-12", "2025-11"),
    ("2026-05-13", "2026-05"),
    ("2026-08-19", "2026-08"),
]
WINDOW = ("2024-11-01", "2026-09-09")  # nothing may be dated outside the demo window
ROW_CAP = 8000  # keep the collection well under the API's 10,000-row page cap

SENIOR = {"GM", "AGM", "DM", "SH", "SP"}

# When each rung joined, as a wave index: the further down the ladder, the more
# recent the arrival. (index, weight)
JOINED = {
    "AGM": [(0, 1.0)],
    "DM": [(0, 1.0)],
    "SH": [(0, 0.8), (1, 0.2)],
    "SP": [(0, 0.55), (1, 0.30), (2, 0.15)],
    "JP": [(0, 0.30), (1, 0.30), (2, 0.25), (3, 0.15)],
    "FR": [(2, 0.35), (3, 0.45), (4, 0.20)],
}


def load(name):
    with io.open(os.path.join(DATA, name), encoding="utf-8") as fh:
        return json.load(fh)


def rnd(*parts):
    """Deterministic 0..1 - same inputs, same two years, every run."""
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
        print("Run: node scripts/etl/ops/dump_placement.mjs")
        raise SystemExit(1)
    live = load("livePlacement.json")
    users = live["users"]
    admin_id = live.get("adminId")

    problems = []
    if not admin_id:
        problems.append("livePlacement.json has no admin id (rater of last resort)")

    skill_by_id = {
        s["id"]: {"name": s["name"], "method": s["method"]} for s in live["skills"]
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

        level = user.get("orgLevel")
        # Rule 3 - when this person arrived. Everything before it is dropped.
        start = pick(rnd("joined", uid), JOINED.get(level, [(0, 1.0)]))

        # Peers for the 360 blend: same rung, same unit first.
        peers = [o["id"] for o in users if o["id"] != uid and o.get("orgLevel") == level]
        peers.sort(key=lambda pid: (by_id[pid].get("departmentId") != user.get("departmentId"), pid))

        senior = level in SENIOR
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
                blocked_360 += 1
                unknown += 1
                continue

            # Rule 2 - leave a real hole. A third of the requirements has never
            # been looked at; a newcomer has been looked at less.
            hole = 0.30 if start <= 1 else 0.42
            if rnd("cover", uid, sid) < hole:
                unknown += 1
                continue

            # Where the person stands TODAY: around the requirement, a little
            # above it on the senior rungs, a little below on the junior ones.
            delta = pick(rnd("delta", uid, sid), [
                (1, 0.14), (0, 0.46), (-1, 0.28), (-2, 0.12)
            ] if senior else [
                (1, 0.08), (0, 0.36), (-1, 0.34), (-2, 0.22)
            ])
            target = max(1, min(5, required + delta))
            measured += 1

            # The campaign this skill was last looked at in, and how many earlier
            # readings sit behind it (the progression: each one a level lower).
            latest = pick(rnd("latest", uid, sid), [(4, 0.60), (3, 0.25), (2, 0.15)])
            latest = max(start, latest)
            depth = pick(rnd("depth", uid, sid), [(1, 0.55), (2, 0.33), (3, 0.12)])
            depth = min(depth, latest - start + 1, target)  # a score never starts below 1
            rounds = []
            for k in range(depth):
                wave_idx = latest - (depth - 1 - k)
                rounds.append((WAVES[wave_idx], max(1, target - (depth - 1 - k))))

            if method in ("WRITTEN_EXAM", "INTERVIEW", "PRACTICAL_DEMO"):
                for (date, period), score in rounds:
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

            else:  # OJT_OBSERVATION - the only method the 360 blend is reached by
                peer = peers[0] if peers else manager_id
                # Only the two most recent readings keep a trio: a 360 costs
                # three rows where an exam costs one, and the row budget is real.
                for (date, period), score in rounds[-2:]:
                    trio = [
                        ("SELF", uid, min(5, score + 1)),
                        ("PEER", peer, score),
                        ("MANAGER", manager_id, score),
                    ]
                    for kind, rater, s in trio:
                        assessments.append({
                            "id": "asm-%s-%s-%s-%s" % (uid, sid, period, kind.lower()),
                            "subjectId": uid,
                            "raterId": rater,
                            "skillId": sid,
                            "score": s,
                            "date": iso(date, 13),
                            "method": "OJT_OBSERVATION",
                            "type": kind,
                            "comment": "%s %s observation of %s." % (
                                DEMO_NOTE, kind.title(), skill["name"]),
                            "isArchived": False,
                        })

        report.append((uid, level, start, measured, unknown, blocked_360))

    # A supervisor with an empty approval queue looks broken. Give every
    # supervisor something waiting on them - PENDING evidence scores nothing, so
    # this cannot inflate anybody's coverage.
    supervisors = sorted({u.get("managerId") for u in users if u.get("managerId")})
    for sup in supervisors:
        team = sorted([u["id"] for u in users if u.get("managerId") == sup])
        for uid in team[:2]:
            user = by_id[uid]
            wrr = [
                r["skillId"] for r in profile_by_id.get(user.get("jobProfileId"), [])
                if skill_by_id.get(r["skillId"], {}).get("method") == "WORK_RECORD_REVIEW"
            ]
            chosen = sorted(wrr, key=lambda sid: rnd("pending", uid, sid))[:1]
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
                    "submittedAt": iso("2026-09-01", 9),
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
    if len(assessments) > ROW_CAP or len(evidences) > ROW_CAP:
        problems.append(
            "%d assessments / %d evidences exceed the %d-row budget - the browser reads a "
            "collection in ONE bounded query (MAX_PAGE_SIZE 10,000) and would score people "
            "from a truncated set" % (len(assessments), len(evidences), ROW_CAP))

    if problems:
        print("REFUSING: %d problem(s):" % len(problems))
        for m in problems[:40]:
            print("  -", m)
        raise SystemExit(1)

    with io.open(os.path.join(DATA, "assessments.json"), "w", encoding="utf-8") as fh:
        json.dump(assessments, fh, ensure_ascii=False, indent=2)
    with io.open(os.path.join(DATA, "evidences.json"), "w", encoding="utf-8") as fh:
        json.dump(evidences, fh, ensure_ascii=False, indent=2)

    tot_m = sum(r[3] for r in report)
    tot_u = sum(r[4] for r in report)
    print("assessments: %d   evidences: %d" % (len(assessments), len(evidences)))
    print("requirements: %d measured / %d unknown (%.0f%% coverage)" % (
        tot_m, tot_u, 100.0 * tot_m / (tot_m + tot_u) if tot_m + tot_u else 0))
    print("%-10s %-4s %8s %9s %8s %12s %7s" % (
        "user", "lvl", "joined", "measured", "unknown", "360-blocked", "cover%"))
    for uid, lvl, start, m, u, b in report:
        total = m + u
        print("%-10s %-4s %8s %9d %8d %12d %6.0f%%" % (
            uid, lvl, WAVES[start][1], m, u, b, 100.0 * m / total if total else 0))


if __name__ == "__main__":
    main()
