#!/usr/bin/env bash
set -euo pipefail

REPO="${REPO:-/var/www/videh}"
SITE_ROOT="/var/www/videh-site"
CERT_DIR="/etc/letsencrypt/live/videh.co.in"
MAIN_CONF="/etc/nginx/conf.d/videh-main.conf"
SUB_CONF="/etc/nginx/conf.d/videh-subdomains.conf"

echo "Syncing Videh landing site to ${SITE_ROOT}..."
sudo mkdir -p "${SITE_ROOT}"
sudo rsync -a --delete "${REPO}/deploy/videh-co-in/" "${SITE_ROOT}/"

echo "Disabling default nginx welcome page..."
for default_conf in \
  /etc/nginx/conf.d/default.conf \
  /etc/nginx/sites-enabled/default; do
  if [ -e "${default_conf}" ]; then
    sudo mv "${default_conf}" "${default_conf}.disabled.$(date +%s)" || true
  fi
done

if [ -f /etc/nginx/conf.d/videh.conf ] && [ ! -f /etc/nginx/conf.d/videh.conf.disabled ]; then
  sudo mv /etc/nginx/conf.d/videh.conf /etc/nginx/conf.d/videh.conf.disabled.$(date +%s) || true
fi

sudo cp "${REPO}/deploy/nginx/videh-subdomains.conf" "${SUB_CONF}"

if [ -f "${CERT_DIR}/fullchain.pem" ] && [ -f "${CERT_DIR}/privkey.pem" ]; then
  echo "Configuring HTTPS landing for videh.co.in..."
  sudo tee "${MAIN_CONF}" >/dev/null <<EOF
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name videh.co.in www.videh.co.in;

    ssl_certificate ${CERT_DIR}/fullchain.pem;
    ssl_certificate_key ${CERT_DIR}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    root ${SITE_ROOT};
    index index.html;
    client_max_body_size 160M;

    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        try_files \$uri \$uri/ =404;
    }
}

server {
    listen 80;
    listen [::]:80;
    server_name videh.co.in www.videh.co.in;
    return 301 https://\$host\$request_uri;
}
EOF
else
  echo "No Let's Encrypt cert found; using HTTP landing config..."
  sudo tee "${MAIN_CONF}" >/dev/null <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name videh.co.in www.videh.co.in;

    root ${SITE_ROOT};
    index index.html;
    client_max_body_size 160M;

    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        try_files \$uri \$uri/ =404;
    }
}
EOF
fi

echo "Testing nginx config..."
sudo nginx -t
sudo systemctl reload nginx
echo "Videh site applied."
