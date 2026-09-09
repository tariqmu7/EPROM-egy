# Operations (Canal Cities & Sinai) demo data, phase 3 task 3 - GENERATE the
# certificates and the external work experience of the invented roster.
#
#   python scripts/etl/ops/generate_certs_experience.py
#
# Reads  data/ops/livePlacement.json  (written by dump_placement.mjs - the LIVE
#        placement, never users.json)
#        data/ops/assessments.json + evidences.json (written by
#        generate_history.py) - so a work experience can be tagged on skills
#        that history left UNMEASURED, which is the only way the provisional
#        (EXPERIENCE) score source is ever exercised.
# Writes data/ops/certificates.json, data/ops/workExperiences.json
#
# ############################################################################
# THESE ARE INVENTED CERTIFICATES AND INVENTED PREVIOUS EMPLOYERS. Nobody holds
# them. Every issuer and every employer name carries "(DEMO)", every credential
# id starts with DEMO-, and every id embeds the person's `u-9...` test-data id,
# so the whole lot is one DELETE away. Remove them before the system carries a
# real record.
# ############################################################################
#
# The rules this generator obeys:
#
# 1. THE BANDING IS THE APP'S OWN. `renewalStatus` is computed exactly as
#    `server/src/jobs/scheduling.ts certificateStatus` does (<=0 days EXPIRED,
#    <=90 EXPIRING_SOON, else VALID) against TODAY, so the nightly sweep agrees
#    with what was loaded instead of re-banding all of it on its first run. The
#    mix is deliberate: most valid, a slice inside the 90-day window and a few
#    already expired, so the Certificates tab, the renewal colours and the
#    sweep's 90/60/30/expired warnings all have something real to show.
# 2. A SUBMISSION NEVER CARRIES ITS OWN VERDICT. A PENDING work experience has
#    no reviewer fields and no `verifiedLevel` on any skill - exactly what the
#    API would enforce on a browser write (authz.ts). Only a VERIFIED record
#    carries `verifiedLevel`, and only its owner's own manager reviewed it.
# 3. A VERIFIED RECORD IS TAGGED ONLY ON SKILLS NOTHING HAS MEASURED, so it
#    creates a provisional score instead of being silently outranked - a real
#    assessment always wins (`computeSkillScore` reaches the experience tier
#    only when the score is still 0). The provisional level is capped at the
#    policy's `maxProvisionalLevel` (3) the same way the app caps it.
# 4. THE HOLES STAY. Only a minority of people have external experience, and
#    each record tags a handful of skills, so "X of Y measured" still means
#    something: a provisional score counts as KNOWN, never as MEASURED.
# 5. Every id is derived from (person, certificate) / (person, employer), so a
#    re-run updates in place instead of doubling anybody's file.
import base64
import datetime
import hashlib
import io
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data", "ops")

# The demo's reference date. Certificate expiries are offsets from it, so the
# VALID / EXPIRING_SOON / EXPIRED mix is centred here - re-run the generator and
# the loader to re-centre the demo on a later day.
TODAY = datetime.date(2026, 9, 9)
WINDOW = (datetime.date(2024, 11, 1), TODAY)  # work experience is filed inside the demo window

DEMO_NOTE = "DEMO DATA - invented for the system trial, not a real record."
MAX_PROVISIONAL = 3  # DEFAULT_WORK_EXPERIENCE_POLICY.maxProvisionalLevel
# src/constants/experiencePolicy.ts DEFAULT_WORK_EXPERIENCE_POLICY.bands
BANDS = [(0, 2, 2), (2, 5, 3), (5, 10, 4), (10, None, 5)]


