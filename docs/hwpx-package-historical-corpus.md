# HWPX 패키지 역사 corpus 입력 복원

`src/testing/hwpx-package-historical-484.json`은 역사 484개 원문서의 경로·출처 commit:path·Git mode·크기·Git blob SHA1·SHA256을 소유하는 단일 원장입니다. 도구의 manifest SHA256 핀은 이 원장만 읽도록 제한하는 신뢰 경계입니다. 문서별 목록이나 기대 결과를 별도로 복제하지 않습니다.

원문서는 own 저장소의 고정 commit에서 45개, 별도 Git 객체 저장소의 고정 commit에서 439개입니다. 현재 샘플 수나 순서로 역사 입력을 재선정하지 않습니다. 확장자는 `.hwpx`이나 ZIP 패키지 검사에서 거부되는 6개는 실제 컨테이너가 CFB이며, 이 검사 결과는 문서 손상의 증거가 아닙니다. 원본을 ZIP으로 바꾸거나 정규화하지 않습니다. 도구는 문서 내부를 파싱하지 않습니다.

## 로컬 입력과 실행

Python 3.9 이상과 로컬 Git이 필요합니다. 두 저장소에 원장의 commit/tree/blob 객체가 이미 있어야 합니다. 도구는 fetch·checkout·외부 다운로드를 하지 않으며, partial/promisor 저장소는 거부합니다. 객체 누락은 비정상 종료이며 skip이나 성공으로 바뀌지 않습니다. Git worktree의 `.git` 파일 대신 실제 Git 디렉터리를 지정합니다.

```sh
python3 -B tools/restore-hwpx-package-corpus.py --help
python3 -B tools/restore-hwpx-package-corpus.py \
  --own-git-dir /absolute/own-repository/.git \
  --reference-git-dir /absolute/raw-object-store/.git \
  --output /private/tmp/hwpjs-historical-484-new
python3 -B tools/restore-hwpx-package-corpus.py \
  --own-git-dir /absolute/own-repository/.git \
  --reference-git-dir /absolute/raw-object-store/.git \
  --verify /private/tmp/hwpjs-historical-484-new
```

출력 부모는 미리 존재해야 하며, 모든 경로 조상에 symlink가 없어야 합니다. macOS에서는 `/tmp`의 symlink 별칭 대신 `/private/tmp`를 사용합니다. 기존 파일·기존 빈 디렉터리·symlink 모두 덮어쓰지 않습니다. 복원 중 실패하면 새로 생긴 부분 출력도 자동 삭제하지 않습니다. 실패 로그를 보존하고 다른 새 경로를 사용합니다. 원본 Git 객체와 worktree/index는 수정하지 않습니다.

첫 쓰기 전에 모든 원본 commit:path의 mode/blob/size를 확인하고, 실제 blob을 읽을 때 크기·SHA256·Git `blob <size>\0` 헤더를 포함한 SHA1을 다시 계산합니다. 새 파일은 exclusive open으로 생성합니다. 검증은 파일별 해시·크기·원장 mode(0644 또는 0755)와 전체 파일 집합을 확인하며 추가 파일·추가 디렉터리·누락·symlink·비정규 파일을 거부합니다. 원문은 한 파일씩 처리하므로 문서 바이트 보관 메모리는 가장 큰 파일 크기에 비례하고 전체 corpus를 한 번에 메모리에 적재하지 않습니다. 실행 비트가 있는 원문서도 바이트 그대로 보존할 뿐 실행하지 않습니다.

## 회귀와 Native 연결

합성 회귀는 임시 로컬 Git 저장소에 합성 원문 blob과 tree/commit만 만듭니다. 실제 원문서나 별도 저장소 구현·측정·기대 JSON을 읽지 않습니다.

```sh
python3 -B -m unittest discover -s tools/tests -p 'test_restore_hwpx_package_corpus.py' -v
```

복원·검증 성공 이후에는 별도로 허용된 Native 실행 환경에서 다음 입력 경로를 사용합니다. 이 문서나 도구가 실행 권한을 부여하거나 Native 통과를 주장하지 않습니다.

```sh
zig build test-hwpx-package-corpus \
  -Dhwpx-package-corpus-root=/private/tmp/hwpjs-historical-484-new \
  -Doptimize=ReleaseSafe -j1 --summary all
```

정규 `zig build test`도 같은 `-Dhwpx-package-corpus-root`를 받아 필수 역사 3개 survey를 연결합니다. 정규 합성 42개 및 고정 raw 20개 회귀와 역사 3개 survey는 다른 분모입니다. 현재 샘플 625개의 추가 survey, SDK·GUI·전체 CI 성공을 이 도구의 결과로 대신하지 않습니다. CI에는 두 로컬 객체 저장소를 제공하는 별도 준비가 필요하며, 이 도구 자체는 원격 저장소를 취득하거나 CI 입력을 자동 배포하지 않습니다.
