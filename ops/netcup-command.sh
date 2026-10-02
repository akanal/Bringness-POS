#!/bin/bash
set -Eeuo pipefail
umask 077
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
request="${SSH_ORIGINAL_COMMAND:-}"
if [[ ! "$request" =~ ^(status|backup|restart|deploy)[[:space:]](all|pos|ai)([[:space:]][0-9a-f]{40})?$ ]]; then
  echo "Invalid operation" >&2; exit 64
fi
read -r operation target revision <<< "$request"
if [[ "$operation" == deploy && ( "$target" == all || -z "${revision:-}" ) ]]; then exit 64; fi
if [[ "$operation" != deploy && -n "${revision:-}" ]]; then exit 64; fi
if [[ "$operation" == restart && "$target" == all ]]; then exit 64; fi
mkdir -p /var/log/bringness-operations /opt/bringness/releases
exec 9>/run/bringness-operations.lock
flock -w 5 9 || { echo "Another operation is running"; exit 75; }
log="/var/log/bringness-operations/$(date -u +%Y%m%dT%H%M%SZ)-$$.log"
exec 3>&1
exec >>"$log" 2>&1
say(){ printf '%s\n' "$*" >&3; }
stage=starting
candidate=""
previous=""
renamed=0
switched=0
finished=0
saved_caddy=""
work=""
cleanup(){
  local rc=$?
  trap - EXIT
  if (( rc != 0 )); then
    if (( switched )) && [[ -f "$saved_caddy" ]]; then
      cp -p "$saved_caddy" /etc/caddy/Caddyfile
      systemctl reload caddy || true
    fi
    if (( renamed )); then
      docker rm -f "$live" || true
      docker rename "$previous" "$live" || true
      docker start "$live" || true
    elif [[ -n "$candidate" ]]; then
      docker rm -f "$candidate" || true
    fi
    say "Operation failed at stage: $stage. Private diagnostics remain on the server."
  fi
  [[ -z "$work" ]] || rm -rf -- "$work"
  exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT TERM HUP
state(){
  local name=$1 status
  status=$(docker inspect --format '{{.State.Status}}' "$name" 2>/dev/null) || status=missing
  case "$status" in running|exited|created|restarting|paused|dead|missing) ;; *) status=unknown ;; esac
  say "$name: $status"
}
if [[ "$operation" == status ]]; then
  [[ "$target" == ai ]] || state bringness-pos
  [[ "$target" == pos ]] || state bringness-app
  state bringness-db
  state bringness-translate
  if systemctl is-active --quiet caddy; then say "Caddy: active"; else say "Caddy: inactive"; fi
  exit 0
fi
if [[ "$operation" == backup ]]; then
  stage=backup
  /bin/sh /opt/bringness/config/backup.sh
  say "Database backups validated."
  exit 0
fi
if [[ "$target" == pos ]]; then
  live=bringness-pos
  env_file=/opt/bringness-pos/config/app.env
  mode=pos
  domain=bringness-pos.de
  probe=/health
  port_a=3005
  port_b=3006
else
  live=bringness-app
  env_file=/opt/bringness/config/app.env
  mode=combined
  domain=bringness-ai.com
  probe=/api/ai/public
  port_a=3000
  port_b=3007
fi
if [[ "$operation" == restart ]]; then
  stage=restart
  docker restart "$live" >/dev/null
  say "$target restarted. Use status to verify."
  exit 0
fi
stage=preflight
[[ -s "$env_file" ]]
old_port=$(docker inspect --format '{{(index (index .NetworkSettings.Ports "3000/tcp") 0).HostPort}}' "$live")
if [[ "$old_port" == "$port_a" ]]; then new_port=$port_b
elif [[ "$old_port" == "$port_b" ]]; then new_port=$port_a
else say "Unexpected port mapping. Deployment stopped."; exit 65; fi
[[ $(docker inspect --format '{{.State.Status}}' "$live") == running ]]
work=$(mktemp -d /opt/bringness/releases/build.XXXXXX)
stage=download
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 --max-time 120 \
  "https://codeload.github.com/akanal/Bringness-POS/tar.gz/$revision" -o "$work/source.tgz"
mkdir "$work/source"
tar -xzf "$work/source.tgz" -C "$work/source" --strip-components=1
stage=tests
docker run --rm --network none -v "$work/source:/src:ro" -w /src node:24-bookworm-slim \
  node --test server/runtime-mode.test.js server/qr-service.test.js
stage=backup
/bin/sh /opt/bringness/config/backup.sh
tar -czf "/opt/bringness/backups/config-before-$target-$revision.tgz" \
  /etc/caddy/Caddyfile /opt/bringness/config /opt/bringness-pos/config
stage=build
cat > "$work/source/Dockerfile.netcup" <<'DOCKER'
FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY server ./server
COPY apps/web ./apps/web
COPY db ./db
EXPOSE 3000
CMD ["npm","start"]
DOCKER
image="bringness-$target:$revision"
docker build -f "$work/source/Dockerfile.netcup" -t "$image" "$work/source"
candidate="$live-candidate-$$"
stage=candidate
docker run -d --name "$candidate" --network bringness-internal --restart unless-stopped \
  --env-file "$env_file" -e APP_MODE="$mode" -e PORT=3000 \
  --label "bringness.revision=$revision" -p "127.0.0.1:$new_port:3000" "$image"
ready=0
for ((attempt=0;attempt<60;attempt++)); do
  if curl --fail --silent --max-time 3 "http://127.0.0.1:$new_port$probe" >/dev/null &&
    docker logs "$candidate" 2>&1 | grep -F 'download pricing ready.' >/dev/null; then ready=1; break; fi
  sleep 3
done
(( ready ))
stage=proxy-validation
saved_caddy="$work/Caddyfile.previous"
cp -p /etc/caddy/Caddyfile "$saved_caddy"
python3 - "$old_port" "$new_port" "$work/Caddyfile.next" <<'PY'
import pathlib,sys
source=pathlib.Path('/etc/caddy/Caddyfile').read_text()
old='reverse_proxy 127.0.0.1:'+sys.argv[1]
if source.count(old)!=1:
    raise SystemExit('Unexpected proxy layout')
pathlib.Path(sys.argv[3]).write_text(source.replace(old,'reverse_proxy 127.0.0.1:'+sys.argv[2]))
PY
caddy validate --config "$work/Caddyfile.next" --adapter caddyfile
stage=proxy-switch
switched=1
install -m 644 "$work/Caddyfile.next" /etc/caddy/Caddyfile
systemctl reload caddy
curl --fail --silent --show-error --max-time 20 "https://$domain$probe" >/dev/null
stage=container-switch
previous="$live-previous-$(date -u +%Y%m%dT%H%M%SZ)"
docker rename "$live" "$previous"
renamed=1
docker rename "$candidate" "$live"
candidate=""
docker stop "$previous" >/dev/null
finished=1
say "$target deployed: $revision"
say "Previous container retained. Database backup retained."
