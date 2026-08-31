# -*- coding: utf-8 -*-
"""BD / External-Contracts import, step 5 — DRAFT the training catalogue.

There is no EPROM course list in the source pack, so this catalogue is drafted
here rather than extracted from a workbook (same shape as derive_leadership.py:
no Excel input, judgement kept in the open where it can be argued with).

    THESE COURSES ARE DRAFTED, NOT EPROM'S OFFICIAL TRAINING CATALOGUE.
    Titles, providers, durations and prices are plausible market values for
    Egypt in 2026, not quotations. Replace them with the real catalogue via the
    same loader (or the app's Excel import) before anyone is enrolled or before
    a budget figure leaves the building.

The rules the draft follows, stated once:

  * EVERY live skill is covered by at least one course. A required skill with
    no course is a hole in the plan: the ITP falls back to "intensive training
    required" and the TNA can name no cure. The script REFUSES to write if any
    skill is uncovered, or if a course points at a skill that does not exist.
  * A course covers a CLUSTER of related skills, the way a real course does —
    one seat, several competencies — instead of one course per skill.
  * OJT courses carry NO price. On-the-job development is not free, but it is
    not a seat you can buy, and a made-up number would flow straight into the
    TNA budget total. `seatsUncosted` reporting it honestly is the point.

Input:  data/bd-ec/skills.json   (the loaded catalogue — nothing re-read from Excel)
Output: data/bd-ec/trainingCourses.json   (load with load-courses.mjs)

    python draft_courses.py
"""
import json, os, sys

HERE = os.path.dirname(__file__)
DATA = os.path.join(HERE, "..", "data", "bd-ec")
SKILLS = os.path.join(DATA, "skills.json")
OUT = os.path.join(DATA, "trainingCourses.json")

