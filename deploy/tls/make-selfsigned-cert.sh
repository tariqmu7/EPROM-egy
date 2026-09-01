#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# EPROM CMS — generate a self-signed TLS certificate as a STOP-GAP.
#
#   ./deploy/tls/make-selfsigned-cert.sh cms.eprom.local [more.name ...]
#
# A certificate from the company CA is strictly better (see deploy/tls/README.md):
# browsers trust it silently, whereas this one shows a warning on every machine
# until it is installed as trusted. Use this only to stop passwords and session
# tokens crossing the network in clear text while IT gets you the real one.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <dns-name> [additional-dns-name ...]" >&2
  echo "   e.g. $0 cms.eprom.local 192.168.240.4" >&2
  exit 1
fi

PRIMARY="$1"
DAYS=825   # the maximum most browsers will accept for a server certificate

mkdir -p certs
if [[ -f certs/ecms.crt || -f certs/ecms.key ]]; then
  echo "REFUSING: certs/ecms.crt or certs/ecms.key already exists." >&2
  echo "Move them aside first — overwriting a live key logs everyone out of https." >&2
  exit 1
fi

# Subject Alternative Names. Browsers ignore the Common Name entirely, so every
# name (and IP) users might type has to be listed here or the certificate is
# rejected outright.
SAN=""
i=1
for name in "$@"; do
  if [[ "$name" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    SAN+="IP.${i} = ${name}"$'\n'
  else
    SAN+="DNS.${i} = ${name}"$'\n'
  fi
  i=$((i + 1))
done

CONF="$(mktemp)"
trap 'rm -f "$CONF"' EXIT
cat > "$CONF" <<CONFEOF
[req]
distinguished_name = dn
x509_extensions    = v3
prompt             = no

[dn]
CN = ${PRIMARY}
O  = EPROM
C  = EG

[v3]
basicConstraints = critical, CA:FALSE
keyUsage         = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName   = @alt

[alt]
${SAN}
CONFEOF

echo "==> Generating a ${DAYS}-day self-signed certificate for: $*"
openssl req -x509 -newkey rsa:2048 -sha256 -days "$DAYS" -nodes \
  -keyout certs/ecms.key -out certs/ecms.crt -config "$CONF"

chmod 600 certs/ecms.key
chmod 644 certs/ecms.crt

echo
echo "==> Written:"
openssl x509 -in certs/ecms.crt -noout -subject -dates -ext subjectAltName
echo
echo "    certs/ecms.crt"
echo "    certs/ecms.key   (chmod 600 — never commit this)"
echo
echo "Next: follow step 3 of deploy/tls/README.md to switch nginx over,"
echo "and put the expiry date above in a calendar reminder."
