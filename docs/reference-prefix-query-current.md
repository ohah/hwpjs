# 최신 참조 텍스트 읽기·입력 경로 조사

메모 라벨 구현 계약과 본 코드 반영 후 검증은 [HWPX 메모 표시 라벨 편집](hwpx-memo-label-edit.md)을 따릅니다. 아래 실험 기록은 당시의 상태이며 기본 WASM/데모 승격을 뜻하지 않습니다.

## 2026-10-18 누름틀 보존 후보의 부분 진단과 재실행

같은 후보의 감시 재실행(handle8195)은 최종439경로 summary와 child code1/signalnull까지 기록했습니다. 실제 HWPX432문서·213,765문단은 plain193,416/anchored15,712/field4,570·거부67로 합계가 맞고, 다른 signature6개와 암호화 file_refused1개를 분리합니다. 거부 때문에 규정상 exit1이며 이 재실행은 요약 없이 끝난 최초 실행과 다릅니다. protection-reference-supervised.stdout/.jsonl이 근거이고 stderr는 비어 있습니다. 원본/산출물 해시와 조회 후 무변경 저장 대조이며 경로 성공213,698개를 실제 편집/브라우저/조판 성공으로 계산하지 않습니다.

6ddc76ab71dc09a77acf0b57b7ec78b2cc137850189e136fb361edd5d71d0437 후보의 최초 prefix 조회는439경로 중369개 file 행을 남긴 뒤 handle89363 exit1로 종료했습니다. 최종 summary와 stderr가 없어 전체 완료나 특정 파서 결함으로 확정하지 않습니다. 다음 대상 task2070/hy_ladder4.hwpx를 포함한 해당 디렉터리2개·38문단의 독립 재실행은 plain36/anchored2·거부0·exit0이었습니다. 같은 후보의 전체 재실행은 별도 run-reference-query.mjs가 종료 code/signal·여유 공간·stdout/stderr를 protection-reference-supervised.jsonl/.stdout/.stderr에 기록하며 실행 중입니다.

최초 부분 로그의 거부66곳을 입력 해시 확인 뒤 ZIP/XML의 가장 가까운 원본 p 소속과 대조했습니다. 직접 fieldBegin 기준 FORMULA35·MEMO2·CLICK_HERE5·직접 fieldBegin 없음24입니다(protection-prefix-refusal-xml.json, /tmp/hwpjs-click-retention.Vm3dFy). 직접 필드가 없다는 사실로 해당 문단에 활성 필드가 없다고 추정하지 않습니다. FORMULA나 미닫힘/소속 범위를 일괄 읽기 오류로 분류하지 않으며, 이 분류는 실제 편집 검증도 전체439개 결과도 아닙니다.

aift.hwpx의 구역2 localParagraph2694/2697 MEMO는 editable=1이지만 parameters와 주석 본문 subList를 포함합니다. 현행 field_text_kind의 삼종 지원과 field_label_session의 subList 거부로 일반 라벨/접두사 경로가 열리지 않습니다. 허용 문자열만 추가하면 필드 구조 분할·병합까지 범위가 바뀔 수 있으므로, 후속 구현은 표시 라벨과 주석 본문의 소유권·보존·현재값을 분리하고 실제 XML/원본 메타데이터/저장 재열기로 검증해야 합니다. 이 기록은 MEMO 편집 지원 완료가 아닙니다.

별도 /tmp/hwpjs-memo-label-probe.GvEcmM에서 단일 source MEMO 라벨만 허용하는 실험을 시작했습니다. 기존 삼종 구조 허용 목록은 그대로 두고 source 위치/명시 editable=1/parameters1/subList1/미지 metadata 없음 조건을 라벨 전용 정책으로 분리합니다. 생성/구조 변경 상태·중첩 MEMO를 허용하지 않습니다. 합성 입력의 기존 라벨 수0 거부를 먼저 재현한 뒤, 합성 라벨/정책 반례와 실제 aift 구역2의 전역문단3008/3011 입력·저장 재열기·현재 폭 증가·각 fieldBegin 전체 주석/작성자 subtree byte-exact·무변경 재저장을 확인했습니다. 이3개는 실험 코드 결과이며 main API/UI 지원으로 승격하지 않았습니다.

