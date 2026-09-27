# ICC 기반 계층 독립 검증

## 테스트 연결과 검증 경계

`src/image/icc/root.zig`는 ICC 헤더·extent·ID·태그 테이블과 이후 추가된 타입·곡선·행렬 계층의 Zig 진입점을 모읍니다. 이 문서는 처음 구축한 **헤더·테이블·PNG 압축 봉투 독립 검증**의 이력이며, 이후 ICC 기능 전체의 완료 증거는 아닙니다. PNG 압축 봉투와 ICC는 별도 모듈입니다. 아래 mode는 `tests/hwp5/probe.zig`의 테스트 전용 인터페이스이며 제품 JS/WASM ABI는 여전히 CFB만 제공합니다.

- mode 143: ICC 전체 버퍼 → 148바이트. 헤더의 모든 필드를 다시 직렬화한 128바이트, ID 상태 u32 LE(0 v2 미정의 / 1 v4 미계산 / 2 일치), 계산한 ID 16바이트(v2는 0)입니다. 헤더 숫자는 LE로 변환하고 버전 네 바이트는 major/minor/bugfix/0입니다. 나머지 서명·tail은 원값입니다.
- mode 144: max_tags u32 LE + policy u32 LE(0 bounded / 1 icc_2022) + ICC 버퍼를 받습니다. 8개 u32 LE(태그 수, 테이블 끝, 고유 요소, 공유 항목, 겹치는 요소, 미참조 바이트, 검사된 패딩, 배치 검증 여부) 뒤에 원래 순서의 20바이트 태그 보고서를 반환합니다. 각 행은 서명 4바이트, offset/size u32 LE, 타입 서명 4바이트, 원시 data CRC32 u32 LE입니다. 공유된 큰 data를 항목마다 복제하지 않습니다.
- mode 145: 최대 해제 크기 u32 LE + iCCP payload를 받아 이름 길이/해제 길이 u32 LE 두 개와 이름·해제 바이트를 반환합니다. ICC 유효성을 검사했다는 결과가 아닙니다.

외부 limit은 각각 ICC 버퍼 또는 iCCP payload 입력 한도입니다. 독립 기대값은 `icc-header-evidence.mjs`(Node 정수·MD5), `icc-table-evidence.mjs`(Node CRC32와 바이트 점유 배열), `png-profile-evidence.mjs`(Node zlib와 공통 독립 keyword 검사)가 소유합니다. 제품 파서나 serializer로 기대값을 생성하지 않습니다.

`icc.mjs`는 헤더 모든 위치의 바이트 변형, v2/v4 tail, ID 제외 필드/불일치, 잘림, 태그 순서·공유·겹침·패딩·중복·크기/개수 경계, 바이너리 압축/후미/gzip/raw 거부·할당 한도·오류 후 정상 입력을 검사합니다. 태그 보고서 대조는 필드와 CRC32 비교이며 태그 내용의 의미 해석이나 색상 변환 비교가 아닙니다.

## 실측

2026-09-07 신규 WASM 전용 비교는 정상 38,178건·거부 23,551건을 통과했습니다. 헤더 변형 32,768건, 태그 변형 26,624건, 압축 봉투 변형 1,380건을 포함합니다.

새 테스트를 연결한 전체 `zig build audit --summary all`을 Debug, ReleaseSafe, ReleaseFast 순서로 실행했고, 세 모드 모두 종료 코드 0, 17/17 단계, 네이티브 412/412 테스트, HWP 감사 3,841,070건 통과를 확인했습니다. Release 모드는 각각 `-Doptimize=ReleaseSafe`, `-Doptimize=ReleaseFast`를 추가했습니다. 로컬 실행 로그는 `/tmp/hwpjs-icc-foundation-Debug.log`, `/tmp/hwpjs-icc-foundation-ReleaseSafe.log`, `/tmp/hwpjs-icc-foundation-ReleaseFast.log`입니다(임시 로그이며 저장소 산출물이 아님). 검사 개수는 명세 지원률이나 모든 문서의 동일성을 의미하지 않습니다.

레거시 HWP fixture 48개의 미리보기 조사에서 PNG 32개, iCCP 0개를 확인했습니다. 따라서 실제 HWP 내장 ICC 프로파일을 검증했다고 주장하지 않습니다.

추가 수동 WASM 경계 검사에서는 mode 144의 0~7바이트 입력, mode 145의 0~3바이트 입력, 정책값 2/255/0xffffffff를 모두 예상 오류로 거부했습니다(15건). 이후 같은 인스턴스의 정상 헤더 처리를 확인했습니다. 이 수동 검사는 자동 audit 수에 합산하지 않습니다. 변경한 JS 6개 문법·Zig 포맷·관련 문서의 로컬 링크 55개도 확인했습니다.

## 공식 외부 파일 비교

