# JavaScript 품질 검사

이 문서는 품질 검사 명령의 의미와 검증 경계를 설명합니다. 실행 명령은 [개발·검증 명령](development-commands.md#javascript-quality-commands), 의존성 버전은 [package.json](../package.json), 실행 도구 버전은 [.mise.toml](../.mise.toml)을 따릅니다. 문서의 실측 기록을 버전 고정값으로 사용하지 않습니다.

## 정책과 설정의 권위

[tools/quality-policy.mjs](../tools/quality-policy.mjs)가 검사 범위와 도구 옵션의 유일한 원본입니다. 정확한 root는 `SOURCE_ROOTS`, lint 확장자는 `LINT_EXTENSIONS`, formatter 확장자는 `EXTENSIONS`, 제외 조건과 사유는 `excludedPath` 및 그 정책 정의를 확인합니다. 이 문서에 해당 목록을 별도로 복제하지 않습니다.

[tools/sync-quality-config.mjs](../tools/sync-quality-config.mjs)는 이 정책에서 [.oxlintrc.json](../.oxlintrc.json)과 [.oxfmtrc.json](../.oxfmtrc.json)을 생성합니다. IDE나 직접 CLI에서도 같은 파생 설정을 사용할 수 있습니다. `quality:config`와 runner의 실제 도구 실행은 두 설정 전체의 동치를 검사하며, ignore 추가·삭제를 포함한 드리프트는 도구 실행 전에 실패합니다. 정책 변경은 canonical 파일에서 하고 파생 설정을 명시적으로 재생성합니다.

```sh
mise exec -- bun tools/sync-quality-config.mjs --write
mise exec -- bun run quality:config
```

별도 root ignore 파일로 제외 범위를 추가하지 않습니다. [runner](../tools/quality.mjs)는 root config와 중첩 config 비활성화 옵션을 고정합니다. 임의로 다른 설정이나 옵션을 지정한 직접 binary 호출은 이 runner 계약의 검증 근거가 아닙니다.

## 기본 범위와 미추적 파일

기본 명령은 Git 최상위에서 추적 파일과 새 staged 파일의 이름을 선택하고 **현재 작업 트리 내용**을 검사합니다. staged blob만 검사하는 명령이 아니므로, 추적 파일의 unstaged 편집도 포함됩니다. staging 전인 새 파일은 기본 도구 입력에 넣지 않고 `quality:files`의 `untrackedOmitted`와 집계에 표시합니다.

미추적 파일은 명시 파일 경로나 `--include-untracked`로 선택합니다. 새 파일을 staging하면 기본 검사에 자동 포함됩니다. Git 없는 환경에서는 기본 명령이 실패하고, 고립된 검사 환경을 의도한 경우에만 `--filesystem`을 명시합니다. 명시 경로도 canonical 정책의 보호·제외 조건을 우회하지 못합니다. 디렉터리나 임의 도구 옵션을 파일 대신 전달하지 않습니다.

`quality:files`는 선택 경로·범위·제외 사유·미추적 누락을 확인하는 명령입니다. 빈 선택은 성공으로 처리하지 않습니다. 검사 및 포맷 변경 전 선택 범위를 먼저 확인하며, 미추적 파일이 제외된 결과를 해당 파일의 검사 성공으로 세지 않습니다.

## 저작 코드와 제외 경계

활성 저작 코드와 지원되는 root 설정·빌드 진입점을 검사합니다. 저작 build helper, 일반 fixture 및 일반 테스트 디렉터리를 통째로 제외하지 않습니다. 의도적으로 잘못된 선언을 주입하는 음성 oracle만 정책의 정확 경로 예외로 유지합니다.

보호 파일명은 존재 여부 확인이나 `lstat`보다 먼저 이름으로 제외하며 symlink는 따라가지 않습니다. 생성물·배포 snapshot·vendor·캐시 및 Native 생성 빌드 디렉터리도 정책에 명시된 경계에서 제외합니다. RN 예제 전체나 시뮬레이터 저작 fixture 전체를 제외하는 규칙은 아닙니다. 제외의 정확한 이름·패턴·사유는 canonical 정책을 따릅니다.

## 명령과 언어별 한계

`lint`는 correctness와 경고 실패 조건을 검사하고, `format:check`는 파일을 쓰지 않는 포맷 검사입니다. `check`는 둘을 실행하고 실패를 유지합니다. `lint:fix`와 `format`은 명시적인 쓰기 명령이며, 기본 tracked/staged 범위를 사용합니다. 미추적 수정까지 원할 때만 별도로 선택합니다. 타입 검사와 제품 단위·통합 검증은 기존 별도 명령을 계속 사용합니다.

JS/TS 계열의 정확한 확장자는 canonical 정책을 따릅니다. lint 통과는 TypeScript 타입 안전성 검증을 대체하지 않습니다. Svelte lint는 script 경계이며 template 전체 검증이 아닙니다. 잘못된 닫힘 태그를 lint는 통과시키고 formatter는 오류로 거부한 음성 검증이 있습니다. 스타일 파일은 formatter 범위이며 스타일 파일만 선택한 lint는 빈 검사 성공으로 처리하지 않습니다. JSON 설정은 파생 동치 검사로 관리하고, 문서·바이너리·Native 구현을 이 JS 게이트가 검증했다고 보지 않습니다.

## CI 계약

CI는 버전 권위에 맞춘 frozen 의존성 설치 후 `lint`와 `format:check`가 통과해야 합니다. `check` 성공을 제품 테스트·배포 성공으로 확대하지 않습니다. root scripts의 기본 tracked/staged 계약을 사용하므로 clean checkout과 로컬의 미추적 명시 검사는 서로 범위가 다릅니다.

CI 정의는 [.github/workflows/javascript-quality.yml](../.github/workflows/javascript-quality.yml)을 따릅니다. PR/main 품질 검사와 reusable workflow를 사용하고, docs build는 quality job에 의존합니다. CI 성공 여부는 해당 커밋의 GitHub Actions 실행 결과에서 확인합니다. 로컬 검사 통과만으로 CI 성공을 판단하지 않습니다. 도구·정책 변경 시 설치 closure와 통합된 추적 소스의 검사 결과를 같은 커밋 기준으로 확인합니다.

## 도입 시점 검증 기록

2026-10-26 도입 시점에 확인한 범위입니다. 다음 수치와 도구 버전은 해당 입력의 실측 기록이며, 정책의 고정 파일 수나 버전 권위를 대신하지 않습니다.

| 검사 | 확인한 결과 |
| --- | --- |
| 실제 root 설치 | `bun install --frozen-lockfile --ignore-scripts` exit0, oxlint 1.89.0·oxfmt 0.74.0 확인 |
| 품질 게이트 | 당시 기본 tracked 2599파일과 새 quality 4파일의 명시 `check`가 각각 exit0 |
| 안전·설정·독립 검토 | 안전 검사 19건·파생 config 검사 통과, 독립 synthetic 8축과 추가 ignore 3조합 통과, 보호 경로 FS 호출 시도 없음 |
| 전체 `docs:check` | exit0: 예제 9개·코드 블록 9개 타입 검사, HTML 27개·링크 867개 검사에서 오류 0, 설치 license 259개에서 GPL 0, 공개 출력 78개에서 내부 주소 0 |

검사 범위는 파일의 추가·staging 및 정책 변경에 따라 달라집니다. 변경 뒤에는 `quality:files`로 실제 선택 범위를 확인하고 해당 범위에서 게이트를 실행합니다. 타입·제품 동작·배포 검증은 각각의 전용 검사 결과로 판단하며, 설치된 의존성의 license 집계를 전체 소프트웨어의 완전한 라이선스 감사로 확대하지 않습니다. 위 도입 기록에는 GitHub Actions 성공을 포함하지 않습니다.
