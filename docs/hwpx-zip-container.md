# HWPX ZIP 컨테이너 읽기 경계

## 계약

`src/zip/archive.zig`는 메모리의 ZIP을 빌리고 중앙 디렉터리 엔트리 배열만 소유합니다. EOCD의 정확한 끝/구역 수/중앙 디렉터리 크기, 로컬 헤더의 이름·방식·플래그·고정 메타데이터, bit 3의 선택적 서명형/무서명형 data descriptor와 로컬 엔트리 범위의 비중첩을 대조합니다. descriptor의 CRC가 선택 서명 값과 같을 수 있으므로 중앙 값과 일치하는 무서명 배치를 먼저 판정합니다. 저장(0)·DEFLATE(8)만 읽고, 암호화·분할 아카이브·ZIP64는 명시적 오류로 거부합니다. 엔트리 이름은 비어 있거나 절대 경로, `..` 경로 구성 요소, 역슬래시, NUL, 중복 이름이면 거부합니다. 엔트리 수·개별 해제 크기 한도는 호출자가 선택합니다.

`Archive.decode`는 기존 `raw_deflate`를 재사용하고, 반환 전에 출력 길이와 중앙 디렉터리 CRC-32를 확인합니다. 반환 바이트는 호출자가 해제하며 입력 ZIP 바이트는 아카이브 수명 동안 유효해야 합니다. 여러 엔트리의 *합계* 해제량은 아직 이 계층에서 관리하지 않으므로 문서 조립 단계의 별도 공통 예산이 필요합니다. 중앙 디렉터리 코멘트·extra와 ZIP의 모든 선택적 확장은 해석하지 않으며, 이 경계 통과를 전체 ZIP 무결성 보증으로 해석하지 않습니다.

`src/hwpx/package.zig`는 정확한 루트 `mimetype` 엔트리의 저장 방식, CRC, `application/hwp+zip` 바이트를 검사합니다. 이것은 HWPX 식별 경계일 뿐 `version.xml`, `Contents/content.hpf`, section 관계·XML 스키마·본문 의미 검증·편집·저장은 포함하지 않습니다. 제품 JS 공개 API도 아직 연결되지 않았습니다.

ZIP 레코드 구조의 기준은 [PKWARE APPNOTE](https://pkwaredownloads.blob.core.windows.net/pem/APPNOTE.txt) 4.3.7/4.3.12/4.3.16입니다. 여기의 HWPX `mimetype` 값과 내부 경로는 기존 실제 HWPX corpus에서 직접 대조합니다. 명세에 없는 HWPX 패키지 의미를 추정하지 않습니다.

## 실파일·적대적 검증

기존 `example.hwpx`(11개 엔트리/해제 합계 65,346바이트)와 `noori.hwpx`(15개/825,216바이트)의 모든 엔트리를 해제해 선언 길이·CRC·합계를 대조합니다. 그중 저장된 `mimetype`와 DEFLATE된 `Contents/header.xml`, `Contents/section0.xml`은 형식과 XML 선언도 확인합니다. 두 원본에 대한 독립 `unzip -t`도 모든 엔트리 무결성 검사를 통과했습니다. 원본 파일은 변경하지 않습니다. 합성 변형은 EOCD/중앙 디렉터리/로컬 헤더의 서명·방식·플래그·이름·구역 수·크기·ZIP64 sentinel·경로 순회·CRC·mimetype를 교란하며, 오류 뒤 원본을 재검사합니다. 별도로 서명 유무가 다른 descriptor, CRC와 서명값 충돌, 아카이브 주석 안의 가짜 EOCD, 로컬 payload 겹침을 재현합니다. 엔트리 인덱스의 모든 할당 실패도 검사합니다.

이 검증은 ZIP/HWPX 진입 경계의 근거이지 HWPX 문서 전체의 해석이나 HWP5와의 동등성 근거가 아닙니다. HWPX 본문 구현 전에 package manifest와 관계를 별도 계약으로 고정해야 합니다.

## 2026-09-23 최종 검증 기록

- 최종 소스에서 `zig test src/root.zig --test-filter HWPX` 12/12, 전체 `zig build test --summary all` 2,034/2,034, ReleaseSafe WASM 제품 빌드 5/5 단계를 통과했습니다.
- 최종 `zig build audit --summary all`의 Debug·ReleaseSafe·ReleaseFast가 각각 40/40 단계·2,073/2,073 테스트, HWP5/WASM 8,905,827회 검사로 종료 코드 0이었습니다. 로그는 `/tmp/hwpjs-hwpx-zip-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. 기존 HWP5 검사 수를 새 HWPX 의미 검사 수로 해석하지 않습니다.
- 원본 작업 트리와 분리한 복사본에서 CRC 검사, 로컬 이름 대조, mimetype 내용 검사, 로컬 범위 비중첩, 무서명 descriptor CRC/서명 충돌 판정, 주석 속 가짜 EOCD 판정을 각각 약화했습니다. 여섯 변형 × 세 빌드 모드의 18/18 실행이 테스트 assertion으로 실패했고 컴파일 실패나 살아남은 변형은 없습니다. 일부 Debug/Safe 실패에는 기대 오류 대신 성공한 아카이브를 테스트 코드가 해제하지 않아 누수 진단도 뒤따랐습니다. 이 부가 진단을 별도 결함으로 세지 않습니다.
- `zig fmt --check build.zig src`, `git diff --check`, 변경 문서의 로컬 링크 확인, 두 실제 파일의 독립 `unzip -t`가 통과했습니다. 임시 변형은 제품 코드에 적용하지 않았습니다.
