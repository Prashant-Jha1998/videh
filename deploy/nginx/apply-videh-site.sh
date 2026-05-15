#!/usr/bin/env bash
set -euo pipefail

REPO="${REPO:-/var/www/videh}"
SITE_ROOT="/var/www/videh-site"
MAIN_CONF="/etc/nginx/conf.d/videh-main.conf"
ADMIN_CONF="/etc/nginx/conf.d/videh-admin.conf"
WEB_CONF="/etc/nginx/conf.d/videh-web.conf"

cert_dir_for() {
  local host="$1"
  if [ -f "/etc/letsencrypt/live/${host}/fullchain.pem" ]; then
    echo "/etc/letsencrypt/live/${host}"
    return
  fi
  if [ -f "/etc/letsencrypt/live/videh.co.in/fullchain.pem" ]; then
    echo "/etc/letsencrypt/live/videh.co.in"
    return
  fi
  echo ""
}

write_ssl_server() {
  local conf_path="$1"
  local server_name="$2"
  local document_root="$3"
  local spa_fallback="${4:-false}"
  local cert_dir
  cert_dir="$(cert_dir_for "${server_name}")"

  if [ -z "${cert_dir}" ]; then
    return 1
  fi

  local try_files='try_files $uri $uri/ =404;'
  if [ "${spa_fallback}" = "true" ]; then
    try_files='try_files $uri $uri/ /index.html;'
  fi

  sudo tee "${conf_path}" >/dev/null <<EOF
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ${server_name};

    ssl_certificate ${cert_dir}/fullchain.pem;
    ssl_certificate_key ${cert_dir}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    root ${document_root};
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
        ${try_files}
    }
}

server {
    listen 80;
    listen [::]:80;
    server_name ${server_name};
    return 301 https://\$host\$request_uri;
}
EOF
  return 0
}

write_http_server() {
  local conf_path="$1"
  local server_name="$2"
  local document_root="$3"
  local spa_fallback="${4:-false}"

  local try_files='try_files $uri $uri/ =404;'
  if [ "${spa_fallback}" = "true" ]; then
    try_files='try_files $uri $uri/ /index.html;'
  fi

  sudo tee "${conf_path}" >/dev/null <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${server_name};
    root ${document_root};
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
        ${try_files}
    }
}
EOF
}

echo "Syncing Videh landing page (videh.co.in only)..."
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

for old_conf in /etc/nginx/conf.d/videh.conf /etc/nginx/conf.d/videh-subdomains.conf; do
  if [ -f "${old_conf}" ]; then
    sudo mv "${old_conf}" "${old_conf}.disabled.$(date +%s)" || true
  fi
done

MAIN_CERT="$(cert_dir_for videh.co.in)"
if [ -n "${MAIN_CERT}" ]; then
  write_ssl_server "${MAIN_CONF}" "videh.co.in www.videh.co.in" "${SITE_ROOT}" "false"
else
  write_http_server "${MAIN_CONF}" "videh.co.in www.videh.co.in" "${SITE_ROOT}" "false"
fi

ADMIN_ROOT="/var/www/videh/artifacts/admin-web/dist/public"
WEB_ROOT="/var/www/videh/artifacts/videh-web/dist/public"

if write_ssl_server "${ADMIN_CONF}" "admin.videh.co.in" "${ADMIN_ROOT}" "true"; then
  echo "Configured HTTPS for admin.videh.co.in"
else
  write_http_server "${ADMIN_CONF}" "admin.videh.co.in" "${ADMIN_ROOT}" "true"
  echo "Configured HTTP for admin.videh.co.in"
fi

if write_ssl_server "${WEB_CONF}" "web.videh.co.in" "${WEB_ROOT}" "true"; then
  echo "Configured HTTPS for web.videh.co.in"
else
  write_http_server "${WEB_CONF}" "web.videh.co.in" "${WEB_ROOT}" "true"
  echo "Configured HTTP for web.videh.co.in"
fi

echo "Testing nginx config..."
sudo nginx -t
sudo systemctl reload nginx
echo "Nginx routing applied."
