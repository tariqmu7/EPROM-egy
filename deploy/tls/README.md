# Putting ECMS on HTTPS

Today the stack listens on **plain HTTP**. That is the single biggest remaining
exposure: the whole of ECMS authenticates with a bearer token in an
`Authorization` header, so anyone able to watch traffic on the company network —
a switch span port, an ARP-spoofing laptop, a misconfigured Wi-Fi segment — can
copy a live token and act as that user for the rest of its 12 hours. Passwords
cross the same wire on every login.

Nothing here is switched on automatically, because nginx **refuses to start** if
`ssl_certificate` points at a file that isn't there. The https site therefore
ships as a separate file that gets mounted in once a certificate exists.

---

## 1. Get a certificate

Two acceptable routes, in order of preference:

**(a) Ask IT for one from the company CA.** Best option: every domain-joined
machine already trusts that CA, so browsers show no warning. Send them:

- the DNS name users will type (e.g. `cms.eprom.local`),
- that it is a standard TLS **server** certificate,
- that you need the certificate **and** its private key, plus any intermediate
  certificates, in PEM format.

Concatenate the server certificate followed by any intermediates into one file.

**(b) Self-signed, as a stop-gap.** Encrypts the wire, but every browser shows a
warning until the certificate is installed as trusted on each machine — which
trains people to click through warnings, so treat it as temporary:

```bash
./deploy/tls/make-selfsigned-cert.sh cms.eprom.local
```

## 2. Install it

Put the two files in `deploy/tls/certs/` on the VM, named exactly:

```
deploy/tls/certs/ecms.crt      # server cert (+ intermediates, in that order)
deploy/tls/certs/ecms.key      # private key — chmod 600, never committed
```

`deploy/tls/certs/` is gitignored. The key must never reach GitHub.

## 3. Turn it on

1. In `docker-compose.yml`, uncomment the two `volumes:` lines on the **web**
   service (they mount `certs/` and `deploy/nginx/tls.conf`).
2. In `deploy/nginx/tls.conf`, set `server_name` to the real DNS name.
3. In `deploy/nginx/nginx.conf`, replace the whole port-80 `server { … }` block
   with the redirect written at the bottom of that file, so nothing is served in
   the clear.
4. In `.env`, change `CORS_ORIGINS` to the `https://` form of the name.
5. Rebuild and check the config parses **before** restarting:

```bash
docker compose build web
docker compose run --rm --entrypoint nginx web -t     # must print "syntax is ok"
docker compose up -d
```

## 4. Prove it

```bash
curl -sI http://cms.eprom.local/            | head -1   # expect 301 → https
curl -sI https://cms.eprom.local/ | grep -i 'strict-transport\|content-security'
curl -s  https://cms.eprom.local/api/health              # {"ok":true,...}
```

Then open the app in a browser, sign in, and check the console shows **no CSP
violations**. If a page silently stops working after this change, the console is
where it will say so — a blocked script or image reports itself there.

## Renewal

A certificate expires. Put the expiry date in a calendar reminder a month ahead
on the day you install it; ECMS has no monitoring that will warn you, and an
expired certificate takes the whole system off the air for every user at once.
Renewal is: drop the new files in `certs/`, then `docker compose restart web`.
