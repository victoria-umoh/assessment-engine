#!/usr/bin/env bash
# Restore an lms backup archive into the Docker mongo container (default)
# or the local (Homebrew) mongod.
#
#   ./infra/scripts/mongo-restore.sh                          # latest archive → docker
#   ./infra/scripts/mongo-restore.sh backups/lms-….archive.gz # specific archive → docker
#   ./infra/scripts/mongo-restore.sh '' local                 # latest archive → local mongod
#
# WARNING: restore uses --drop; the lms database on the target is replaced
# by the archive's contents.
set -euo pipefail
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

REPO_ROOT=$(cd "$(dirname "$0")/../.." && pwd)
BACKUP_DIR="$REPO_ROOT/backups"
CONTAINER="${MONGO_CONTAINER:-lms-mongo-1}"
DB="${MONGO_DB:-lms}"

archive="${1:-}"
target="${2:-docker}"

if [ -z "$archive" ]; then
  archive=$(ls -t "$BACKUP_DIR/$DB-"*.archive.gz 2>/dev/null | head -1 || true)
  [ -n "$archive" ] || { echo "no archives found in $BACKUP_DIR" >&2; exit 1; }
fi
[ -f "$archive" ] || { echo "archive not found: $archive" >&2; exit 1; }

case "$target" in
  docker)
    echo "restoring $archive → Docker container $CONTAINER (db: $DB, --drop)"
    docker exec -i "$CONTAINER" mongorestore --drop --archive --gzip < "$archive" 2>&1 | tail -2
    ;;
  local)
    container_host=$(docker exec "$CONTAINER" mongosh --quiet --eval 'db.serverStatus().host' 2>/dev/null || true)
    local_host=$(docker exec "$CONTAINER" mongosh --host host.docker.internal --quiet --eval 'db.serverStatus().host' 2>/dev/null || true)
    if [ -z "$local_host" ] || [ "$local_host" = "$container_host" ]; then
      echo "no distinct local mongod reachable on host.docker.internal:27017" >&2
      exit 1
    fi
    echo "restoring $archive → local mongod $local_host (db: $DB, --drop)"
    docker exec -i "$CONTAINER" mongorestore --host host.docker.internal --drop --archive --gzip < "$archive" 2>&1 | tail -2
    ;;
  *)
    echo "unknown target: $target (use docker|local)" >&2
    exit 1
    ;;
esac
echo "restore complete"
