# Monday Go-Live Checklist — EPROM CMS on the shared EPROM server

**Goal:** copy this project onto the EPROM Linux server (the one already running
`ese.eprom.com.eg`), run it in Docker next to that site *without disturbing it*,
give it its own web address, and test it before anyone else uses it.

**Golden rule:** the friend's live site must keep working the whole time. Our app
never touches ports 80/443 — the existing nginx forwards our subdomain to us.

---

## PART A — Ask IT tomorrow (before Monday)

- [ ] **Login to the server** — how do I connect from my laptop? (they'll give an
      SSH command like `ssh myuser@10.0.0.5`, plus a password or key)
- [ ] **Confirm Docker is installed** (or that I may install it)
- [ ] **My own subdomain** — e.g. `ecms.eprom.com.eg`. Get the exact name.
- [ ] **A free port** for my app on the server (default plan: `8080` — ask if that's free)
- [ ] **Who edits the server's nginx** — me (with sudo) or IT? Hand them
      `deploy/nginx-host-ecms.conf` if it's them.
- [ ] **HTTPS/certificate** — does the friend's site use certbot? (so ours can too)

> Write their answers here:
> - SSH command: ____________________
> - Subdomain:   ____________________
> - Port:        ____________________
> - nginx edited by: ________________

---

## PART B — Monday, step by step

### 1. Connect to the server
- [ ] Open a terminal on the laptop and run the SSH command IT gave you.
- [ ] You should see the server's command prompt.

### 2. Check Docker is there
- [ ] `docker --version`  and  `docker compose version` → both print a version.
      (If not: install per IT, or `curl -fsSL https://get.docker.com | sudo sh`.)

### 3. Get the project onto the server
- [ ] Easiest: on the server, `git clone <your repo URL>` then `cd ECMS`.
- [ ] No git remote? Copy from the laptop instead (run on the laptop):
      `scp -r "ECMS" myuser@SERVER:/home/myuser/`  (skip node_modules).

### 4. Create the settings file (.env)
- [ ] `cp .env.docker.example .env`
- [ ] Edit `.env` (`nano .env`) and set:
  - [ ] `PGPASSWORD=` a strong random password
  - [ ] `JWT_SECRET=` a long random string
        (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
  - [ ] `BOOTSTRAP_ADMIN_EMAIL=` your admin email
  - [ ] `CORS_ORIGINS=https://ecms.eprom.com.eg`  (your real subdomain)
  - [ ] `WEB_PORT=8080`  (the port IT approved — must match the nginx file)

### 5. Confirm the app will NOT grab ports 80/443
- [ ] `docker-compose.override.yml` is present in the folder (it ships in the repo).
      This is what keeps our app on the private inside door only. Don't delete it.

### 6. Start the app
- [ ] `docker compose up -d --build`  (first build takes a few minutes)
- [ ] `docker compose ps` → `postgres`, `api`, `web`, `backup` all "Up".
- [ ] Quick local test on the server itself:
      `curl -I http://127.0.0.1:8080`  → should return `HTTP/1.1 200`.

### 7. Point the subdomain at the app (the existing nginx)
- [ ] Put `deploy/nginx-host-ecms.conf` into the server's nginx (see the top of
      that file). Set the real subdomain + port inside it.
- [ ] `sudo nginx -t`  → "syntax is ok / test is successful"
- [ ] `sudo systemctl reload nginx`  (reload = zero downtime for the friend's site)

### 8. HTTPS (padlock)
- [ ] `sudo certbot --nginx -d ecms.eprom.com.eg`  (if IT uses certbot)

### 9. TEST before telling anyone
- [ ] Open `https://ecms.eprom.com.eg` in a browser → login screen loads.
- [ ] Log in with the admin account → dashboard loads.
- [ ] Click through a few pages; refresh a deep page (e.g. `/admin/users`) — no 404.
- [ ] **Double-check the friend's site still works:** open `https://ese.eprom.com.eg`.

### 10. Done
- [ ] Note the admin credentials somewhere safe.
- [ ] A nightly database backup already runs automatically (the `backup` service
      writes to `./backups`).

---

## If something goes wrong

- **See what's happening:** `docker compose logs -f api` (or `web`, `postgres`).
- **Port already in use:** another service holds `8080` — pick another `WEB_PORT`,
  update the nginx file to match, `docker compose up -d`, reload nginx.
- **Site won't load but curl 127.0.0.1:8080 works:** the problem is the host nginx
  / subdomain, not the app — recheck `deploy/nginx-host-ecms.conf` and `nginx -t`.
- **Friend's site broke:** immediately `sudo systemctl reload nginx` after removing
  our nginx file; our Docker app cannot affect his site on its own.
- **Full stop (does not delete data):** `docker compose down`. Data survives in the
  `pgdata` volume; `docker compose up -d` brings it back.
