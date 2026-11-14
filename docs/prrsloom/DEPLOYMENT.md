# PRRSLooM — deployment and rollback

## Components

| Piece | Where | Notes |
|---|---|---|
| Web page `/tools/prrsloom`, proxy routes `/api/prrsloom/**` | Vercel (this repo) | env vars optional, see `vercel.env.example` |
| API `prrsloom.service` (uvicorn, 127.0.0.1:8010) | Oracle `140.245.47.234` | own user `prrsloom`, venv `/opt/prrsloom/venv`, code `/opt/prrsloom/app`, data `/srv/prrsloom`, env `/etc/prrsloom/prrsloom.env` |
| Reverse proxy | nginx on Oracle, `location /prrsloom/` in the `api.fnunahiduzzaman.com` server block | `deploy/nginx-prrsloom.conf` |

QI-GeneX-N (`qigenex.service`, port 8000) is not modified: separate unit, port, user, venv and data
directory; the nginx change only adds a `/prrsloom/` location.

## Current production host: Google Cloud VM

| | |
|---|---|
| Project / VM | `formal-loop-514706-c9` / `instance-20261114-064217` (us-central1-f, n4-standard-4, Debian 13) |
| Address | `34.135.141.165` (ephemeral unless reserved), DNS `prrsloom-api.fnunahiduzzaman.com` (A record) |
| Firewall | rule `allow-prrsloom-web` (tcp 80/443, target tag `prrsloom-web`) |
| nginx | dedicated site `/etc/nginx/sites-available/prrsloom-api`; HTTPS via certbot |

Install / upgrade from this machine:

```bash
git archive --format=tar.gz -o prrsloom-backend.tar.gz HEAD services/prrsloom-backend
gcloud compute scp prrsloom-backend.tar.gz instance-20261114-064217:/tmp/ --zone us-central1-f --project formal-loop-514706-c9
gcloud compute ssh instance-20261114-064217 --zone us-central1-f --project formal-loop-514706-c9 --command   'rm -rf /tmp/prrsloom-src && mkdir -p /tmp/prrsloom-src && tar xzf /tmp/prrsloom-backend.tar.gz -C /tmp/prrsloom-src --strip-components=2    && sudo PRRSLOOM_HOST=prrsloom-api.fnunahiduzzaman.com bash /tmp/prrsloom-src/deploy/install.sh'
# after the DNS record resolves:
sudo certbot --nginx -d prrsloom-api.fnunahiduzzaman.com --redirect -m <email> --agree-tos
```

The Oracle host and `api.fnunahiduzzaman.com` (QI-GeneX-N) are not used by PRRSLooM.

## Oracle install / upgrade (alternative host)

```bash
# from this machine
scp -r -i <key> services/prrsloom-backend ubuntu@140.245.47.234:/tmp/prrsloom-src
ssh -i <key> ubuntu@140.245.47.234 'sudo bash /tmp/prrsloom-src/deploy/install.sh'
```

`install.sh` installs `clustalw` and `mafft`, creates the user and directories, backs up the
previous code, unit and nginx site file to `/opt/prrsloom/backups/<timestamp>/`, installs the venv,
enables the service, inserts `include snippets/prrsloom.conf;` into the HTTPS server block, runs
`nginx -t` (restoring the backup automatically on failure), warms the classifier cache and checks
`/prrsloom/health`.

Capacity defaults (adjust in `/etc/prrsloom/prrsloom.env`): 1 concurrent job, queue of 20, 30-min
timeout, 3 GB address-space limit per job, results kept 72 h; systemd caps the service at 4 GB RAM
and 1.5 CPUs.

## Verify

```bash
curl https://api.fnunahiduzzaman.com/prrsloom/health
curl https://api.fnunahiduzzaman.com/health          # QI-GeneX-N still healthy
cd /opt/prrsloom/app && sudo -u prrsloom PRRSLOOM_TEST_RESOURCES=/srv/prrsloom/resources \
  /opt/prrsloom/venv/bin/python -m pytest -q /tmp/prrsloom-src/tests
```

## Vercel

Pushing a branch creates a preview deployment; merging to `main` deploys production. The proxy
defaults to `https://api.fnunahiduzzaman.com`, so no variables are required. To lock the API to the
website, set the same random `PRRSLOOM_API_KEY` in `/etc/prrsloom/prrsloom.env` and in Vercel
(Production + Preview), then `sudo systemctl restart prrsloom`.

## Rollback

| Situation | Command |
|---|---|
| bad backend release | `sudo bash deploy/rollback.sh [timestamp]` (default: newest backup in `/opt/prrsloom/backups`) |
| remove PRRSLooM from the server entirely | `sudo bash deploy/rollback.sh --remove` (stops the unit, removes the nginx include, keeps data) |
| website | revert the merge commit on `main` (`git revert -m 1 <merge>`), or promote the previous production deployment in Vercel |
