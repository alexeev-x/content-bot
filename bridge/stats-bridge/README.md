# Stats bridge

STRATZ refuses Cloudflare's addresses (403) and OpenDota's free tier counts calls per address, which Cloudflare's shared
addresses have always used up (429). This server runs on a free VM with its own address and only forwards
(owner, 25.10.2026). It holds no keys: the Worker sends STRATZ's token in its own `Authorization` header. It forwards
only `POST /stratz/graphql` and an allowlist of OpenDota reads (`GET /opendota/...`), caches good answers for 10 minutes
and keeps OpenDota under 50 calls a minute and 2 800 a day. `GET /health` answers `{"ok":true}`.

Owner setup (the agents do not create cloud accounts or deploy):

1. Oracle Cloud Free Tier account; Compute → Instances → Create: Ubuntu 24.04, an Always Free shape
   (`VM.Standard.E2.1.Micro` or `VM.Standard.A1.Flex`), save the SSH key.
2. The instance's subnet security list: ingress TCP 80 and 443 from `0.0.0.0/0`.
3. duckdns.org: a subdomain (e.g. `alexeev-stats`) pointing at the instance's public IP.
4. On the VM (`ssh ubuntu@<ip>`):

   ```sh
   # Oracle's Ubuntu image blocks ports in iptables besides the security list.
   sudo iptables -I INPUT 6 -p tcp --dport 80 -j ACCEPT && sudo iptables -I INPUT 6 -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs
   sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https gnupg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
   sudo apt-get update && sudo apt-get install -y caddy
   sudo mkdir -p /opt/stats-bridge
   sudo curl -fsSL -o /opt/stats-bridge/server.mjs https://raw.githubusercontent.com/alexeev-x/content-bot/develop/bridge/stats-bridge/server.mjs
   sudo curl -fsSL -o /etc/systemd/system/stats-bridge.service https://raw.githubusercontent.com/alexeev-x/content-bot/develop/bridge/stats-bridge/stats-bridge.service
   sudo systemctl daemon-reload && sudo systemctl enable --now stats-bridge
   echo 'alexeev-stats.duckdns.org {
     reverse_proxy 127.0.0.1:8787
   }' | sudo tee /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   ```

5. `https://alexeev-stats.duckdns.org/health` answers `{"ok":true}`; Caddy gets the HTTPS certificate itself.
6. The Worker: `STATS_BRIDGE_URL` in `apps/backend/wrangler.jsonc` (a plain variable, not a secret) and the Worker secret
   `STRATZ_TOKEN`.

An update is step 4's `curl` of `server.mjs` again, then `sudo systemctl restart stats-bridge`. Logs:
`journalctl -u stats-bridge` (method, path, status and time only).
