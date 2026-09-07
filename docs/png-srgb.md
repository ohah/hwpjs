# PNG sRGB 필드·동반 청크 검사

## 계약과 책임

기준은 [PNG 3 권고안 §11.3.2.5](https://www.w3.org/TR/2025/REC-png-3-20250624/#11sRGB), 표 15~17 및 §5.6 청크 순서입니다. 이 파트는 파일의 필드 일관성을 검사하며 색상 관리 엔진이나 관대한 표시용 decoder 정책은 아닙니다.

- `src/image/png/srgb.zig`는 정확히 1바이트인 rendering intent(0 perceptual, 1 relative colorimetric, 2 saturation, 3 absolute colorimetric), 동반 gAMA/cHRM의 기준값과 일치 검사를 소유합니다.
- `metadata.zig`는 sRGB 최대 한 번·PLTE/IDAT 이전 배치를 검사합니다. sRGB가 먼저 오거나 동반 청크가 먼저 오거나 동일한 검사기를 호출하며, 오류 시 필드와 카운터를 갱신하지 않습니다.
- `pixels.zig`는 optional `srgb`를 반환합니다. 0은 유효한 intent이고 null과 다릅니다. gAMA/cHRM을 임의로 생성하거나 덮어쓰지 않습니다.
- 감마·색도의 원시 필드 배치는 기존 [고정소수점 검사](png-color-fixed.md)가 소유합니다. sRGB 전용 상수를 일반 감마·색도 파서에 넣지 않습니다.

gAMA와 cHRM의 동반 기록은 필수가 아닙니다. 있는 경우에만 sRGB 기준과 정확히 대조합니다. 값 불일치를 보정·반올림·허용 오차로 숨기지 않습니다. 표시용 라이브러리가 불일치 청크를 경고 후 무시하는 것과, 이 검사기의 파일 일관성 오류를 구분합니다.

sRGB가 있으면 `color_semantics_deferred=true`를 유지합니다. 청크의 필드 검사 완료와 실제 색상 변환·픽셀의 색 공간 적합성 검증은 다릅니다. iCCP 동시 존재를 피하라는 권고를 필수 오류로 만들지 않습니다. iCCP/cICP의 구조·프로파일 의미·우선순위는 아직 미구현이며 해당 청크는 ancillary deferred로 남습니다. sRGB와 동반 청크 일치만으로 전체 색상 지원 완료를 주장하지 않습니다. 제품 JS ABI도 변경하지 않았습니다.

## 독립·적대적 검증

`tests/hwp5/png-srgb-evidence.mjs`는 Node 기반 독립 정수·배열 비교를 사용합니다. mode 142는 7개 u32 LE(존재, intent, gAMA 존재, cHRM 존재, 색상 의미 보류, 미검사 ancillary 개수/바이트)를 반환합니다. mode 141의 기존 원값 보고서와도 대조합니다. 색상 의미 보류의 독립 기대값은 `png-transparency-evidence.mjs` 조립 계층에서 한 번 계산하고 두 wire가 공유합니다.

`png-srgb.mjs`는 intent 256값, 길이 0..8, 세 색상 청크의 부분집합/순열, 36개 동반 payload 위치의 256값 변형을 앞/뒤 양쪽 순서로 검사합니다. 5청크의 120개 순열, 중복, IHDR/IDAT/IEND 경계, 모든 PNG 색상 유형과 4개 intent, 미지원 프로파일의 deferred 유지, 입력 한도 및 오류 후 복구도 포함합니다. 픽셀 mode 130 대조는 색상 보정 결과가 아니라 복원 행 바이트 대조입니다.

네이티브 테스트는 intent 전수 검사, 부재 보존, 동반 값 오류의 두 도착 순서에서 State 보존, 중복 0 intent, PLTE/IDAT 이후 거부, 통합 정상/손상 입력의 모든 할당 실패 지점 정리를 확인합니다. 2026-09-07 `zig build test --summary all`은 397/397 통과했습니다. Debug/ReleaseSafe/ReleaseFast 전체 audit도 순차 실행하여 각각 17/17 단계, 네이티브 397/397, 감사 스크립트 3,779,341 checks 통과를 확인했습니다. 로그는 `/tmp/hwpjs-png-srgb-{Debug,ReleaseSafe,ReleaseFast}.log`입니다. 포맷과 변경 JS 문법도 확인했습니다.

같은 날 전용 WASM 비교는 정상 156건·거부 18,896건을 통과했습니다. 정상 입력의 파일 한도 부족 재검사도 거부 수에 포함됩니다. 실제 HWP 미리보기 PNG 32개 모두에 sRGB가 있었고 독립 보고서와 일치했습니다. 이 32개에는 gAMA도 있고 cHRM은 없으므로, 실제 HWP의 감마 교차 검증 근거와 합성 색도 교차 검증 근거를 구분합니다. 로컬 문서 링크 56개를 확인했습니다.

추가 수동 WASM 검증으로 4×4 intent 조합의 중복 16건이 모두 `DuplicatePngSrgb`로 거부되고, 각각 직후 단일 청크를 재입력하여 intent 16건이 정확히 복구됨을 확인했습니다. 이 수동 실행은 자동 audit 수에 포함하지 않습니다.
