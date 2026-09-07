# PNG 물리적 픽셀 크기·유효 비트 수

## 계약과 책임

[PNG Third Edition §11.3.4.3](https://www.w3.org/TR/png-3/#11pHYs)의 pHYs는 `physical.zig`에서 정확히 9바이트로 읽습니다. X/Y는 big-endian PNG four-byte unsigned integer(0..2³¹−1), 단위는 0(미지정) 또는 1(미터)입니다. 다른 단위는 미지원 오류입니다. 별도의 양수 하한이 명시되지 않아 0을 보존하며 비율 나눗셈이나 DPI 변환을 하지 않습니다.

[§11.3.2.4](https://www.w3.org/TR/png-3/#11sBIT)의 sBIT는 `significant_bits.zig`가 읽습니다. 색상 0/2/3/4/6의 필드 개수는 각각 1/3/3/2/4이며 각 값은 1..sample depth입니다. indexed의 sample depth는 IHDR의 인덱스 bit depth가 아닌 palette RGB의 8입니다. tRNS가 암시하는 alpha를 추가 필드로 읽지 않습니다. 일반 채널 수와 유효 Header 검사는 기존 Header가 소유합니다.

중복과 [§5.6 청크 순서](https://www.w3.org/TR/png-3/#5ChunkOrdering)는 기존 `metadata.State`에서 검사합니다. pHYs는 IDAT 이전이며 PLTE 전후 모두 허용합니다. sBIT는 PLTE와 IDAT 이전입니다. 실패한 payload는 상태와 검증 카운터를 바꾸지 않습니다.

`pixels.Report`의 optional physical/significant_bits는 입력을 빌리지 않는 값입니다. sBIT는 bits[4]와 count를 가지고 미사용 슬롯은 0입니다. 부재는 null로 남기며 기본값을 가짜 청크로 만들지 않습니다. 부재 시 명세의 표시 기본값(정사각 픽셀, 모든 sample bit 유효)은 향후 소비자의 책임입니다. 실제 크기 계산·sample 재스케일링·RGBA 변환·렌더링은 이번 범위가 아닙니다.

검사가 끝난 두 청크의 수와 payload 바이트만 기존 ancillary deferred에서 제외합니다. CRC·필수 청크·압축·픽셀 검증은 기존 모듈을 재사용합니다. 제품 JS API는 변경하지 않습니다.

## 독립·적대적 검증

네이티브는 단위 바이트 0..255, 양 축의 31-bit 경계, 잘못된 길이, 모든 유효 색상/depth 조합에서 각 sBIT 위치의 0..255, 중복·순서·실패 상태를 검사합니다.

테스트 전용 WASM mode 133은 전체 PNG를 받아 12개 u32 LE(48바이트)를 반환합니다: pHYs 존재·X·Y·단위, sBIT 존재·count·bits 4개, deferred 청크·바이트. 독립 JS는 Buffer big-endian 읽기와 청크 배열 위치로 기대값을 계산하며 기존 픽셀/투명도 보고서도 함께 대조합니다. 전용 값 규칙은 `png-sample-metadata-evidence.mjs` 한 곳에서 소유합니다.

정규 audit에는 모든 단위와 채널별 바이트 값, 길이·중복·순서 오류, PLTE 전후 pHYs, indexed+tRNS의 3채널 sBIT, 5종 메타데이터 혼합 시 unknown ancillary 유지, 입력 한도, 실제 HWP의 PrvImage 회귀 비교를 포함합니다.

Debug·ReleaseSafe·ReleaseFast 전체 audit를 순차 실행해 각각 17/17 단계, 네이티브 362/362, 감사 스크립트 3,179,620 checks를 통과했습니다. 전용 결과는 정상 424건·거부 9,425건(정상 입력의 한도 미달 거부 포함)입니다. 실제 PNG 32개 모두에 pHYs가 있어 값을 대조했으며 sBIT는 0개라 양성 sBIT는 합성 입력으로 검증했습니다.

추가 수동 적대적 검사에서는 sBIT/pHYs/PLTE/tRNS/bKGD/hIST 6개 청크의 720가지 순열을 Debug WASM과 독립 JS 기준으로 비교했습니다. 허용 36가지·거부 684가지가 일치했습니다. 이 전수 순열 검사는 정규 audit 횟수에 포함하지 않습니다. 포맷·변경 JS 문법·관련 로컬 문서 링크 25개·diff 공백 검사도 통과했습니다.