def build_demo_pdf():
    """A real, openable one-page PDF that says what it is.

    An empty fileUrl renders a dead Download link on the approval screen, and a
    `data:text/plain` one would be rejected by the server's attachment rule for
    a certificate (schemas.ts ATTACHMENT_MIME) - which polices every fileUrl
    inside users.certificates, so a bad one would 422 the NEXT edit of that
    person's profile.
    """
    text = "DEMO CERTIFICATE - invented for the EPROM competency system trial."
    stream = "BT /F1 12 Tf 40 780 Td (%s) Tj ET" % text
    objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        "<< /Length %d >>\nstream\n%s\nendstream" % (len(stream), stream),
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = "%PDF-1.4\n"
    offsets = []
    for i, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += "%d 0 obj\n%s\nendobj\n" % (i, body)
    start = len(out)
    out += "xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    for off in offsets:
        out += "%010d 00000 n \n" % off
    out += ("trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%EOF\n"
            % (len(objects) + 1, start))
    return "data:application/pdf;base64," + base64.b64encode(out.encode("latin-1")).decode("ascii")


DEMO_PDF = build_demo_pdf()

# The certificate catalogue: (key, name, issuer, category, validity years or
# None for a lifetime award, the rungs it is plausible on).
ALL = ("AGM", "DM", "SH", "SP", "JP", "FR")
SENIOR = ("AGM", "DM", "SH")
CERTIFICATES = [
    ("h2s", "H2S Awareness and Escape Breathing Apparatus",
     "Egyptian Petroleum Safety Academy (DEMO)", "SAFETY", 2, ALL),
    ("firefight", "Basic Fire Fighting and Foam Systems",
     "Egyptian Petroleum Safety Academy (DEMO)", "SAFETY", 2, ALL),
    ("firstaid", "First Aid and CPR",
     "Egyptian Red Crescent Training Centre (DEMO)", "SAFETY", 3, ALL),
    ("confined", "Confined Space Entry and Rescue",
     "Suez Industrial Safety Institute (DEMO)", "SAFETY", 2, ("SH", "SP", "JP", "FR")),
    ("ptw", "Permit to Work - Issuing Authority",
     "EPROM Training Centre (DEMO)", "SAFETY", 3, ("DM", "SH", "SP", "JP")),
    ("height", "Working at Height and Fall Protection",
     "Suez Industrial Safety Institute (DEMO)", "SAFETY", 2, ("SP", "JP", "FR")),
    ("gastester", "Authorised Gas Tester Level 2",
     "Suez Industrial Safety Institute (DEMO)", "TECHNICAL", 2, ("SH", "SP", "JP")),
    ("gauging", "Tank Gauging and Custody Transfer Measurement",
     "Nile Metrology Institute (DEMO)", "TECHNICAL", 3, ("DM", "SH", "SP", "JP")),
    ("lpg", "LPG Handling and Storage Safety",
     "Egyptian Petroleum Safety Academy (DEMO)", "TECHNICAL", 3, ("SH", "SP", "JP")),
    ("marine", "Marine Loading Arm Operation and Emergency Release",
     "Red Sea Marine Training Centre (DEMO)", "TECHNICAL", 3, ("SH", "SP", "JP")),
    ("nebosh", "NEBOSH International General Certificate",
     "NEBOSH-accredited centre, Cairo (DEMO)", "PROFESSIONAL", None, ("AGM", "DM", "SH", "SP")),
    ("iosh", "IOSH Managing Safely",
     "IOSH-accredited centre, Cairo (DEMO)", "PROFESSIONAL", 3, ("AGM", "DM", "SH", "SP")),
    ("iso9001", "ISO 9001:2015 Lead Auditor",
     "Cairo Quality Register (DEMO)", "PROFESSIONAL", 3, SENIOR),
    ("pmp", "Project Management Professional (PMP)",
     "PMI-authorised training partner, Cairo (DEMO)", "PROFESSIONAL", 3, ("AGM", "DM", "SH")),
]
DEGREES = [
    ("bsc-chem", "B.Sc. Chemical Engineering", "Bachelor", "Suez Canal University (DEMO)"),
    ("bsc-mech", "B.Sc. Mechanical Engineering", "Bachelor", "Port Said University (DEMO)"),
    ("bsc-petro", "B.Sc. Petroleum Engineering", "Bachelor", "Al-Azhar University (DEMO)"),
    ("bsc-elec", "B.Sc. Electrical Engineering", "Bachelor", "Zagazig University (DEMO)"),
]
# How many taught certificates each rung carries (before any degree).
CERT_COUNT = {"AGM": 4, "DM": 4, "SH": 3, "SP": 3, "JP": 2, "FR": 2}