# code, title, provider, type, targetLevel, durationHours,
# costPerSeat (EGP; None = unpriced), linked skill ids
COURSES = [
    # -- Business Development: commercial and technical -----------------------
    ("TRN-BD-01", "EPROM O&M and EPC Service Portfolio Induction",
     "EPROM Training Centre", "INTERNAL", 3, 16, 2500,
     ["sk-bd-t-01"]),
    ("TRN-BD-02", "Client Asset and Operations Intelligence for Business Development",
     "EPROM Training Centre", "INTERNAL", 3, 16, 3000,
     ["sk-bd-t-02", "sk-bd-s-04"]),
    ("TRN-BD-03", "Energy Market and Competitor Intelligence",
     "AUC School of Business - Executive Education", "EXTERNAL", 4, 24, 18000,
     ["sk-bd-t-03"]),
    ("TRN-BD-04", "Bid / No-Bid Qualification and Opportunity Screening",
     "EPROM Training Centre", "INTERNAL", 3, 8, 2000,
     ["sk-bd-t-04", "sk-ec-t-09"]),
    ("TRN-BD-05", "Egyptian Public Contracts Law 182/2018 for Tendering Teams",
     "Egyptian Centre for Legal and Commercial Studies", "EXTERNAL", 4, 24, 12000,
     ["sk-bd-t-05", "sk-ec-t-01"]),
    ("TRN-BD-06", "Prequalification and Vendor Registration Workshop",
     "EPROM Training Centre", "INTERNAL", 3, 8, 1800,
     ["sk-bd-t-06", "sk-ec-t-04"]),
    ("TRN-BD-07", "Technical Proposal and Method Statement Writing",
     "EPROM Training Centre", "INTERNAL", 4, 16, 3500,
     ["sk-bd-t-07"]),
    ("TRN-BD-08", "Scope of Work Definition and Work Breakdown Structure",
     "PMI Egypt Chapter", "EXTERNAL", 4, 16, 9000,
     ["sk-bd-t-08", "sk-ec-t-14"]),
    ("TRN-BD-09", "Manpower Norms, Resource Loading and Productivity Factors",
     "EPROM Training Centre", "INTERNAL", 4, 12, 2800,
     ["sk-bd-t-09"]),
    ("TRN-BD-10", "Cost Estimation and Price Build-up for O&M and EPC Bids",
     "Egyptian Society of Engineers", "EXTERNAL", 4, 24, 16000,
     ["sk-bd-t-10", "sk-ec-t-07"]),
    ("TRN-BD-11", "Commercial and Financial Analysis for Non-Financial Managers",
     "AUC School of Business - Executive Education", "EXTERNAL", 4, 24, 20000,
     ["sk-bd-t-11", "sk-ec-t-27"]),
    ("TRN-BD-12", "Contract Models and Commercial Structuring",
     "World Commerce & Contracting (WorldCC)", "EXTERNAL", 4, 21, 22000,
     ["sk-bd-t-12"]),
    ("TRN-BD-13", "Contract Terms, Risk Allocation and Bid Qualifications",
     "World Commerce & Contracting (WorldCC)", "EXTERNAL", 4, 21, 22000,
     ["sk-bd-t-13", "sk-ec-t-13", "sk-ec-t-08"]),
    ("TRN-BD-14", "Turnaround and Shutdown Commercial Awareness",
     "EPROM Training Centre", "INTERNAL", 3, 8, 2200,
     ["sk-bd-t-14", "sk-ec-t-35"]),
    ("TRN-BD-15", "Reliability, Asset Integrity and the Value Proposition",
     "EPROM Training Centre", "INTERNAL", 4, 16, 3000,
     ["sk-bd-t-15"]),
    ("TRN-BD-16", "Consortium, Joint Venture and Local Content Structuring",
     "Egyptian Centre for Legal and Commercial Studies", "EXTERNAL", 4, 16, 14000,
     ["sk-bd-t-16", "sk-ec-t-17"]),
    ("TRN-BD-17", "Energy Transition and Diversification Opportunities",
     "AUC School of Business - Executive Education", "EXTERNAL", 4, 12, 11000,
     ["sk-bd-t-17"]),
    ("TRN-BD-18", "Contract Handover and Mobilisation to the Project Team",
     "EPROM (on the job, with the receiving project manager)", "OJT", 4, 40, None,
     ["sk-bd-t-18", "sk-ec-t-19", "sk-ec-m-04"]),
    ("TRN-BD-19", "Variations, Claims and Commercial Change Management",
     "World Commerce & Contracting (WorldCC)", "EXTERNAL", 4, 21, 18000,
     ["sk-bd-t-19", "sk-ec-t-22", "sk-ec-t-23"]),
    ("TRN-BD-20", "Standards, Codes and Certification Literacy",
     "Bureau Veritas Egypt", "INTERNAL", 3, 8, 2000,
     ["sk-bd-t-20", "sk-ec-t-36"]),
    ("TRN-BD-21", "Pipeline Forecasting and Revenue Planning",
     "EPROM Training Centre", "INTERNAL", 4, 12, 3000,
     ["sk-bd-t-21"]),
    ("TRN-BD-22", "Bid Debrief, Win / Loss Analysis and Price Benchmarking",
     "EPROM Training Centre", "INTERNAL", 4, 8, 2000,
     ["sk-bd-t-22", "sk-ec-t-37"]),

    # -- External Contracts: tendering, contract and claims practice ----------
    ("TRN-EC-01", "Tender Document Analysis and the Compliance Matrix",
     "EPROM Training Centre", "INTERNAL", 3, 12, 2800,
     ["sk-ec-t-02"]),
    ("TRN-EC-02", "Bid Assembly, Envelope Control and Submission",
     "EPROM (on the job, supervised on two live bids)", "OJT", 3, 24, None,
     ["sk-ec-t-03"]),
    ("TRN-EC-03", "Bonds, Letters of Guarantee and Bank Instruments",
     "Egyptian Banking Institute", "EXTERNAL", 4, 12, 9500,
     ["sk-ec-t-05"]),
    ("TRN-EC-04", "Insurance Requirements in Service and Construction Contracts",
     "Insurance Federation of Egypt", "EXTERNAL", 3, 12, 9000,
     ["sk-ec-t-06"]),
    ("TRN-EC-05", "Post-Tender Negotiation and Award Formalities",
     "World Commerce & Contracting (WorldCC)", "EXTERNAL", 4, 16, 13000,
     ["sk-ec-t-10"]),
    ("TRN-EC-06", "Contract Drafting and Review Practice (Arabic / English)",
     "Egyptian Centre for Legal and Commercial Studies", "EXTERNAL", 4, 30, 24000,
     ["sk-ec-t-11", "sk-ec-f-03"]),
    ("TRN-EC-07", "FIDIC and International Standard Forms of Contract",
     "FIDIC-accredited trainer (Cairo)", "EXTERNAL", 4, 21, 26000,
     ["sk-ec-t-15"]),
    ("TRN-EC-08", "Tax, Customs, Currency and Statutory Aspects of Contracts",
     "Egyptian Tax Society", "EXTERNAL", 3, 16, 12000,
     ["sk-ec-t-16"]),
    ("TRN-EC-09", "Subcontract and Purchase Order Administration",
     "EPROM Training Centre", "INTERNAL", 3, 12, 3000,
     ["sk-ec-t-18"]),
    ("TRN-EC-10", "The Obligations Register and Contract Compliance Monitoring",
     "EPROM Training Centre", "INTERNAL", 4, 12, 3200,
     ["sk-ec-t-20", "sk-ec-s-03"]),
    ("TRN-EC-11", "Contractual Correspondence, Notices and Time Bars",
     "EPROM Training Centre", "INTERNAL", 4, 8, 2500,
     ["sk-ec-t-21"]),
    ("TRN-EC-12", "Extension of Time and Forensic Delay Analysis",
     "Chartered Institute of Building (CIOB) - Cairo", "EXTERNAL", 4, 24, 22000,
     ["sk-ec-t-24", "sk-ec-s-06"]),
    ("TRN-EC-13", "Progress Measurement, Invoicing and Payment Certification",
     "EPROM Training Centre", "INTERNAL", 4, 12, 3000,
     ["sk-ec-t-25", "sk-ec-s-08"]),
    ("TRN-EC-14", "Receivables, Cash Flow and Collection Follow-up",
     "EPROM Training Centre", "INTERNAL", 3, 8, 2500,
     ["sk-ec-t-26"]),
    ("TRN-EC-15", "Liquidated Damages, Back-Charges and Deduction Defence",
     "World Commerce & Contracting (WorldCC)", "EXTERNAL", 4, 12, 11000,
     ["sk-ec-t-28"]),
    ("TRN-EC-16", "Performance-Based Contracts, KPIs and Service Level Administration",
     "World Commerce & Contracting (WorldCC)", "EXTERNAL", 4, 16, 13000,
     ["sk-ec-t-29"]),
    ("TRN-EC-17", "Force Majeure, Suspension and Extraordinary Circumstances",
     "Egyptian Centre for Legal and Commercial Studies", "EXTERNAL", 3, 8, 8000,
     ["sk-ec-t-30"]),
    ("TRN-EC-18", "Dispute Resolution, Arbitration and Litigation Support",
     "Cairo Regional Centre for International Commercial Arbitration (CRCICA)",
     "EXTERNAL", 4, 24, 28000,
     ["sk-ec-t-31"]),
    ("TRN-EC-19", "Taking-Over, Defects Liability and Contract Close-Out",
     "EPROM Training Centre", "INTERNAL", 4, 8, 2500,
     ["sk-ec-t-32"]),
    ("TRN-EC-20", "Contractual Records and Evidence Management",
     "EPROM Training Centre", "INTERNAL", 3, 8, 2200,
     ["sk-ec-t-33", "sk-ec-s-04", "sk-bd-s-08"]),

    # -- Systems and digital tools -------------------------------------------
    ("TRN-SYS-01", "Advanced Excel and Commercial Modelling",
     "RITI - Regional IT Institute", "EXTERNAL", 4, 24, 7500,
     ["sk-bd-s-01"]),
    ("TRN-SYS-02", "CRM and Opportunity Pipeline Management",
     "EPROM Training Centre", "INTERNAL", 3, 8, 2000,
     ["sk-bd-s-02"]),
    ("TRN-SYS-03", "ERP Commercial Modules (SAP / Oracle)",
     "Oracle University", "EXTERNAL", 3, 21, 19000,
     ["sk-bd-s-03"]),
    ("TRN-SYS-04", "Primavera P6 and MS Project for Commercial Teams",
     "RITI - Regional IT Institute", "EXTERNAL", 3, 30, 12000,
     ["sk-bd-s-05"]),
    ("TRN-SYS-05", "Power BI Dashboards for Commercial and Contract Data",
     "RITI - Regional IT Institute", "EXTERNAL", 3, 21, 9500,
     ["sk-bd-s-06", "sk-ec-s-07"]),
    ("TRN-SYS-06", "e-Tendering and Client Procurement Portals",
     "EPROM (on the job, supervised submissions)", "OJT", 3, 16, None,
     ["sk-bd-s-07"]),
    ("TRN-SYS-07", "AI and Digital Productivity Tools at Work",
     "EPROM Training Centre", "INTERNAL", 3, 8, 1500,
     ["sk-bd-s-09"]),

    # -- HSE and risk ---------------------------------------------------------
    ("TRN-HSE-01", "EPROM HSE Induction, Site Access and Personal Compliance",
     "EPROM HSE Department", "INTERNAL", 3, 8, 800,
     ["sk-bd-h-01"]),
    ("TRN-HSE-02", "HSE Content in Proposals, Tenders and Contracts",
     "EPROM HSE Department", "INTERNAL", 4, 12, 2500,
     ["sk-bd-h-02", "sk-ec-h-02"]),
    ("TRN-HSE-03", "Risk Assessment and the Risk Register for Bids and Contracts",
     "SGS Academy Egypt", "EXTERNAL", 4, 16, 12000,
     ["sk-bd-h-03", "sk-ec-h-03"]),
    ("TRN-HSE-04", "Travel, Site and Personal Security Awareness",
     "EPROM HSE Department", "INTERNAL", 3, 4, 900,
     ["sk-bd-h-04"]),
    ("TRN-HSE-05", "Process Safety and Operational Risk Literacy",
     "SGS Academy Egypt", "EXTERNAL", 4, 16, 14000,
     ["sk-bd-h-05"]),

    # -- Behavioural ----------------------------------------------------------
    ("TRN-BEH-01", "Business Ethics, Anti-Bribery and Conflict of Interest",
     "EPROM Compliance Office", "INTERNAL", 4, 6, 1200,
     ["sk-bd-b-01"]),
    ("TRN-BEH-02", "Client Centricity and Long-Term Relationship Building",
     "Dale Carnegie Egypt", "EXTERNAL", 4, 16, 11000,
     ["sk-bd-b-02", "sk-ec-b-10", "sk-bd-f-07"]),
    ("TRN-BEH-03", "Accuracy, Ownership and Follow-Through on Live Work",
     "EPROM (on the job, supervisor-reviewed deliverables)", "OJT", 4, 40, None,
     ["sk-bd-b-03", "sk-bd-b-07", "sk-ec-b-08"]),
    ("TRN-BEH-04", "Analytical and Critical Thinking",
     "Logic Consulting", "EXTERNAL", 4, 16, 10000,
     ["sk-bd-b-04"]),
    ("TRN-BEH-05", "Commercial Acumen and Business Judgement",
     "AUC School of Business - Executive Education", "EXTERNAL", 4, 21, 18000,
     ["sk-bd-b-05"]),
    ("TRN-BEH-06", "Resilience and Performance Under Deadline Pressure",
     "EPROM Training Centre", "INTERNAL", 4, 8, 2000,
     ["sk-bd-b-06"]),
    ("TRN-BEH-07", "Strategic Thinking, Section Strategy and Business Planning",
     "AUC School of Business - Executive Education", "EXTERNAL", 5, 21, 20000,
     ["sk-bd-b-08", "sk-bd-m-11"]),
    ("TRN-BEH-08", "Confidentiality and Information Security Discipline",
     "EPROM IT Security", "INTERNAL", 4, 4, 1000,
     ["sk-bd-b-09"]),
    ("TRN-BEH-09", "Learning Agility and Self-Directed Development",
     "EPROM (on the job, personal development log)", "OJT", 4, 24, None,
     ["sk-bd-b-10", "sk-ec-b-11"]),
    ("TRN-BEH-10", "Procedural Discipline and Rule Compliance",
     "EPROM Compliance Office", "INTERNAL", 4, 6, 1500,
     ["sk-ec-b-03"]),
    ("TRN-BEH-11", "Assertiveness in Defending Contractual Entitlement",
     "Dale Carnegie Egypt", "EXTERNAL", 4, 12, 9000,
     ["sk-ec-b-06"]),

    # -- Management -----------------------------------------------------------
    ("TRN-MGT-01", "Self-Organisation, Prioritisation and Deadline Management",
     "EPROM Training Centre", "INTERNAL", 4, 8, 2000,
     ["sk-bd-m-01"]),
    ("TRN-MGT-02", "Proposal and Bid Team Coordination",
     "EPROM Training Centre", "INTERNAL", 4, 12, 3000,
     ["sk-bd-m-02", "sk-ec-m-02"]),
    ("TRN-MGT-03", "Stakeholder and Interface Management",
     "PMI Egypt Chapter", "EXTERNAL", 4, 16, 12000,
     ["sk-bd-m-03"]),
    ("TRN-MGT-04", "Subcontractor and Partner Coordination",
     "EPROM Training Centre", "INTERNAL", 4, 8, 2500,
     ["sk-bd-m-04"]),
    ("TRN-MGT-05", "Governance, Approvals and Delegation of Authority",
     "EPROM Compliance Office", "INTERNAL", 4, 6, 1800,
     ["sk-bd-m-05"]),
    ("TRN-MGT-06", "Departmental Budgeting and Cost Control",
     "AUC School of Business - Executive Education", "EXTERNAL", 4, 16, 13000,
     ["sk-bd-m-06"]),
    ("TRN-MGT-07", "Resource Planning and Workload Allocation",
     "EPROM Training Centre", "INTERNAL", 4, 8, 2500,
     ["sk-bd-m-07"]),
    ("TRN-MGT-08", "Coaching, Mentoring and Competency Development",
     "Logic Consulting", "EXTERNAL", 5, 16, 12000,
     ["sk-bd-m-08"]),
    ("TRN-MGT-09", "Performance Management and KPI Ownership",
     "Logic Consulting", "EXTERNAL", 5, 16, 12500,
     ["sk-bd-m-09"]),
    ("TRN-MGT-10", "Portfolio and Pursuit Prioritisation",
     "EPROM Training Centre", "INTERNAL", 4, 8, 2500,
     ["sk-bd-m-10", "sk-ec-m-10"]),
    ("TRN-MGT-11", "Knowledge Management: the Bid and Contract Library",
     "EPROM Training Centre", "INTERNAL", 4, 8, 2000,
     ["sk-bd-m-12", "sk-ec-m-13", "sk-ec-m-11"]),
    ("TRN-MGT-12", "Change Leadership and Digital Transformation of a Section",
     "AUC School of Business - Executive Education", "EXTERNAL", 5, 21, 22000,
     ["sk-bd-m-13"]),

    # -- Communication and language -------------------------------------------
    ("TRN-COM-01", "Business English - Written, and Professional Reporting",
     "Berlitz Egypt", "EXTERNAL", 4, 40, 14000,
     ["sk-bd-f-01", "sk-bd-f-04"]),
    ("TRN-COM-02", "Business English - Spoken",
     "Berlitz Egypt", "EXTERNAL", 4, 40, 14000,
     ["sk-bd-f-02"]),
    ("TRN-COM-03", "Arabic Commercial and Technical Drafting",
     "EPROM Training Centre", "INTERNAL", 4, 16, 3000,
     ["sk-bd-f-03"]),
    ("TRN-COM-04", "Presentation and Public Speaking",
     "Dale Carnegie Egypt", "EXTERNAL", 4, 16, 12000,
     ["sk-bd-f-05"]),
    ("TRN-COM-05", "Negotiation and Influencing Skills",
     "Dale Carnegie Egypt", "EXTERNAL", 4, 21, 16000,
     ["sk-bd-f-06"]),
    ("TRN-COM-06", "Cross-Functional Collaboration",
     "EPROM Training Centre", "INTERNAL", 4, 8, 2000,
     ["sk-bd-f-08"]),
    ("TRN-COM-07", "Handling Objections and Difficult Client Conversations",
     "Dale Carnegie Egypt", "EXTERNAL", 4, 12, 9500,
     ["sk-bd-f-09"]),
    ("TRN-COM-08", "Cultural Awareness in International Dealings",
     "EPROM Training Centre", "INTERNAL", 3, 6, 1800,
     ["sk-bd-f-10"]),
    ("TRN-COM-09", "Active Listening and Requirement Elicitation",
     "EPROM Training Centre", "INTERNAL", 4, 8, 2200,
     ["sk-bd-f-11"]),
]

