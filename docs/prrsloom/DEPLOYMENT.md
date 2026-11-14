# PRRSLooM — deployment and rollback

## Components

| Piece | Where | Notes |
|---|---|---|
| Web page `/tools/prrsloom`, proxy routes `/api/prrsloom/**` | Vercel (this repo) | env vars optional, see `vercel.env.example` |
| API `prrsloom.service` (uvicorn, 127.0.0.1:8010) | Oracle `140.245.47.234` | own user `prrsloom`, venv `/opt/prrsloom/venv`, code `/opt/prrsloom/app`, data `/srv/prrsloom`, env `/etc/prrsloom/prrsloom.env` |
| Reverse proxy | nginx on Oracle, `location /prrsloom/` in the `api.fnunahiduzzaman.com` server block | `deploy/nginx-prrsloom.conf` |

QI-GeneX-N (`qigenex.service`, port 8000) is not modified: separate unit, port, user, venv and data
directory; the nginx change only adds a `/prrsloom/` location.

## Oracle install / upgrade

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