실제 파일을 std.testing.allocator로 수행한 memo-actual-safe.log는3/3·exit0이었지만 RSS12,752,608KiB가 관측됐습니다. 종료 요청 때는 이미 정상 종료해 no such process였으므로 강제 중단했다고 기록하지 않습니다. 공통 checked_allocator.run으로 같은 실제 검사와 전체 누수 검사를 분리한483939aef53c045644d5f4fc71fbc3af7e26fb68000014179a37df9d031f7771의 memo-checked-guard.jsonl은3/3·fail/skip/log/leak0·exit0·guardStopped=false·관측 footprint peak85,443,016바이트입니다. 원래 RSS 표본은 peak footprint와 다른 지표이며 제품 메모리 절감으로 해석하지 않습니다. 별도 WASM/독립 전체 XML·ZIP/실제 Worker·브라우저·할당 실패 전수는 후속 검증입니다.

실험 제품 WASM00c5b853a09447c452061f112d3ef09ef156dbc855de66edc279c70712f94d2e는 ReleaseSafe 빌드5/5·exit0입니다(memo-product-build.log). 6dd와 export334개의 이름·종류가 같고 추가/누락은 없습니다. signature/동작 전체 동치나 공개 JS·독립 XML·브라우저 검사를 대신하지 않으며 원본 기본 WASM/외부 데모는 교체하지 않았습니다.

같은 실험 제품의 공개 JS/독립 XML·ZIP 대조는 실제2곳에서2/2·fail/cancel/skip0입니다(memo-api-oracle.log). Python 일반/-O 양쪽에서 선택 라벨과 dirty 외 전체 XML·주석/작성자·비대상 파트·ZIP 메타데이터를 검사하며, 주석/작성자/다른 파트 변조·무시된 입력 반례도 oracle이 거부합니다. memo-api-scope-negative.log는 읽기 전용/editable 누락/미지 속성/미지 자식/parameters 누락/subList 중복/미닫힘/중첩 BOOKMARK의8종 반례에서 라벨 미허용·강제 명령 거부·원본/대기 redo 보존을1/1로 확인했습니다. memo-combined-current.log는 주석 본문과 표시 라벨을 연속 편집한 뒤 각각 독립 XML·저장값·두 단계 undo/redo를1/1로 확인해 원본 subtree 캐시가 현재 주석을 덮어쓰지 않음을 검사했습니다.

기존 필드27/27·skip0 회귀(memo-field-regressions.log), 합성 MEMO의 전체 부분 할당 실패·실제 원본·정책 반례 Safe/Debug 각각3/3·skip/log/leak0·exit0도 통과했습니다. Safe664be5ac의 관측 peak84,738,480바이트, Debugd05d05e6는84,804,040바이트이며 memo-oom-guard.jsonl·memo-debug-guard.jsonl을 따릅니다. memo-worker.log는 실제 WASM/Worker·모의 DOM/Canvas에서 구역2 전역 문단3008의 명시적 구간/권한 조회·입력·독립 XML·ZIP·이력을1/1·295944.722125ms로 확인했습니다. 약5분 소요와 실제 Chromium/OS 입력 미검증은 남은 제한입니다. 읽기975개 최종 대조와 앞선 불완전919개 출력의 구분은 [감사 출력 무결성](audit-output-integrity.md)을 따릅니다. 이 실험 소스는 아직 main 구현/기본 데모로 반영하지 않았습니다.

## 고정 후보와 범위

후보 WASM SHA256 `100483796a4f80452e96cc5761f7949da13f35e0cdcf8f4e9d5d7824c2bd2a9a`, 명시적 root `reference/rhwp/samples`를 사용했습니다. source/제품 승격 완료가 아니며 조사 중 저장이나 입력 파일 수정은 하지 않습니다.