# External employers - all invented.
EMPLOYERS = [
    ("Nile Delta Tank Terminals (DEMO)", "Damietta"),
    ("Sinai Bulk Storage Company (DEMO)", "El-Tor"),
    ("Red Sea Marine Terminals (DEMO)", "Safaga"),
    ("Horus Petroleum Services (DEMO)", "Cairo"),
    ("Alexandria Liquid Bulk Company (DEMO)", "Alexandria"),
    ("Gulf of Suez Logistics (DEMO)", "Ain Sokhna"),
]
PRIOR_TITLE = {
    "AGM": "Terminal Operations Manager",
    "DM": "Storage Operations Superintendent",
    "SH": "Tank Farm Section Head",
    "SP": "Senior Operations Engineer",
    "JP": "Operations Engineer",
    "FR": "Operations Trainee",
}
# How likely each rung is to have worked somewhere else first, how long that
# job lasted, and how many years ago it ended (they joined EPROM after it).
HAS_PRIOR = {"AGM": 1.0, "DM": 1.0, "SH": 0.80, "SP": 0.60, "JP": 0.45, "FR": 0.35}
PRIOR_YEARS = {"AGM": (7, 11), "DM": (6, 10), "SH": (4, 8), "SP": (3, 6), "JP": (2, 4), "FR": (0.5, 1)}
LEFT_YEARS_AGO = {"AGM": 9, "DM": 8, "SH": 6, "SP": 4, "JP": 3, "FR": 1}


def load(name):
    with io.open(os.path.join(DATA, name), encoding="utf-8") as fh:
        return json.load(fh)


def rnd(*parts):
    """Deterministic 0..1 - same inputs, same demo, every run."""
    h = hashlib.md5("|".join(str(p) for p in parts).encode("utf-8")).hexdigest()
    return int(h[:12], 16) / float(0x1000000000000)


def pick(r, weighted):
    acc = 0.0
    for value, weight in weighted:
        acc += weight
        if r < acc:
            return value
    return weighted[-1][0]


def spread(r, low, high):
    return low + r * (high - low)


def days(date, n):
    return date + datetime.timedelta(days=int(round(n)))


def iso(date, hour=9):
    return "%sT%02d:00:00.000Z" % (date.isoformat(), hour)


def renewal_status(expiry):
    """server/src/jobs/scheduling.ts certificateStatus, in whole days."""
    diff = (expiry - TODAY).days
    if diff <= 0:
        return "EXPIRED"
    if diff <= 90:
        return "EXPIRING_SOON"
    return "VALID"


def suggest_level(years):
    for lo, hi, level in BANDS:
        if years >= lo and (hi is None or years < hi):
            return level
    return 0


