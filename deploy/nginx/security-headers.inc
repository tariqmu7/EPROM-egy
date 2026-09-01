# ─── Response headers sent with every page and asset ─────────────────────────
# Included by BOTH the http and the https site (deploy/nginx/nginx.conf and
# deploy/nginx/tls.conf). nginx's `add_header` does not inherit into a block
# that declares its own, so the set lives in one file and is included, rather
# than copied — two copies drift and one site quietly loses a header.

# Clickjacking. frame-ancestors is the modern rule; X-Frame-Options is kept for
# older browsers on the company network.
add_header X-Frame-Options "SAMEORIGIN" always;
# Stop the browser guessing a content type — an uploaded file served as
# text/plain must never be re-read as HTML.
add_header X-Content-Type-Options "nosniff" always;
# Don't leak the full internal URL (which carries user ids: /ceo/profile/:id)
# to any external site a user clicks through to.
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
# The app asks for none of these. Refusing them up front means a compromised
# dependency cannot start asking either.
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()" always;

# ─── Content-Security-Policy ────────────────────────────────────────────────
# Every dependency is bundled by Vite from node_modules and the Inter font is
# self-hosted (see index.html) — the app loads NOTHING from the internet, which
# is what makes a strict policy possible here.
#
#   script-src 'self'        no inline script anywhere. This is the directive
#                            that actually stops a stored-XSS payload, and it is
#                            why exportCompetenceStatement() drives printing
#                            from the opener instead of writing a <script> into
#                            the generated sheet.
#   style-src 'unsafe-inline'  React writes inline style attributes and the
#                            printable statement carries a <style> block.
#                            Unavoidable, and far less dangerous than script.
#   img-src data: blob:      ECMS has no object storage: avatars, certificate
#                            scans and evidence images are base64 data: URLs
#                            held inside the document (see the upload rules in
#                            CLAUDE.md). blob: is the Excel export download.
#   connect-src 'self'       the SPA talks to /api on the same origin only, so
#                            exfiltration to a third-party host is blocked.
#   frame-ancestors 'none'   this app is never framed.
#   object-src 'none'        no <object>/<embed>; PDFs are downloaded, not embedded.
add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self' data: blob:; worker-src 'self' blob:" always;
