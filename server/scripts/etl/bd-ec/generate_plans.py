#!/usr/bin/env python3
"""BD / External-Contracts import, step 7 of 9 — GENERATE the demo development plans.

    python scripts/etl/bd-ec/generate_plans.py

Reads data/bd-ec/liveGaps.json (written by dump_gaps.mts) and writes
data/bd-ec/developmentPlans.json — one document per plan, items nested, in the
exact shape src/types.ts DevelopmentPlan describes and store.ts writes.

THESE ARE DEMO PLANS. Nobody agreed them, nobody attended a course and no
supervisor signed anything. Every item says so in its own note fields, and the
loader can remove the lot (`load-plans.mjs --purge`).

What it copies from the app, deliberately, so a generated plan and one saved by
`createDevelopmentPlan` are indistinguishable:

  * a requirement whose score source is NONE is NEVER planned — that is an
    assessment need, not a training gap (proposeDevelopmentPlanItems);
  * priority = gap x criticality weight, banded 2 / 1 (generateIndividualTrainingPlan);
  * targetDate = planning date + 3 months (safety-critical, or a 1-level gap)
    else 6 months;
  * the recommendation names a linked course when one exists, else falls back to
    "intensive training" / "on-the-job training" by depth of gap;
  * levelAtPlanning is FROZEN at the planning cut-off and levelAtSignOff is the
    score re-read at the sign-off cut-off — the before/after pair the feature
    exists to prove. They come from two different dated scorings, never from one.

It REFUSES (exit 1, nothing written) on: an unknown person, a plan with no
items, an item whose planning source is NONE or whose planning gap is <= 0, a
duplicate plan or item id, a sign-off on an item that is not COMPLETED, a
levelAtSignOff on an item with no sign-off, a date out of order, or a plan whose
requested item count cannot be met.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data" / "bd-ec"
GAPS = DATA / "liveGaps.json"
OUT = DATA / "developmentPlans.json"

DEMO = "DEMO DATA - generated for the system trial, not a real agreement."

PLANNING_DATE = "2026-07-05T09:00:00.000Z"
ACTIVATED_DATE = "2026-07-06T08:00:00.000Z"
SIGN_OFF_DATE = "2026-08-18T10:00:00.000Z"
COMPLETED_DATE = "2026-08-19T09:00:00.000Z"
# A target already missed, for the one in-flight item per live plan (see below).
OVERDUE_TARGET_DATE = "2026-08-10T09:00:00.000Z"

# Who gets a plan, in what state, written by whom, and how many items.
# A "few people" (task 7), not everybody: the demo needs plans in every state
# the lifecycle has — draft, active, completed — not ten identical ones.
PLAN_SPECS = [
    # userId,      status,      createdBy,   items, title
    ("u-3448", "ACTIVE", "u-1347", 8, "Development Plan 2026 — External Contracts (Junior)"),
    ("u-3851", "ACTIVE", "u-1347", 6, "Development Plan 2026 — Project Contract Follow-up"),
    ("u-3910", "ACTIVE", "u-1347", 5, "Development Plan 2026 — External Contracts (Fresh)"),
    ("9bry6ro95", "ACTIVE", None, 6, "Development Plan 2026 — Business Development (Senior)"),
    ("u-3852", "COMPLETED", "u-1347", 4, "Development Plan H1 2026 — Contract Follow-up Induction"),
    ("u-1844", "DRAFT", "u-1844", 6, "Development Plan 2026 — Marketing Programs"),
    ("u-560", "DRAFT", "u-560", 6, "Development Plan 2026 — General Manager"),
]

# One item per plan may be cancelled, to exercise the rule that a cancelled item
# leaves the completedPct denominator. Keyed by userId → index within the plan.
CANCELLED_ITEM = {"u-3448": 7}

problems: list[str] = []


def fail(msg: str) -> None:
    problems.append(msg)


def iso(base: str, months: int = 0, days: int = 0) -> str:
    d = datetime.fromisoformat(base.replace("Z", "+00:00")).astimezone(timezone.utc)
    if months:
        month = d.month - 1 + months
        year = d.year + month // 12
        month = month % 12 + 1
        day = min(d.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28,
                          31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
        d = d.replace(year=year, month=month, day=day)
    if days:
        d = d + timedelta(days=days)
    return d.isoformat().replace("+00:00", "Z")


def priority(gap: int, weight: float) -> str:
    score = gap * weight
    return "HIGH" if score >= 2 else "MEDIUM" if score >= 1 else "LOW"


def recommendation(req: dict) -> str:
    course = req.get("course")
    gap = req["planning"]["gap"]
    if course:
        return f'Enroll in "{course["title"]}" ({course["provider"]}) to bridge the gap.'
    if gap >= 2:
        return f'Intensive training and external certification required for {req["skillName"]}.'
    return (
        "On-the-job training and mentorship recommended to reach proficiency level "
        f'{req["requiredLevel"]}.'
    )


def target_date(req: dict) -> str:
    gap = req["planning"]["gap"]
    months = 3 if req["criticality"] == "SAFETY_CRITICAL" else (6 if gap >= 2 else 3)
    return iso(PLANNING_DATE, months=months)


def main() -> int:
    if not GAPS.exists():
        print(f"missing {GAPS} — run dump_gaps.mts first", file=sys.stderr)
        return 1
    dump = json.loads(GAPS.read_text(encoding="utf-8"))
    people = {p["userId"]: p for p in dump["people"]}

    if dump["cutoffs"]["planning"] != PLANNING_DATE.replace("T09:00:00", "T00:00:00"):
        # The dump's planning cut-off must be the day this file plans on, or a
        # frozen level would describe a different moment than the plan claims.
        fail(
            f'planning cut-off mismatch: dump {dump["cutoffs"]["planning"]} vs plan date {PLANNING_DATE}'
        )

    plans = []
    seen_plan_ids: set[str] = set()
    seen_item_ids: set[str] = set()

    for user_id, status, created_by_spec, want_items, title in PLAN_SPECS:
        person = people.get(user_id)
        if person is None:
            fail(f"{user_id}: not a profiled, active person in liveGaps.json — cannot plan")
            continue

        created_by = created_by_spec or person.get("managerId") or user_id
        if created_by != user_id and created_by not in people and created_by != user_id:
            # A supervisor who is not in the dump is still a real user id; only
            # refuse when they are nobody at all.
            if created_by not in {p["userId"] for p in dump["people"]}:
                fail(f"{user_id}: createdBy {created_by} is not an active person")
                continue

        # Plannable = measured (or provisional) AND short at planning time.
        candidates = [
            r for r in person["requirements"]
            if r["planning"]["source"] != "NONE" and r["planning"]["gap"] > 0
        ]
        candidates.sort(
            key=lambda r: (
                -(r["planning"]["gap"] * r["weight"]),
                -r["planning"]["gap"],
                r["skillId"],
            )
        )
        if len(candidates) < want_items:
            fail(
                f'{user_id}: asked for {want_items} items but only {len(candidates)} measured gaps exist'
            )
            continue
        chosen = candidates[:want_items]

        plan_id = f"dp-{user_id}-2026"
        if plan_id in seen_plan_ids:
            fail(f"duplicate plan id {plan_id}")
            continue
        seen_plan_ids.add(plan_id)

        signer = person.get("managerId") or created_by
        items = []
        for idx, req in enumerate(chosen):
            gap = req["planning"]["gap"]
            item_id = f"dpi-{user_id}-{req['skillId']}"
            if item_id in seen_item_ids:
                fail(f"duplicate item id {item_id}")
                continue
            seen_item_ids.add(item_id)

            item = {
                "id": item_id,
                "skillId": req["skillId"],
                "skillName": req["skillName"],
                "requiredLevel": req["requiredLevel"],
                "levelAtPlanning": req["planning"]["score"],
                "gapAtPlanning": gap,
                "sourceAtPlanning": req["planning"]["source"],
                "recommendation": recommendation(req),
                "priority": priority(gap, req["weight"]),
                "status": "NOT_STARTED",
                "targetDate": target_date(req),
                "supervisorSignOff": False,
            }
            if req.get("course"):
                item["courseId"] = req["course"]["id"]
                item["courseTitle"] = req["course"]["title"]

            if status == "DRAFT":
                # Nothing is agreed yet, so nothing has started and nothing can
                # have been signed off.
                pass
            elif CANCELLED_ITEM.get(user_id) == idx:
                item["status"] = "CANCELLED"
                item["completionNote"] = f"{DEMO} Cancelled - the course did not run in this cycle."
            else:
                # A plan in flight is a THIRD done, not all of it: an ACTIVE
                # plan whose every item is finished should have been closed,
                # and a demo where nothing is outstanding shows no queue to
                # anybody. Rotation by position keeps it deterministic.
                phase = idx % 3
                if status == "COMPLETED" or phase == 0:
                    item["status"] = "COMPLETED"
                    item["startedAt"] = iso(ACTIVATED_DATE, days=7)
                    item["completedAt"] = iso(SIGN_OFF_DATE, days=-4)
                    item["completionNote"] = (
                        f'{DEMO} Training completed and applied on the job for {req["skillName"]}.'
                    )
                    # The FIRST completed item of a live plan is left waiting on
                    # the supervisor, so the Development Sign-Off queue in
                    # SupervisorApproval has real work in it. A demo where every
                    # manager queue is empty shows the manager nothing.
                    if status == "ACTIVE" and idx == 0:
                        item["completionNote"] += " Awaiting supervisor sign-off."
                    else:
                        item["supervisorSignOff"] = True
                        item["signedOffBy"] = signer
                        item["signedOffAt"] = SIGN_OFF_DATE
                        item["levelAtSignOff"] = req["signOff"]["score"]
                        item["signOffComment"] = (
                            f'{DEMO} Verified at level {req["signOff"]["score"]} against a required '
                            f'{req["requiredLevel"]}.'
                        )
                elif phase == 1:
                    item["status"] = "IN_PROGRESS"
                    item["startedAt"] = iso(ACTIVATED_DATE, days=14)
                    # One in-flight item per live plan is deliberately PAST its
                    # target date: the nightly sweep chases overdue items on
                    # ACTIVE plans, and with every target in the future it would
                    # have nothing to chase and the overdue styling never shows.
                    if idx == 1:
                        item["targetDate"] = OVERDUE_TARGET_DATE

            items.append(item)

        if not items:
            fail(f"{user_id}: plan would have no items")
            continue

        cov = person["coverage"]["planning"]
        plan = {
            "id": plan_id,
            "userId": user_id,
            "title": title,
            "status": status,
            "items": items,
            "jobProfileId": person["jobProfileId"],
            "createdAt": PLANNING_DATE,
            "createdBy": created_by,
            "updatedAt": SIGN_OFF_DATE if status != "DRAFT" else PLANNING_DATE,
            "coverageAtPlanning": {
                "required": cov["required"],
                "measured": cov["measured"],
                "provisional": cov["provisional"],
                "unknown": cov["unknown"],
            },
            "notes": (
                f"{DEMO} Built from the measured gaps as they stood on "
                f"{PLANNING_DATE[:10]}; never-assessed requirements are deliberately excluded."
            ),
        }
        if status in ("ACTIVE", "COMPLETED"):
            plan["activatedAt"] = ACTIVATED_DATE
        if status == "COMPLETED":
            plan["completedAt"] = COMPLETED_DATE

        plans.append(plan)

    # ── Validation ──────────────────────────────────────────────────────────
    for plan in plans:
        for item in plan["items"]:
            if item["sourceAtPlanning"] == "NONE":
                fail(f'{plan["id"]}/{item["id"]}: planned a never-assessed skill')
            if item["gapAtPlanning"] <= 0:
                fail(f'{plan["id"]}/{item["id"]}: item with no gap')
            if item["levelAtPlanning"] + item["gapAtPlanning"] != item["requiredLevel"]:
                fail(f'{plan["id"]}/{item["id"]}: level + gap does not equal requiredLevel')
            if item["supervisorSignOff"] and item.get("levelAtSignOff") is None:
                fail(f'{plan["id"]}/{item["id"]}: signed off with no level re-read')
            if item["supervisorSignOff"] and item["status"] != "COMPLETED":
                fail(f'{plan["id"]}/{item["id"]}: signed off but status {item["status"]}')
            if "levelAtSignOff" in item and not item["supervisorSignOff"]:
                fail(f'{plan["id"]}/{item["id"]}: levelAtSignOff without a sign-off')
            if item.get("completedAt") and item["completedAt"] < plan["createdAt"]:
                fail(f'{plan["id"]}/{item["id"]}: completed before the plan was written')
            if item.get("signedOffAt") and item.get("completedAt") and item["signedOffAt"] < item["completedAt"]:
                fail(f'{plan["id"]}/{item["id"]}: signed off before it was completed')
            if plan["status"] == "DRAFT" and item["status"] != "NOT_STARTED":
                fail(f'{plan["id"]}/{item["id"]}: a DRAFT plan cannot have work in progress')
        if plan["status"] == "COMPLETED" and any(
            i["status"] not in ("COMPLETED", "CANCELLED") for i in plan["items"]
        ):
            fail(f'{plan["id"]}: COMPLETED plan still has open items')

    if problems:
        print("REFUSING to write — fix these first:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1

    OUT.write_text(json.dumps(plans, indent=2, ensure_ascii=False), encoding="utf-8")

    total_items = sum(len(p["items"]) for p in plans)
    signed = sum(1 for p in plans for i in p["items"] if i["supervisorSignOff"])
    improved = sum(
        1 for p in plans for i in p["items"]
        if i.get("levelAtSignOff") is not None and i["levelAtSignOff"] > i["levelAtPlanning"]
    )
    print(f"Wrote {OUT}")
    print(f"  plans {len(plans)}  items {total_items}  signed off {signed}  level rose after sign-off {improved}")
    for p in plans:
        counts: dict[str, int] = {}
        for i in p["items"]:
            counts[i["status"]] = counts.get(i["status"], 0) + 1
        breakdown = " ".join(f"{k.lower()}={v}" for k, v in sorted(counts.items()))
        print(f'  {p["id"]:<24} {p["status"]:<10} items {len(p["items"]):>2}  {breakdown}')
    return 0


if __name__ == "__main__":
    sys.exit(main())
