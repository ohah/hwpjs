# 덧말 앵커 후보의 전체 HWPX prefix 조회 조사

2026-10-13, 후보 SHA256 `8c302fcd302a5fb677951df6ccc167df2cbda056dc990ef44d3e53c5db84f716`로 reference/rhwp/samples 전체를 검사했습니다. 명령은 다음과 같습니다.

```sh
node tools/reference-hwpx-prefix-query-audit.mjs --wasm=zig-out/verification/dutmal-anchor-input/bin/hwpjs.wasm --root=reference/rhwp/samples
```

439개의 .hwpx 경로 중 실제 HWPX432개를 조회했고, 실제 HWP5인6개는 다른 형식으로 구분했습니다. 암호 HWPX1개는 EncryptedDocument로 별도 거부됐습니다. 조회 대상213765문단은 plain193416·anchored15712·field4570·거부67입니다. 종료코드1이며 로그는 zig-out/verification/dutmal-anchor-input/corpus/full-prefix-query.log입니다. 원본 파일과 WASM hash 불변도 검사했습니다.

동일 corpus의 이전10048379 후보 조사 거부87개보다20개 감소했습니다. 이는 조회 적격성의 변화이며 실제 편집/저장·브라우저·조판 완료가 아닙니다. HWP5로 구분된6개를 HWPX 성공으로 합산하지 않습니다.

남은67문단은 모두 최종 UnsupportedFieldLabelRange이며12파일에 분포합니다. 이 최종 오류 이름만으로 원인을 동일하게 단정하지 않습니다.

| 경로 (samples 아래) | 거부 문단 수 |
| --- | ---: |
| hwpx/143E433F503322BD33.hwpx | 3 |
| hwpx/aift.hwpx | 3 |
| issue1891/80168_regulatory_analysis.hwpx | 3 |
| issue1891/86712_regulatory_analysis.hwpx | 24 |
| issue1891_external_bindata_link.hwpx | 5 |
| issue3637/regulatory_impact_nested_table_escape.hwpx | 3 |
| issue5543_carried_anchor_ladder.hwpx | 14 |
| issue5729/stacked_tac_band_om_top.hwpx | 1 |
| issue6035/cgmp_evaluation_table.hwpx | 1 |
| issue6298/copay_cap_tac_table_leading.hwpx | 5 |
| tac-img-02.hwpx | 4 |
| 추진일정.hwpx | 1 |

이 목록이 다음 원인 재현의 기준이며, 보호/계산 필드를 일괄 허용하지 않습니다. 덧말 내부 편집/표시, 전체 실제 저장 감사, 암호 입력 경로와 다른 HWP5 읽기/편집 검증도 별도로 남습니다.