같은 날 [ICC sRGB 자료](https://registry.color.org/rgb-registry/srgbprofiles)와 [공식 added-bytes 설명](https://www.color.org/security/malformed/added-bytes/)의 아래 파일을 메모리로만 읽었습니다. 저장소에 프로파일이나 외부 구현 코드를 편입하지 않았습니다. 네 파일 모두 헤더 보고서가 독립 기준과 일치했습니다. v2 두 파일은 ID 미정의 상태이고, v4 두 파일은 비영 프로파일 ID가 일치했습니다.

| 파일 | 버전 | 바이트 | 태그 수 | bounded 미참조 바이트 | icc_2022 결과 |
|---|---|---:|---:|---:|---|
| [sRGB2014.icc](https://registry.color.org/rgb-registry/profiles/sRGB2014.icc) | 2.0.0 | 3024 | 16 | 3 | 통과, 패딩 3 |
| [sRGB_v4_ICC_preference.icc](https://registry.color.org/rgb-registry/profiles/sRGB_v4_ICC_preference.icc) | 4.2.0 | 60960 | 9 | 4 | 통과, 패딩 4 |
| [sRGB_v4_ICC_preference_displayclass.icc](https://registry.color.org/rgb-registry/profiles/sRGB_v4_ICC_preference_displayclass.icc) | 4.2.0 | 60988 | 9 | 4 | 통과, 패딩 4 |
| [added-bytes.icc](https://archive.color.org/security/malformed/added-bytes.icc) | 2.1.0 | 568 | 10 | 17 | InvalidIccTagGap |

두 정책의 태그 보고서 전체를 독립 기준과 대조했습니다. bounded의 미참조 바이트에는 패딩도 포함됩니다. sRGB2014는 물리적 요소 14개를 16개 태그가 참조하여 공유 항목 2개도 확인했습니다. 다른 세 파일은 공유 항목이 없었습니다.

각 파일을 변경하지 않고 시험용 iCCP payload로 압축한 뒤 mode 145로 해제해 이름·전체 원시 프로파일 바이트를 직접 비교했습니다. 이는 합성 압축 봉투 안의 실제 ICC 데이터 비교이며, 실제 PNG/HWP 안에서 해당 파일을 발견한 것은 아닙니다. 이 수동 외부 비교는 자동 audit 수에 합산하지 않습니다.

재현 입력 SHA-256:

```text
sRGB2014.icc                                  384b832de3412066743b52a75ee906b6fb9fb8d9e09e936fc2c43223815c6e0a
sRGB_v4_ICC_preference.icc                     83174717332326ddc198d9df188a4daec27b8979ba152cebbfc470c793d0bb11
sRGB_v4_ICC_preference_displayclass.icc        f54b145a18e4b12112750e672f1c79cac9347dc8403da3955e7f74a352816a21
added-bytes.icc                               45eaa55b6a5214c16537a0d02f3dbd72d1ea16807bc8c64f293a14ae914899c8
```

검증 범위는 [헤더·ID](icc-structure.md), [태그 테이블](icc-tag-table.md), [PNG 압축 봉투](png-embedded-profile.md)의 당시 계약을 따릅니다. 이후 [헤더 의미 검증](icc-header-verification.md)·[필수 태그](icc-required-tags.md)·[PNG 프로파일 검사](png-profile-inspection.md)·[matrix/TRC 순방향](icc-matrix-trc-forward.md)과 [역방향](icc-matrix-trc-inverse.md) 등은 별도 문서와 테스트에서 관리합니다. 이 초기 세 mode만으로 전체 ICC 색상 변환이나 HWP/HWPX 문서 지원을 입증하지 않습니다.

2026-09-27 재검증에서는 현재 `src/image/icc/root.zig`·`tests/hwp5/probe.zig`의 진입점과 mode143/144/145 연결, `icc.mjs`의 Node 정수·CRC32·zlib 독립 기대값 및 제품 JS 공개 범위를 대조했습니다. 기존 로컬 테스트용 WASM 직접 실행은 정상 비교 38,178건·예상 거부 23,551건(헤더 변형 32,768·테이블 변형 26,624·압축 봉투 변형 1,380)이 일치했습니다. 거부 검사에서 호스트 `TypeError`도 통과할 수 있던 약점을 재현해, 독립 기준의 예상 오류 종류와 제품의 파서 오류 종류를 제한했습니다. 새 거부 가드 테스트 2/2와 인위적 호스트 `TypeError` 주입이 실패를 검출했고, 보강 후 같은 대조 결과가 유지됐습니다. 공식 ICC 외부 파일 네 개의 SHA-256도 원본 URL을 다시 읽어 위 기록과 일치했습니다. ReleaseFast `zig build hwp5-audit -Doptimize=ReleaseFast --summary all`은 10/10 단계·8,905,855검사로 통과했습니다. 과거 `/tmp` 세 모드 전체 audit 로그는 현재 없으며 이번에 세 모드 전체 audit·실제 PNG/HWP 내장 ICC를 재실행한 것으로 세지 않습니다. 이 빌드의 테스트용 WASM 컴파일 단계는 캐시 재사용이므로 새 WASM 재빌드 증거로 세지 않습니다.
