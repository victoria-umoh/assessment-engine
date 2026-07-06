#!/usr/bin/env bash
# Backup the lms database from the Docker mongo container to backups/ and
# (optionally) sync the same snapshot into the local (Homebrew) mongod.
#
#   ./infra/scripts/mongo-backup.sh              # backup + local sync
#   SYNC_LOCAL=0 ./infra/scripts/mongo-backup.sh # backup only
#
# All mongo tooling runs inside the container (docker exec), so no host-side
# mongodump/mongorestore install is required. The local sync reaches the host's
# mongod through host.docker.internal and is skipped (with a note) when no
# distinct local mongod is reachable — this prevents "syncing" the container
# onto itself if the Homebrew service is stopped and Docker owns port 27017.
set -euo pipefail
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH" # cron's PATH lacks docker

REPO_ROOT=$(cd "$(dirname "$0")/../.." && pwd)
BACKUP_DIR="$REPO_ROOT/backups"
CONTAINER="${MONGO_CONTAINER:-lms-mongo-1}"
DB="${MONGO_DB:-lms}"
KEEP="${KEEP:-14}"          # newest archives to retain
SYNC_LOCAL="${SYNC_LOCAL:-1}"

mkdir -p "$BACKUP_DIR"
stamp=$(date +%Y%m%d-%H%M%S)
archive="$BACKUP_DIR/$DB-$stamp.archive.gz"

echo "[$(date '+%F %T')] dumping $DB from $CONTAINER"
docker exec "$CONTAINER" mongodump --db "$DB" --archive --gzip > "$archive"
echo "backup written: $archive ($(du -h "$archive" | cut -f1))"

# Prune: keep the newest $KEEP archives.
ls -t "$BACKUP_DIR/$DB-"*.archive.gz 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  rm -f "$old" && echo "pruned: $old"
done

if [ "$SYNC_LOCAL" = "1" ]; then
  container_host=$(docker exec "$CONTAINER" mongosh --quiet --eval 'db.serverStatus().host' 2>/dev/null || true)
  local_host=$(docker exec "$CONTAINER" mongosh --host host.docker.internal --quiet --eval 'db.serverStatus().host' 2>/dev/null || true)
  if [ -n "$local_host" ] && [ "$local_host" != "$container_host" ]; then
    docker exec -i "$CONTAINER" mongorestore --host host.docker.internal --drop --archive --gzip < "$archive" 2>&1 | tail -2
    echo "synced $DB to local mongod ($local_host)"
  else
    echo "skipped local sync: no distinct local mongod on host.docker.internal:27017"
  fi
fi
echo "[$(date '+%F %T')] done"
