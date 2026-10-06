#!/bin/bash
set -Eeuo pipefail
umask 077
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
[[ $EUID == 0 ]] || { echo "Please run as root"; exit 1; }
for command in curl ssh-keygen docker python3 flock caddy; do command -v "$command" >/dev/null; done
systemctl is-active --quiet ssh
[[ -f /opt/bringness/config/backup.sh && -f /etc/caddy/Caddyfile ]]
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
base=https://raw.githubusercontent.com/akanal/Bringness-POS/main/ops
curl --fail --silent --show-error --location "$base/netcup-command.sh" -o "$work/command.sh"
printf '%s  %s\n' '795a5897b4753246dc21fa7f4313eb752a892508256b565c9c0a3e249784954a' "$work/command.sh" | sha256sum --check --status
bash -n "$work/command.sh"
install -o root -g root -m 700 "$work/command.sh" /usr/local/sbin/bringness-operations
install -d -o root -g root -m 700 /root/.ssh /root/bringness-access
key=/root/bringness-access/github-actions
if [[ ! -f "$key" ]]; then ssh-keygen -q -t ed25519 -N '' -C bringness-github-actions -f "$key"; fi
public=$(cat "$key.pub")
line='restrict,command="/usr/local/sbin/bringness-operations" '"$public"
touch /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
if ! grep -Fqx "$line" /root/.ssh/authorized_keys; then printf '%s\n' "$line" >> /root/.ssh/authorized_keys; fi
sshd -t
ssh-keygen -y -f /etc/ssh/ssh_host_ed25519_key |
  awk '{print "152.53.196.43 "$0}' > /root/bringness-access/known_hosts
echo "Server access prepared. No application was changed."
echo "Add GitHub Actions secret NETCUP_SSH_KEY from /root/bringness-access/github-actions."
echo "Add GitHub Actions secret NETCUP_KNOWN_HOSTS from /root/bringness-access/known_hosts."
echo "Keep the private key out of chat and repository files."