`reference-parser-audit.mjs`의975개 경로 중 HWP3 signature26개를 제외한 HWP5/HWPX949개에서 HWP5 509/HWPX435개, 합계944개 텍스트 읽기를 확인했습니다. 문단 합계690,523개입니다. 암호화 거부2개와 HWP5 SectionCountMismatch3개를 성공으로 계산하지 않습니다. 이 도구의 exit0은 census 출력 완료이며 전체 파서 필드/편집 지원 완료 gate가 아닙니다. 로그는 `zig-out/verification/picture-owner-prefix-corpus/parser-reader.log`입니다.

## HWPX prefix 경로

`node tools/reference-hwpx-prefix-query-audit.mjs --wasm=/absolute/candidate/hwpjs.wasm --root=reference/rhwp/samples`는439개 .hwpx 경로를 모두 조사했습니다. 실제 signature가 HWP5인6개는 다른 포맷으로 분리했고 암호화 HWPX1개는 file_refused입니다. 나머지432개 문서213,765개 문단은 plain193,402/anchored15,709/field4,567·거부87개로 합계가 일치합니다.87개는 모두 UnsupportedFieldLabelRange이며 도구는 exit1입니다. 로그는 `zig-out/verification/picture-owner-prefix-corpus/full-query.log`입니다.

이전 e64 후보의 같은213,765문단 조회 거부3,965개보다 줄었지만 새 성공 경로 전체를 실제 편집한 결과는 아닙니다. source 문서·WASM 파일/메모리 hash 및 query 후 save 원문 byte-exact를 검사했습니다. 실패 assertion은 파일 거부로 낮추지 않고 실행을 중단합니다. 알려진 orphan 보호27개, 루트 orphan 및 FORMULA 결과 같은 의미 보호와 다른 미지원 내용을 후속 분류해야 합니다.

CLI 경계 회귀2/2 exit0에서 필수 scope/중복/알 수 없는 옵션의 사전 거부와 실제 정상 HWPX·확장자 HWPX인 HWP5·손상 파일을 함께 검사했습니다. 다른 포맷/손상 파일이 query 성공 수로 합쳐지지 않으며 거부가 있으면 exit1입니다.

## HWP5 구역 불일치의 원문 증거

원본 CFB의 DocInfo 첫 DOCUMENT_PROPERTIES(tag16)에서 version과 UINT16 구역 개수를 직접 읽고 모든 Section 디렉터리 항목을 대조했습니다.

| 원본 | 버전 | 선언 구역 | 실제 Section 스트림 |
| --- | --- | ---: | --- |
| issue5715/float_chart_ghost_ladder_gap.hwp | 5.0.0.6 | 2 | Section0 |
| issue5802/hf_cross_section_inherit.hwp | 5.0.2.4 | 11 | Section0, Section1 |
| issue5828/landscape_rowbreak_bleed.hwp | 5.0.3.0 | 4 | Section0 |

모든 디렉터리 항목에서도 추가 Section 이름은 없었습니다. 명세의 문서 속성 UINT16 구역 개수와 BodyText/Section%d 관계 및 현재 text_source의 선언/실제 검사에 일치하는 거부입니다. 경로 필터만으로 누락됐다고 단정하거나 자동으로 선언값을 덮어쓰지 않습니다. 어느 쪽이 제작 과정에서 잘못됐는지, 한글에서 어떤 관측 호환성으로 여는지는 후속 확인입니다. 첫 파일의 strict CFB 검사는 InvalidFat도 반환했으며 위 목록은 기존 비엄격 CFB 읽기 진단입니다.

형광펜 원본의 잔여32/119/192번은 run 직접 markpenBegin 뒤의 표와 t 내부 markpenEnd,1949번은 run 직접 markpenBegin과 필드입니다. 기존 t 내부 leaf 보존과 다른 run-level 관측 확장이므로 다음 구현에서 삽입 affinity·앵커 폭·원문 보존을 함께 검증합니다.