def build_certificates(users, problems):
    out = []
    for user in users:
        uid = user["id"]
        level = user.get("orgLevel")
        pool = [c for c in CERTIFICATES if level in c[5]]
        pool.sort(key=lambda c: rnd("certpick", uid, c[0]))
        chosen = pool[: CERT_COUNT.get(level, 2)]

        certs = []
        for key, name, issuer, category, validity, _rungs in chosen:
            # A slice of the file is still waiting on a supervisor, so the
            # certificate approval queue is not empty either.
            pending = rnd("certpending", uid, key) < 0.10
            if validity is None:
                achieved = days(TODAY, -365 * spread(rnd("certold", uid, key), 3, 14))
                cert = {
                    "id": "cert-%s-%s" % (uid, key),
                    "name": name,
                    "issuer": issuer,
                    "category": category,
                    "dateAchieved": achieved.isoformat(),
                    "noExpiry": True,
                }
            else:
                bucket = pick(rnd("certstate", uid, key),
                              [("valid", 0.62), ("soon", 0.22), ("expired", 0.16)])
                if bucket == "valid":
                    offset = spread(rnd("certoff", uid, key), 110, 700)
                elif bucket == "soon":
                    offset = spread(rnd("certoff", uid, key), 8, 88)
                else:
                    offset = -spread(rnd("certoff", uid, key), 4, 260)
                expiry = days(TODAY, offset)
                achieved = days(expiry, -365 * validity)
                cert = {
                    "id": "cert-%s-%s" % (uid, key),
                    "name": name,
                    "issuer": issuer,
                    "category": category,
                    "dateAchieved": achieved.isoformat(),
                    "expiryDate": expiry.isoformat(),
                    "noExpiry": False,
                    "renewalStatus": renewal_status(expiry),
                }
            cert["status"] = "PENDING" if pending else "APPROVED"
            cert["credentialId"] = "DEMO-%s-%s" % (key.upper(), uid.replace("u-", ""))
            cert["fileUrl"] = DEMO_PDF
            cert["fileName"] = "demo-certificate.pdf"
            certs.append(cert)

        # An engineering degree for most of the roster - the academic category
        # and the "no expiry" path both need something to render.
        if rnd("degree", uid) < 0.75:
            key, name, degree, issuer = DEGREES[int(rnd("degreepick", uid) * len(DEGREES)) % len(DEGREES)]
            graduated = days(TODAY, -365 * spread(rnd("gradyear", uid), 2, 25))
            certs.append({
                "id": "cert-%s-%s" % (uid, key),
                "name": name,
                "degree": degree,
                "issuer": issuer,
                "category": "ACADEMIC",
                "dateAchieved": graduated.isoformat(),
                "noExpiry": True,
                "status": "APPROVED",
                "credentialId": "DEMO-DEG-%s" % uid.replace("u-", ""),
                "fileUrl": DEMO_PDF,
                "fileName": "demo-certificate.pdf",
            })

        for cert in certs:
            if cert.get("expiryDate"):
                if cert["expiryDate"] <= cert["dateAchieved"]:
                    problems.append("%s: expiry %s is not after the award date %s"
                                    % (cert["id"], cert["expiryDate"], cert["dateAchieved"]))
                expiry = datetime.date(*[int(x) for x in cert["expiryDate"].split("-")])
                if cert["renewalStatus"] != renewal_status(expiry):
                    problems.append("%s: renewalStatus disagrees with its own expiry date" % cert["id"])
        out.append({"userId": uid, "name": user.get("name"), "certificates": certs})
    return out


