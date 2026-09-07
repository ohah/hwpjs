# PNG iTXt 국제 텍스트

## 계약

`image.png_international_text.decode(allocator, payload, options)`는 [PNG Third Edition §11.3.3.4](https://www.w3.org/TR/png-3/#11iTXt)에 따라 키워드·압축 플래그/방식·언어 태그·번역 키워드·본문을 읽습니다. 빈 언어는 미지정이며, 비어 있지 않은 언어는 [고정 IANA 등록 검사](bcp47-registry.md)를 통과해야 합니다.

압축 플래그는 0/1만 허용합니다. 1이면 방식 0의 정확한 단일 zlib 스트림을 요구하며 추가 스트림·후행 바이트를 거부합니다. 0이면 디코더 규칙에 따라 방식 바이트를 무시하고 원값을 보존합니다. 비영 방식은 ignored_methods 진단에 집계하며 파일 손상으로 거부하지 않습니다.

번역 키워드와 본문은 엄격한 UTF-8이며 NUL은 금지합니다. 잘림·overlong·surrogate·U+10FFFF 초과는 거부합니다. 비권장 제어문자 U+0001~0009/U+000B~001F/U+007F~009F는 Unicode scalar 기준으로 세되 거부하지 않습니다. 번역 키워드의 LF도 별도 집계합니다. BOM·비문자·줄바꿈·대소문자를 제거하거나 정규화하지 않습니다. 번역 내용의 정확성이나 키워드별 XMP/날짜 의미는 검증하지 않습니다.

언어 extension 내부 어휘는 `international_text.extension_semantics_deferred`에 남습니다. iTXt 구조·문자·등록 검사를 성공해 청크가 ancillary deferred에서 제외되어도, 이 수치가 0보다 크면 extension 의미까지 검증한 것은 아닙니다. 렌더링·편집·저장·제품 JS 텍스트 API·HWP 이미지 스트림 연결은 별도 미완료 범위입니다.

## 책임과 수명

- `international_header.zig`: 키워드 재사용, 플래그/방식과 구분자·필드 경계.
- `international_utf8.zig`: UTF-8/NUL 검사와 비권장 문자 진단. XML 문자 정책·Latin-1 정책과 분리합니다.
- `international_text.zig`: 기존 언어 등록·zlib 모듈 조립과 반환값 수명.
- `international_stats.zig`: 성공한 청크 통계. `metadata.State`와 픽셀 Report가 같은 타입을 사용합니다.

비압축 본문과 모든 헤더 문자열은 입력을 빌립니다. 압축 본문만 할당자가 소유하며 Value.deinit이 해제합니다. 반환값과 언어 보고서가 빌린 입력의 수명을 유지해야 합니다. metadata는 임시 Value를 해제한 뒤 scalar 통계만 보관합니다. 실패 시 부분 집계를 남기지 않습니다.

## 한도와 통합

`pixels.Options.max_text_bytes`(기본 64 MiB)는 tEXt·zTXt·iTXt **해제된 본문 바이트의 합계**입니다. `metadata.State.consumeTextOptions`가 기존 소비량을 차감한 남은 한도만 디코더에 전달합니다. 압축 해제 도중 초과하면 실패하고 잘라서 성공시키지 않습니다. 키워드·번역 키워드·언어·청크 헤더는 본문 합계에서 제외하며 PNG 입력/청크 한도에 속합니다. 픽셀 해제 한도와도 독립적입니다.

standalone decode는 Options.max_text_bytes로 자신의 본문만 제한합니다. Options.language와 pixels.Options.language는 공통 BCP 47 한도(기본 4096바이트·512 subtags)를 노출합니다. 긴 private-use 태그도 명시적으로 한도를 늘려 검사할 수 있습니다. 빈 언어는 언어 한도가 0이어도 허용합니다. State.consumeBounded는 기본 언어 옵션을 사용하는 호환 진입점이고, 비할당 State.consume는 iTXt/zTXt를 소비하지 않습니다.

## 검증

네이티브는 모든 플래그·방식 바이트, 빈 필드·구분자 잘림, 언어 오류와 한도, UTF-8 오류/비권장 scalar, 압축/비압축 수명, 합산 한도의 순서 독립성과 실패 상태 불변, usize 경계, 등록/해제/PNG 조립의 모든 할당 실패 정리를 검사합니다.

테스트 전용 WASM mode 139 입력은 u32 LE 본문 합계 한도·언어 바이트 한도·subtag 한도 뒤에 PNG를 붙입니다. 외부 limit는 PNG 입력 한도입니다. 출력은 9개 u32 LE(청크·키워드 바이트·언어 바이트·번역 바이트·본문 바이트·extension 의미 보류·비권장 제어문자·번역 LF·무시한 방식), 이어 각 iTXt의 플래그·원래 방식·네 문자열 길이 6개 u32와 키워드/언어/번역/본문 바이트입니다. 기존 제품 JS ABI는 변경하지 않습니다.

독립 JS는 fatal TextDecoder, Node zlib의 소비 길이/출력 한도, 독립 등록 oracle을 사용합니다. 플래그/방식 전체 값, UTF-8 경계, 11,776건의 바이트 변형, 잘림·후행 압축 스트림·gzip/raw DEFLATE, 세 텍스트 종류의 6개 순열·정확한 합산 한도, 8191바이트 언어의 명시적 한도 확대, 1 MiB 압축 텍스트, 실패 후 회복을 비교합니다.

전용 WASM 결과는 정상 2,457건·거부 10,547건 일치입니다. 실제 HWP 미리보기 PNG 32개도 비교했으나 iTXt는 0개였습니다. 이 HWP 조사에서 iTXt 양성 근거를 얻은 것은 아닙니다. 별도 외부 PNG 양성 비교는 아래에 구분합니다.

적대적 재검토에서 기존 mode 136의 JS 기준 직렬화기가 tEXt/zTXt만 합산하고 iTXt를 누락한 것을 수정했습니다. 세 종류의 6개 순열에서 mode 139뿐 아니라 mode 136의 정확한 한도/1바이트 부족도 확인하도록 보강했습니다. 제품 합산 계산은 이미 세 종류를 포함하고 있었으며 테스트 기준의 누락이었습니다. 보강 전 Debug 전체는 17/17 단계·387/387 테스트·3,720,114 checks를 통과했으나, 최종 결과로 사용하지 않고 보강 후 다시 실행했습니다.

최종 변경 상태로 Debug·ReleaseSafe·ReleaseFast를 순차 검증해 각각 17/17 단계, 네이티브 387/387, HWP5 감사 스크립트 3,720,126 checks를 통과했습니다. 로그는 `/tmp/hwpjs-png-international-Debug-final.log`, `/tmp/hwpjs-png-international-ReleaseSafe.log`, `/tmp/hwpjs-png-international-ReleaseFast.log`입니다. 관련 로컬 문서 링크 55개, 변경 JS 문법, Zig 포맷, diff 공백 검사도 통과했습니다. 전체 PNG/HWP 명세나 렌더링 완료를 의미하지 않습니다.

추가 수동 적대적 검사에서는 압축 플래그와 방식의 모든 65,536개 조합을 실제 WASM에서 실행했습니다. 비압축 256개 방식과 압축 방식 0의 총 257개를 허용하고 나머지 65,279개를 거부했습니다. 성공 시 본문 길이·원래 플래그/방식·무시한 방식 진단까지 확인했습니다. 이 실행은 정규 audit 집계에 포함하지 않습니다.

### 외부 PngSuite 교차 확인

별도 수동 실행에서 [PngSuite 공개 미러](https://github.com/lunapaint/pngsuite/tree/8cd768dd0d0063195174d0d01cacbd5a7d1e5605/png)의 텍스트 샘플 8개를 읽어 mode 139 원문/통계와 mode 130 픽셀 보고서를 독립 JS 결과와 비교했습니다. 모두 일치했으며 그 중 5개에 비압축 iTXt 총 30개가 있습니다. 외부 작성 PNG 양성 근거이지만 HWP 내부 iTXt 사례나 압축 iTXt 실파일 근거는 아닙니다. 위 합성 입력·HWP fixture 집계와 합치지 않습니다.

원 배포 사이트의 HTTPS는 TLS 연결에 실패해 인증 검증을 끄지 않고 미러의 위 고정 커밋을 사용했습니다. 이미지는 메모리에서 읽기만 했고 저장소 의존성/fixture로 추가하지 않았습니다. 정규 audit에는 네트워크를 넣지 않습니다. 재현 대상은 위 디렉터리의 다음 파일과 SHA-256입니다.

| 파일 | 바이트 | iTXt | SHA-256 |
|---|---:|---:|---|
| ct0n0g04.png | 273 | 0 | `081d1ec26b4157fbc032b76dc716321420f2d032a425de046557c7842766826d` |
| ct1n0g04.png | 792 | 0 | `259116f8ecf849d83d824688eb02b4575aed11980f02ab6fb123281c25a6459d` |
| cten0g04.png | 742 | 6 | `4583e63d1bdfa18b6abb47439dee9a73bed311ed1b0a71d22bed75fe4767832b` |
| ctfn0g04.png | 716 | 6 | `d0607280c3539a8934c5cfd22788b382cdc31321cdedc75ae8a29e3948580ba6` |
| ctgn0g04.png | 1182 | 6 | `5f4c87f5a8f589d029a908050880ac5d6aed3810e55e75444802d6d3fb27cf33` |
| cthn0g04.png | 1269 | 6 | `8ef799e59871755578e563c5b411bc3895c2f7112c115aaa921b6c04fe255bf2` |
| ctjn0g04.png | 941 | 6 | `ca91332ecc04e5faac1f39ca4df4996b072a93f3e574e7f4b50d52aafbfe67b6` |
| ctzn0g04.png | 753 | 0 | `c0765e635a6423ec64f0314400c3df20745c4a4469ffcc323c7b00ba66b4aceb` |