NOTE = ("Drafted for the ECMS production load - NOT EPROM's official catalogue. "
        "Title, provider, duration and price are plausible market values, not a quotation.")


def course_id(code):
    return "trn-" + code.replace("TRN-", "").lower()


def main():
    skills = {s["id"]: s for s in json.load(open(SKILLS, encoding="utf-8"))
              if not s.get("isArchived")}

    problems = []
    seen_codes, seen_ids, seen_titles = set(), set(), set()
    covered = set()
    out = []

    for code, title, provider, ctype, target, hours, cost, linked in COURSES:
        cid = course_id(code)
        if code in seen_codes:
            problems.append("%s: duplicate course code" % code)
        if cid in seen_ids:
            problems.append("%s: duplicate course id %s" % (code, cid))
        # The app's Excel re-import matches on code, else title + provider — a
        # duplicate pair there would update the wrong row on a re-import.
        if (title, provider) in seen_titles:
            problems.append("%s: duplicate title + provider" % code)
        seen_codes.add(code)
        seen_ids.add(cid)
        seen_titles.add((title, provider))

        if not linked:
            problems.append("%s: links no skill - it can never be recommended" % code)
        for sid in linked:
            if sid not in skills:
                problems.append("%s: skill %s is not a live skill" % (code, sid))
            else:
                covered.add(sid)
        if ctype == "OJT" and cost is not None:
            problems.append("%s: OJT must not carry a seat price" % code)
        if ctype != "OJT" and cost is None:
            problems.append("%s: %s course has no seat price" % (code, ctype))

        doc = {
            "id": cid,
            "title": title,
            "provider": provider,
            "type": ctype,
            "code": code,
            "linkedSkillIds": linked,
            "targetLevel": target,
            "durationHours": hours,
            "description": NOTE,
            "isArchived": False,
        }
        if cost is not None:
            doc["costPerSeat"] = cost
        out.append(doc)

    for sid in sorted(set(skills) - covered):
        problems.append("skill %s (%s) has no course" % (sid, skills[sid]["name"]))

    if problems:
        print("REFUSING TO WRITE - %d problem(s):" % len(problems))
        for p in problems[:40]:
            print("  -", p)
        sys.exit(1)

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    priced = [c for c in out if "costPerSeat" in c]
    by_type = {}
    for c in out:
        by_type[c["type"]] = by_type.get(c["type"], 0) + 1
    print("wrote %d courses -> %s" % (len(out), os.path.normpath(OUT)))
    print("  types: " + ", ".join("%s %d" % (t, n) for t, n in sorted(by_type.items())))
    print("  skills covered: %d of %d live (0 uncovered)" % (len(covered), len(skills)))
    print("  priced: %d of %d (%d unpriced, all OJT)" % (len(priced), len(out),
                                                         len(out) - len(priced)))
    print("  seat price range: %d - %d EGP" % (min(c["costPerSeat"] for c in priced),
                                               max(c["costPerSeat"] for c in priced)))
    print("  links: %d total, max %d per course" % (
        sum(len(c["linkedSkillIds"]) for c in out),
        max(len(c["linkedSkillIds"]) for c in out)))


if __name__ == "__main__":
    main()