def build_experience(users, by_id, admin_id, unscored, skill_by_id, problems):
    out = []
    for user in users:
        uid = user["id"]
        level = user.get("orgLevel")
        if rnd("hasprior", uid) >= HAS_PRIOR.get(level, 0.4):
            continue

        employer, location = EMPLOYERS[int(rnd("employer", uid) * len(EMPLOYERS)) % len(EMPLOYERS)]
        lo, hi = PRIOR_YEARS.get(level, (2, 4))
        span = round(spread(rnd("span", uid), lo, hi), 1)
        end = days(TODAY, -365 * LEFT_YEARS_AGO.get(level, 3))
        start = days(end, -365 * span)

        status = pick(rnd("westatus", uid), [("VERIFIED", 0.65), ("PENDING", 0.25), ("REJECTED", 0.10)])
        # A pending record is recent, so the verification queue looks live; a
        # settled one was filed when the person joined.
        if status == "PENDING":
            submitted = days(TODAY, -spread(rnd("wesub", uid), 3, 40))
        else:
            submitted = days(end, spread(rnd("wesub", uid), 10, 60))
        if submitted < WINDOW[0]:
            submitted = days(WINDOW[0], spread(rnd("wesub2", uid), 1, 90))
        if submitted > WINDOW[1]:
            submitted = WINDOW[1]

        # Rule 3 - only skills NOTHING has measured, so the record actually
        # produces a provisional score instead of being outranked by a real one.
        candidates = [sid for sid in unscored.get(uid, [])
                      if skill_by_id.get(sid, {}).get("category") != "Behavioral"]
        candidates.sort(key=lambda sid: rnd("weskill", uid, sid))
        take = int(pick(rnd("wecount", uid), [(2, 0.30), (3, 0.35), (4, 0.25), (5, 0.10)]))
        tagged = candidates[:take]
        if not tagged:
            continue

        suggested = suggest_level(span)
        skills = []
        for sid in tagged:
            claimed = max(1, min(5, suggested + pick(rnd("weclaim", uid, sid), [(0, 0.7), (1, 0.3)])))
            entry = {
                "skillId": sid,
                "claimedLevel": claimed,
                "yearsApplied": span,
                "suggestedLevel": suggested,
            }
            if status == "VERIFIED":
                # The verifier's call, then the policy cap. A verifier who trims
                # a level is normal; nobody is credited above the cap.
                trimmed = suggested - pick(rnd("weverify", uid, sid), [(0, 0.6), (1, 0.4)])
                entry["verifiedLevel"] = max(1, min(MAX_PROVISIONAL, trimmed))
            skills.append(entry)

        record = {
            "id": "we-%s-%s" % (uid, employer.split()[0].lower()),
            "userId": uid,
            "employer": employer,
            "jobTitle": PRIOR_TITLE.get(level, "Operations Engineer"),
            "employmentType": "INTERNSHIP" if level == "FR" else pick(
                rnd("wetype", uid), [("FULL_TIME", 0.8), ("CONTRACT", 0.15), ("SECONDMENT", 0.05)]),
            "location": location,
            "startDate": start.isoformat(),
            "endDate": end.isoformat(),
            "isCurrent": False,
            "responsibilities": "%s Storage and terminal operations at %s." % (DEMO_NOTE, employer),
            "skills": skills,
            "status": status,
            "submittedAt": iso(submitted),
            "fileUrl": DEMO_PDF,
            "fileName": "demo-certificate.pdf",
        }
        if status != "PENDING":
            reviewer = user.get("managerId") or admin_id
            if reviewer != admin_id and reviewer not in by_id:
                problems.append("%s: reviewer %s is not in this load" % (record["id"], reviewer))
            record["reviewedAt"] = iso(days(submitted, spread(rnd("werev", uid), 3, 21)), 11)
            record["reviewedBy"] = reviewer
            record["reviewerComment"] = (
                "%s Employment letter sighted; levels set from the band table." % DEMO_NOTE
                if status == "VERIFIED"
                else "%s No employment letter attached - please re-submit with proof." % DEMO_NOTE)
        out.append(record)
    return out


