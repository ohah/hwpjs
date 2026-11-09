# 로컬 OCR 실행 권한

CLI의 명시적인 OCR와 MCP 도구의 실행파일 선택 권한을 구분한다. 이 계약의 보안 변경은 로컬 후보이며, 공개 npm 0.1.1과 배포된 문서에는 아직 반영하지 않았다.

## 실행파일 선택

직접 CLI를 실행하는 사용자는 기존 `ocr --executable PATH`를 계속 사용한다. MCP `ocr_document`의 요청 스키마에서는 `executable`을 제거했다. 공식 SDK 스키마뿐 아니라 도구 콜백의 strict 검증도 알 수 없는 필드를 거부하므로, 직접 콜백을 호출해도 CLI·파일 읽기 전에 실패한다.

서버 운영자는 시작 인수 `--ocr-executable PATH` 또는 프로그래밍 API의 `ocrExecutable`로 Tesseract 실행파일을 고정한다. 미지정 시 기존 `tesseract`를 사용한다. 이 설정은 호출자가 선택한 `provider: tesseract`에만 적용한다. `vision`은 기존 `/usr/bin/osascript`와 고정 JXA 스크립트를 사용한다. 서버 설정 문자열의 빈 값·잘못된 UTF-16·NUL과 중복·누락·알 수 없는 시작 인수를 거부한다.

OCR 도구의 `readOnlyHint`는 `false`다. 외부 프로세스를 실행하는 도구에 대한 클라이언트의 승인 판단을 정확하게 하기 위한 힌트다. 실행 권한의 실제 경계는 요청 스키마와 서버 설정이며, annotation에 보안을 의존하지 않는다. 다른 도구의 annotation은 유지한다.

## 자식 프로세스 환경

`ocr/process-environment.ts`가 Tesseract와 Vision의 공통 환경 전달 정책을 소유한다. PATH·사용자/임시 폴더·Windows 시스템 경로·언어·`TESSDATA_PREFIX`만 명시 목록으로 전달하며, `OMP_THREAD_LIMIT=1`은 서버가 고정한다. 임의 키를 제외하는 방식 대신 필요한 키만 선택하므로 새로 추가된 인증 환경변수도 기본적으로 전달하지 않는다. token/credential, NODE_OPTIONS, LD_PRELOAD, DYLD_INSERT_LIBRARIES, 프록시 설정 등은 전달 목록에 없다. 실제 프로세스 실행에 필요한 설정을 유지하고 부모 환경은 변경하지 않는다.

기존 shell=false, 고정 인수 배열, 입력/출력 한도, timeout/취소, 소유 프로세스 그룹 종료 정책은 유지한다. 외부 OCR 실행기는 사용자 계정의 파일 권한으로 실행되므로 운영자가 신뢰하는 프로그램을 선택해야 한다. 환경 제한이 파일시스템 접근까지 격리하는 것은 아니다.

## 확인한 원인과 검증

이전 runner가 `process.env` 전체를 복사했고 MCP 요청자가 임의 실행파일을 지정할 수 있었다. 실제 소유 자식에서 합성 비밀 키의 전달을 재현했다. 같은 입력으로 이전 코드에서는 키가 보였고 수정 코드에서는 보이지 않았다. 실제 인증 값은 검사 출력에 기록하지 않았다.

집중 source 검사는 자식 환경 제한과 실제 stdin/stdout, timeout/취소 정리를 포함한다. MCP 검사는 공식 SDK·직접 콜백의 거부, 서버 고정 실행파일의 반복 전달, Vision 분리, 시작 인수 검증과 16개 도구 목록을 확인한다. Source 검사 45개 중 41개가 통과했고, 기존 환경 선택형 Native 검사 4개는 실행하지 않았다. strict 타입 검사와 명시 파일 oxlint/oxfmt도 통과했다.

격리 SDK를 패킹·설치해 파일 126개를 대조했고, 설치 CLI/MCP 서비스 E2E 두 진입점이 통과했다. 별도 설치 OCR E2E 두 검사는 실제 Noori와 소유 합성 실행기를 사용해 CLI의 운영자 선택, MCP 클라이언트의 실행파일 거부, 서버 고정 실행파일의 성공과 비밀 환경 미전달·자식 종료를 확인했다. 이는 실제 Tesseract의 인식 정확도 검사가 아니다. macOS의 실제 Vision은 Noori image1.jpg에서 한국어·영어 제목을 인식해, 제한된 환경에서도 OS 공급자가 동작하는 것을 별도로 확인했다. Windows 환경 이름 정규화는 단위 검사이며 실제 Windows 실행 증거는 없다.

## Socket 의존성 경고

공개 0.1.1의 자체 URL 경고는 HWPX namespace 식별자다. 이를 삭제하거나 HTTPS로 바꾸면 문서의 namespace 동일성이 달라지므로 그대로 유지한다. RN optional peer를 펼친 트리의 HMR과 glob 경고는 이 OCR 실행 권한 수정과 별개다. RN 예제는 `Bundle.main`의 로컬 main.jsbundle URL을 사용하며 이 정적 확인을 모든 소비자 앱의 Release/HMR 구성 검증으로 확대하지 않는다.

picomatch 2.3.2는 알려진 extglob ReDoS GHSA-c2c7-rcm5-vvqj의 공식 수정 버전이다. Socket의 잠재 경고를 전부 해결됐다고 표시하거나 근거 없이 다른 major로 덮어쓰지 않았다. 별도 CVE-2026-112366은 당시 GitHub에 Unreviewed·영향/수정 버전 Unknown으로 올라와 있어 추가 조사 대상으로 구분한다.

- [picomatch 공식 보안 권고](https://github.com/micromatch/picomatch/security/advisories/GHSA-c2c7-rcm5-vvqj)
- [별도 미검토 권고](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)

검증 명령은 [개발·검증 명령](development-commands.md#ocr-process-security)이 소유한다. 초기 배포 파일·Socket UI 검토 증거는 `zig-out/verification/socket-audit-r1/`, 수정 전후·추가 검증은 `zig-out/verification/ocr-security-r1/`에 보존한다. npm 게시·문서 배포·경고 일괄 무시는 수행하지 않는다.
