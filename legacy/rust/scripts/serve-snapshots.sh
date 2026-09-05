#!/usr/bin/env bash
# hwp-core HTML 스냅샷을 로컬 웹서버로 제공합니다.
# URL 형식: http://<host>:<port>/snapshots/noori.html
# 사용법: ./scripts/serve-snapshots.sh [포트]
# 기본 포트: 11300

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TESTS_DIR="$ROOT_DIR/crates/hwp-core/tests"
PORT="${1:-11300}"

if [[ ! -d "$TESTS_DIR/snapshots" ]]; then
  echo "스냅샷 디렉터리를 찾을 수 없습니다: $TESTS_DIR/snapshots" >&2
  exit 1
fi

echo "스냅샷 HTML 서버: http://localhost:$PORT/"
echo "예시: http://localhost:$PORT/snapshots/noori.html"
echo "루트: $TESTS_DIR"
echo "종료: Ctrl+C"
echo ""

cd "$TESTS_DIR"
exec python3 -m http.server "$PORT"
