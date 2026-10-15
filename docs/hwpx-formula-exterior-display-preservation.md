# 바깥 텍스트 수정과 수식 표시 보존

## 계약과 수정

수식과 무관한 필드 바깥 텍스트 편집은 원래의 수식 표시와 source cache를 임의로 동기화하지 않습니다. 표시 provenance와 실제 입력 변경에 따른 무효화는 기존 `formula_splice.spliceProjectedWithOverrides` 트랜잭션이 소유합니다. source cache/현재 표시의 구분은 [수동 결과 계약](hwpx-formula-result-override.md)을 따릅니다.

격리 main 통합에서 `field_source_outside_session`이 override 없는 wrapper를 호출하는 누락을 확인했습니다. source 표시100/cache2인 합성 원본에서 바깥 텍스트만 수정한 집중 검사가 expected100/actual2·exit1로 실패했습니다. 해당 호출에 현재 override와 source display options를 전달하도록 연결했고 원래 작업 트리의 다른 변경은 가져오지 않았습니다. source 좌표 계획의 같은 옵션 누락은 [Canvas 연속 입력 재현](canvas-formula-result-input.md)이 소유합니다.

## 검증

`zig test src/hwpx_formula_exterior_override_tests.zig -O ReleaseSafe --test-filter 'HWPX exterior'`는2/2·exit0입니다. 표시100/cache2, 기대 전체 구역 XML(바깥 prefix만 변경), 재열기·원문 보존·undo/redo bytes와 같은 검증의 전체 할당 실패 지점을 포함합니다. root에도 진입점을 등록했습니다. 이전의 전체 native 바이너리에 새2개를 소급하지 않습니다.

실제 chart에서 파생한 mixed hyperlink/결과 주변 텍스트 문서도 별도로 검사했습니다. `formulaExteriorFixture`는 검증용 파생본이며 원래 파일의 지원 수에 더하지 않습니다. 표시100/source cache67.5로 저장 후 다시 연 상태에서 hyperlink 바깥 prefix만 입력하고, 독립 전체 XML/ZIP 양 Python 모드·결과 변조 거부·재열기·undo/redo를 확인했습니다. 이후 숫자11.2→100 수정 시156.3으로 재계산되고 undo가 앞선 표시100/바깥 편집본을 복원하는 단언도 추가했습니다. 최신 집중1/1·exit0은1395.732875ms입니다.

수정 후보 `ca351f844db9535335578195370e81230e78a9b465d70c18c4ce9ed3bebf3b2e`는 ReleaseSafe5/5·exit0이며 `zig-out/manual-canvas-exterior-api/bin/hwpjs.wasm`입니다. 기본 작업 트리 WASM을 바꾼 것은 아닙니다.

## 묶음 검증 경계

앞선13c 후보의 등록29파일은85/86pass·1fail·exit1(148095.687958ms)이었습니다. 실패는 수식 결과를 항상 읽기 전용으로 기대한 기존 Canvas 회귀입니다. 기대값을 실제 선택적 export5개·결과 전체 범위와 대조하도록 보강했습니다. 후보13c의 집중5/5·exit0(26825.612625ms), 구형6e2의 같은5/5·exit0(17979.995916ms)을 확인해 이전 WASM에서는 보호 상태를 유지함을 검사했습니다. Git metadata를 누락한 중간 집중 실행의2실패는 인프라 오류이며 통과로 계산하지 않습니다.

ca 후보에서 HWP5 editor18파일+CFB6파일은359/359·fail/skip0·exit0(6721.123167ms)입니다. 등록 HWPX30파일 실행은87/87·fail/skip0·exit0(157473.210208ms)이지만 실행 시작 후 바깥 편집 회귀에 재계산 단언을 추가했으므로 최신 테스트 소스의 고정 snapshot gate로 주장하지 않습니다. 해당 단언의 집중 통과는 위에 별도 기록했습니다.

후속 소스 고정30파일 실행은87/87·fail/cancel/skip0·exit0(156101.129ms)입니다. src/js/web/preview/tools/tests/hwpx/build.zig의 실행 전후 해시는 `c9b8dbb342f416ad6d9ff3efb32c33393f2af0baac817e1b46047dc8c22ca589`로 같고 unchanged=true/code0/signalnull입니다. 로그는 `/tmp/hwpjs-manual-result-publication.ervxKq/manual-canvas-registered-30-frozen.log`입니다. 실행 종료 후 별도 머리말/꼬리말 테스트 할당자 scope를 바꿨으므로 그 후속 native 변경까지 이 snapshot으로 검증했다고 주장하지 않습니다.

전체 native·전체 참조 편집·물리 IME·전체 문서/조판 완료 또는 기본 제품 승격을 주장하지 않습니다.