def main():
    for name in ("livePlacement.json", "assessments.json", "evidences.json"):
        if not os.path.exists(os.path.join(DATA, name)):
            print("REFUSING: %s is missing." % name)
            print("Run: node scripts/etl/ops/dump_placement.mjs "
                  "&& python scripts/etl/ops/generate_history.py")
            raise SystemExit(1)

    live = load("livePlacement.json")
    users = sorted(live["users"], key=lambda u: u["id"])
    by_id = {u["id"]: u for u in users}
    admin_id = live.get("adminId")
    skill_by_id = {s["id"]: s for s in live["skills"]}
    profile_by_id = {p["id"]: p["requiredSkills"] for p in live["jobProfiles"]}

    problems = []
    if not admin_id:
        problems.append("livePlacement.json has no admin id (reviewer of last resort)")

    # What history left unmeasured, per person: a requirement with no assessment
    # row and no scored APPROVED evidence.
    scored = set()
    for a in load("assessments.json"):
        scored.add((a["subjectId"], a["skillId"]))
    for e in load("evidences.json"):
        if e.get("status") == "APPROVED" and e.get("assignedScore"):
            scored.add((e["userId"], e["skillId"]))
    unscored = {}
    for user in users:
        reqs = profile_by_id.get(user.get("jobProfileId"), [])
        unscored[user["id"]] = [r["skillId"] for r in reqs
                                if (user["id"], r["skillId"]) not in scored
                                and r["skillId"] in skill_by_id]

    certificates = build_certificates(users, problems)
    experiences = build_experience(users, by_id, admin_id, unscored, skill_by_id, problems)

    # validation: refuse rather than write something the app cannot read
    seen = set()
    for row in certificates:
        for cert in row["certificates"]:
            if cert["id"] in seen:
                problems.append("%s: duplicate certificate id" % cert["id"])
            seen.add(cert["id"])
            if not cert["fileUrl"].startswith("data:application/pdf;base64,"):
                problems.append("%s: fileUrl is not an allowlisted attachment type" % cert["id"])
    for row in experiences:
        if row["id"] in seen:
            problems.append("%s: duplicate work-experience id" % row["id"])
        seen.add(row["id"])
        if not (WINDOW[0].isoformat() <= row["submittedAt"][:10] <= WINDOW[1].isoformat()):
            problems.append("%s: submittedAt %s outside the demo window"
                            % (row["id"], row["submittedAt"][:10]))
        if row["startDate"] >= row["endDate"]:
            problems.append("%s: start date is not before the end date" % row["id"])
        for s in row["skills"]:
            has_verdict = "verifiedLevel" in s
            if row["status"] == "VERIFIED" and not has_verdict:
                problems.append("%s: VERIFIED entry with no verifiedLevel credits nothing" % row["id"])
            if row["status"] != "VERIFIED" and has_verdict:
                problems.append("%s: a %s record must not carry a verdict" % (row["id"], row["status"]))
            if has_verdict and not (1 <= s["verifiedLevel"] <= MAX_PROVISIONAL):
                problems.append("%s: verifiedLevel %s outside 1-%d"
                                % (row["id"], s["verifiedLevel"], MAX_PROVISIONAL))
            if not (1 <= s["claimedLevel"] <= 5):
                problems.append("%s: claimedLevel outside 1-5" % row["id"])
        if row["status"] == "PENDING" and (row.get("reviewedBy") or row.get("reviewedAt")):
            problems.append("%s: PENDING record carries reviewer fields" % row["id"])

    if problems:
        print("REFUSING: %d problem(s):" % len(problems))
        for m in problems[:40]:
            print("  -", m)
        raise SystemExit(1)

    with io.open(os.path.join(DATA, "certificates.json"), "w", encoding="utf-8") as fh:
        json.dump(certificates, fh, ensure_ascii=False, indent=2)
    with io.open(os.path.join(DATA, "workExperiences.json"), "w", encoding="utf-8") as fh:
        json.dump(experiences, fh, ensure_ascii=False, indent=2)

    flat = [c for row in certificates for c in row["certificates"]]
    bands = {"VALID": 0, "EXPIRING_SOON": 0, "EXPIRED": 0, "no expiry": 0}
    for c in flat:
        bands[c.get("renewalStatus", "no expiry")] += 1
    print("certificates: %d across %d people (%.1f each)"
          % (len(flat), len(certificates), float(len(flat)) / len(certificates)))
    print("  bands: %s" % ", ".join("%s %d" % (k, v) for k, v in bands.items()))
    print("  awaiting approval: %d" % sum(1 for c in flat if c["status"] == "PENDING"))
    by_status = {}
    provisional = 0
    for row in experiences:
        by_status[row["status"]] = by_status.get(row["status"], 0) + 1
        if row["status"] == "VERIFIED":
            provisional += len(row["skills"])
    print("work experience: %d records across %d people (%s)"
          % (len(experiences), len(set(r["userId"] for r in experiences)),
             ", ".join("%s %d" % (k, v) for k, v in sorted(by_status.items()))))
    print("  requirements that become PROVISIONAL: %d (of %d unmeasured)"
          % (provisional, sum(len(v) for v in unscored.values())))


if __name__ == "__main__":
    main()
