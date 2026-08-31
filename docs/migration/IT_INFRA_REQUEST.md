# EPROM CMS — Infrastructure Request (for IT)

**Requested by:** Tariq Salama · **Date:** _____ · **System:** EPROM Competency Management System (CMS)

**What this is:** An internal web application (React front-end + Node.js API + PostgreSQL database) to be hosted entirely on EPROM's own servers. No external cloud dependency. This sheet lists everything IT needs to provision so deployment can proceed.

---

## 1. Virtual Machine

| Item | Requested | Notes |
|---|---|---|
| OS | **Ubuntu Server 22.04 LTS** (or 24.04 LTS) | Any current Linux with Docker works; Ubuntu LTS preferred |
| vCPU | **4 cores** | Starting point; can scale later |
| RAM | **8 GB** | 4 GB minimum; 8 GB comfortable for DB + API + web |
| Disk | **100 GB SSD** | ~20 GB system, rest for database growth + backups |
| Quantity | **1 VM** | Single host runs the whole stack via Docker Compose |

## 2. Software to be installed

| Item | Requested | Notes |
|---|---|---|
| Docker Engine | Latest stable | We ship the app as containers |
| Docker Compose plugin | v2 | Orchestrates database + API + web |
| _(Nothing else)_ | | No Node/Postgres install needed on the host — they run inside containers |

## 3. Network & Access

| Item | Requested | Notes |
|---|---|---|
| Internal DNS name | e.g. **`cms.eprom.local`** | The address staff type in the browser |
| Inbound ports | **443 (HTTPS)** from the internal LAN; **80** to redirect to 443 | App is reachable only inside EPROM's network |
| SSH access | Port 22 for the deploy account | For me / IT to deploy and maintain |
| Outbound internet during setup | Temporary access to pull Docker base images + npm packages | **If fully air-gapped:** tell us — we will pre-bundle all images offline instead |
| Static internal IP | Yes | So the DNS name stays stable |

## 4. TLS / HTTPS Certificate

| Item | Requested | Notes |
|---|---|---|
| Certificate for the DNS name | Internal CA cert **or** company wildcard cert | Needed so the login page is served over HTTPS (no browser warnings) |
| Alternative | If none available, we generate a self-signed cert | Staff would see a one-time trust prompt |

## 5. Backups

| Item | Requested | Notes |
|---|---|---|
| Backup storage target | Network share / NAS path, ~50 GB | We run a nightly database dump; IT retains per policy |
| Retention | Per EPROM policy (e.g. 30 days) | Confirm retention + who monitors |

## 6. Email — NOT required

**Nothing to provide.** Decided 31 Aug 2026: the app sends no email at all. A forgotten
password is reset by an administrator from Admin → Employees, which issues a temporary
password the employee must change at next sign-in. If an internal SMTP relay is offered
later, emailed reset links can be added then.

## 7. Accounts & Ownership

| Item | Requested | Notes |
|---|---|---|
| Deploy/service account on the VM | sudo-capable | To install and run the stack |
| Who owns OS patching / VM uptime? | IT | We own the application layer |
| Maintenance window | Confirm | For deploys and updates |

---

## Questions for IT (bring to the meeting)

1. Is the VM **internet-reachable during setup**, or **fully air-gapped**? (Changes how we deliver Docker images.)
2. Can you provide a **TLS certificate** for the internal DNS name, or should we self-sign?
3. Is there an **internal SMTP relay** we may use, or should we go admin-reset-only?
4. What is the **backup destination + retention** policy we should target?
5. Who is the **point of contact** for the VM after handover, and what's the patch/reboot schedule?
6. Any **security review / approval** step required before an internal web app goes live?

---

## One-line summary to give IT

> "I need **one Ubuntu LTS VM (4 vCPU / 8 GB RAM / 100 GB SSD)** with **Docker + Docker Compose**, an **internal DNS name on ports 80/443**, a **TLS cert**, **SSH access**, and a **nightly backup location**. The whole app runs in containers on that single VM — no external cloud."
