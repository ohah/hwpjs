# 현재 원본 조회의 보존 정책

## 계약

HWP5 편집 세션에서 선택한 관측 테이블 zone-count 부재 정책을 typed 현재 원본 조회에도 유지한다. `hwp5/edit/source_tree.zig`가 이 읽기를 소유하고 각 표·셀·그림·도형·페이지 조회와 현재 원본 patch는 이 공통 경로를 사용한다. strict 문서 검증의 `body.Tree.parse`는 바꾸지 않는다. 일부 count 바이트만 남은 입력을 완전한 부재로 처리하지 않는다.

명시적 `retainObservedDocInfo` 모드는 원본 caret·짧은 font type·style character·char-shape tail·fill additional의 관측 부재/미해석 상태를 진단하고 원본을 보존한다. 리소스 개수 불일치는 숨기지 않으며 모든 mapping 음수는 거부한다. 기본 열기와 별도 CFB 정규화 동의는 유지한다. 새 열기의 실패는 기존 세션·이력·진단·저장 기준을 교체하지 않는다. JS 옵션은 [관측 DocInfo API](hwp5-observed-docinfo-api.md)를 따른다.

HWPX 페이지 영역 선언의 현재 좌표는 기존 필드 소유권 검증과 field-owned positions를 재사용한다. 필드가 있는 문단을 일반 편집 가능 문단으로 승격하지 않는다. 쿼리용 임시 할당은 요청 allocator에서 정리하며 실제 세션의 원본·필드 상태를 수정하지 않는다.

## 고정 검증

검증 tree `3d82fafac298efbfd5386b7c38e81b1f2df878af`의 무필터 ReleaseSafe native 검사는 7/7 단계 성공, 4,182 pass·1 skip·종료 0이다. 본체 4,173 pass/1 skip과 보조 target 9 pass를 합한 값이며 skip을 성공으로 더하지 않는다. `/tmp/hwpjs-native-query-publish.CZlY5I/native-query-final.scope.json`/`.log`/`.result.json`이 근거다. 앞선 실패 주입 backing의 NondeterministicMemoryUsage 실패 로그는 유지하고 소급 성공으로 바꾸지 않았다. 후속 실행은 callback이 소유/정리하는 할당에 기존 deterministic 검사 backing을 사용했다.

게시 사본 `/tmp/hwpjs-native-verified-publish.0BG2wj`의 전체 `src` Git tree는 `04812fa6e233d9e580906b673e59f3033ca99688`로 검증 tree의 `src`와 정확히 같다. 최신 main의 JS를 사용하며 새 OLE·선두 페이지 번호·각주/SQUARE 통합 후보는 포함하지 않는다.

게시 전 `zig fmt --check`는 style_preservation의 기존 enum 변환 두 곳을 지적했다. 포맷터의 `@intFromEnum`→`@backingInt` 정리만 반영한 최종 `src` tree는 `aed1b10a98571dd3ce2e7a1d0fd681ed7f8de3c9`다. 원래 고정 소스와 동일하다는 앞 문단은 포맷 정리 전 대조 결과다. 변경한 Zig 75파일의 fmt 검사가 통과했고 최종 소스 ReleaseSafe 제품 빌드도 5/5·종료 0이다. 최종 WASM `0b28f171d1f3df0b17a07443e485c3c1aa886395159daf6b2758954b38539976`은 기존 8815 후보와 모든 실행 section이 바이트 동일하다. DWARF/선택 name section은 동일성 범위에서 제외한다. 이를 최종 포맷 소스의 새 native 전수 실행이라고 주장하지 않는다.

제품 WASM `8815a8e1f45ffadbc55a82b2f36fab45b5a270172d2eed7a2ecb1c4e56b4023b`와 기존 기본 WASM을 명시한 게시 사본의 공개/Worker 4파일 검사는 6/6·skip 0이다. 빈 표 셀 4문단의 scalar 경계 삽입/치환/삭제 64거래·독립 레코드·저장 재열기·이력·redo 보존, DocInfo 실패 열기 원자성·옵션/wire·구 ABI 거부, 실제 hyperlink 문단의 머리말 선언/필드 편집·독립 XML/ZIP 일반/최적화·잘못된 표식 거부·Worker 재열기를 포함한다.

이 검증은 모든 객체 편집·원본 한글 조판·생략 없는 native 전수 또는 기본 데모의 산출물 교체 완료가 아니다. 소스 게시와 데모 WASM 배포는 구분한다.
