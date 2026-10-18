# HWPX prefix 입력의 원본 run 소속 검증

## 활성 분기 문단 번호와 원본 XML 순서

`issue2006/1790387_prep_final_report.hwpx`의 구역0·API 문단495를 재현했습니다. 원본 SHA256은 `c68baed24096386f9041930d24d39409b61ac99463bf04dfd242440dfdeb739f`입니다. API reader/editor는 selected-default 분기를 사용하지만 anchor oracle은 ElementTree의 모든 p를 세고 있었습니다. 실제 수정한 문단은 XML 원본496번째이고, 원본495번째는 바로 앞의 다른 그림 설명 문단입니다. 이 구역의 raw p2092개와 독립 selected2090개를 확인했고 게시 afb7 reader의 해당 구역 문단 수도2090으로 같았습니다. 파서가 엉뚱한 문단을 수정한 것으로 분류하지 않습니다.

기존 `hwpx_text_snapshot_order.py`의 엄격한 관측 branch 규칙을 ordered_children로 분리해 기존 event-order digest와 새 selected_paragraphs가 함께 사용합니다. 선택한 노드의 참조만 반환하고 XML을 삭제/정규화하지 않으므로 비활성 분기의 원문·주석도 저장 비교 대상입니다. hp:t 안의 p는 문단 번호에 넣지 않습니다. 관측 chart case/default·부모/순서/요구 namespace를 검증하고 처리하지 못한 분기를 raw로 되돌리거나 임의 선택하지 않습니다. anchor oracle의 API 좌표에만 이 매핑을 연결하며 다른 field oracle을 무조건 같은 선택 범위로 바꾸지 않았습니다.

actual report 회귀는 수정 전 complete XML mismatch로 실패했습니다. 이후 게시 afb7 후보에서 해당 API495 입력·전체 XML/비대상 payload normal/-O·잘못된496 좌표 거부·undo/redo·재열기/원본 불변이 통과했습니다. raw/default/chart의 독립 문단 순서와 event count 일치·주석/원본 불변 및 미지원 requirement/자식/부모3반례도 normal/-O로 검사합니다. 별도 module loader로 oracle을 읽는 기존 빈 run 회귀까지 유지했습니다.

eab38188에 이 수정만 더한 tree `bc8f170701940e1d1b8345c66293e5f0d1626830`의 `/tmp/hwpjs-selected-prefix-clean.WSV6QF`에서 게시 afb7 후보·Node24.20.0의 `selected-anchor-tests.log/.stderr`는4/4·fail/cancel/skip0·exit0·stderr0(7556ms)입니다. 공유 Section/master snapshot verifier의 기존 self-test도 Python normal/-O 네 실행 모두 exit0입니다. 같은 사본/f4e0 후보로 보고서 전체 전용 감사를 `issue2006-fixed.jsonl/.stderr`에서 시작했으며 최종 집계/종료 전에는 전체 문서 통과가 아닙니다. 기존 고정44파일 실패 행이나 최신 전체 gate 성공으로 소급하지 않습니다. 제품 파서·저장 로직과 기본 WASM/외부 데모는 변경하지 않았습니다.

## 텍스트 노드 없는 필드 소유 표 문단

`issue2813/dangjik_dutylog.hwpx`는 게시 검사기에서도 MissingIndependentFieldFragment로 재현됐습니다. 원본 SHA256은 `d785a49b62c43ed5b4602509657a112742d916782828022a355b916bcc19a4c5`이고 위치는 구역0·전체/로컬 문단141·beginElement1574·CLICK_HERE1918049232입니다. 원본 문단은 charPrIDRef14의 run 안45x11 표만 있고 직접 text가 없습니다. native 저장은 그 표 앞에 text를 추가했으나 독립 fragments는 text/빈 run만 수집해 바깥 문단을 누락했습니다. 표 안 셀의 text를 바깥 문단의 위치로 재사용하지 않습니다.

보존 개체 판정은 `hwpx_field_prefix_site.is_prefix_object`에 한 번만 두고 위치 선택과 field inventory가 공유합니다. fragments는 기존 text/빈 run 후보를 우선 유지한 뒤 누락 문단에만 run 직접 자식인 알려진 개체를 보충합니다. 개체 전용 후보는0위치 prefix 삽입만 허용하며, 알려지지 않은 제어에 막혀 검증된 삽입 위치를 얻지 못하면 거부합니다. 그래픽 내부 text를 기대값으로 만들거나 임의 객체/ctrl을 허용하지 않습니다. BOOKMARK 등 기존 adapter의 종류 선택은 유지합니다.

합성 원본의 바깥/안쪽 소속·기존 text 우선·잘못된 내부 삽입/서식/비대상 payload 거부·개체 전용 non-prefix/미지 제어 거부를 normal/-O로 검사합니다. 수정 전 Missing independent outer object paragraph를 재현했고 실제 당직일지 좌표도 독립 전체 XML/ZIP·잘못된 기대값 거부·undo/redo·재열기/원본 불변 회귀에 추가했습니다.

9a5e51ac에 이 수정만 더한 tree `405e40da5a0e86ee361d68cdbe62b32c2775e620`의 `/tmp/hwpjs-object-field-clean.HjnR9Z`에서 게시 afb7 후보·Node24.20.0의 `object-field-tests.log/.stderr`는5/5·fail/cancel/skip0·exit0·stderr0(3682ms)입니다. 같은 최종 사본과 f4e0 후보의 `issue2813-fixed.jsonl/.stderr`는 전체 전용237시도/237검증/독립 XML237(필드236)·거부0·exit0·stderr0입니다. 추가 거부 guard 전 사본의 통과는 `issue2813-initial-fixed`·`object-field-initial-tests`로 따로 보존했습니다. 기존 generic oracle 자체의 UTF16/범위/5변조 self-test도 normal/-O 양쪽 exit0이며, 사용자 미커밋 styled-run 삭제 모드는 커밋에서 제외했습니다. 이 결과를 전체 명령/조판/최신 전체 gate 완료나 원래 고정44파일 실패 행의 소급 성공으로 바꾸지 않습니다.

기존 pageNum 수정 사본 `/tmp/hwpjs-page-number-prefix-clean.1oFSzn`의 `remaining-documents.jsonl`도 issue2373/156689818_kftc_press.hwpx의46/46(필드37), issue2470/36382471_masked.hwpx의30/30(필드26)을 f4e0 후보에서 각각 전체 독립 XML·거부0·exit0/signal=null로 확인했습니다. 해당 ID의 `-current.jsonl/.stderr`가 근거이며, 이어진 당직일지는 MissingIndependentFieldFragment·exit1이었음을 그대로 보존합니다. 세 파일 wrapper의 exit1을 전체 성공으로 바꾸지 않고, 당직일지의 후속 수정 결과는 위 최종 사본과 구분합니다.

## pageNum 설정 뒤 표 앞 입력

고정44파일 감사의 `issue2083_hide_fill_page.hwpx` 실패를 게시 검사기에서도 재현했습니다. 원본 SHA256은 `7758c15c57b1ef14fda6e6d29409ae3425f344931f2901641af84a40ef413d2e`이고 실패 위치는 구역2·전체 문단121/로컬1·beginElement32·beginId2012463474입니다. 원본은 fieldBegin 뒤 pageNum 설정2개·표·빈 text 순서이며 저장본은 두 설정을 유지하고 같은 run의 표 바로 앞에 text만 추가했습니다. 기존 독립 선택기는 pageNum을 모르는 ctrl로 보고 표 뒤 text를 기대한 것이 원인입니다. 제품 편집/저장은 변경하지 않습니다.

`hwpx_field_prefix_site.py`의 알려진0폭 설정 목록에 정확한 paragraph namespace의 pageNum만 추가했습니다. autoNum은 계속 보존 개체이며, 외래 pageNum과 pageNum+미지 제어를 섞은 ctrl은 건너뛰지 않는 음성 대조를 추가했습니다. 기존21경계에 쪽 번호1/2개와 두 거부 경계를 더한25개 합성(normal/-O)은 수정 전 Incorrect source prefix site를 재현했고 수정 후 통과했습니다. 실제 원본 좌표도 기존 full XML/ZIP·틀린 기대값 거부·undo/redo·재열기·원본 불변 회귀에 추가했습니다.

3ef0d41e에 이 변경만 더한 tree `099840967ad4d8bd13cd024c5a7034483ce08876`의 `/tmp/hwpjs-page-number-prefix-clean.1oFSzn`에서 f4e0 후보의 해당 원본 전체 전용 감사는77시도/77검증/독립 XML77(필드72)·거부0·exit0·stderr0입니다(`issue2083-fixed.jsonl/.stderr`). 원래 실패는 게시 검사 사본의 `issue2083-specialized.jsonl/.stderr`·`issue2083-repro.json/.log`에 보존합니다. 같은 수정 사본의 게시 afb7 후보·Node24.20.0 집중 회귀도4/4·fail/cancel/skip0·exit0·stderr0(2978ms)입니다(`page-number-tests.log/.stderr`). 고정44파일의 실패 행을 소급 수정하지 않고 전체 명령/조판 또는 최신 전체 gate 완료와 구분합니다.

## 전용 감사의 WASM 무결성

`hwpx-specialized-input-audit.mjs`는 시작에 읽은 WASM을 기존 `audit-input-identity.mjs`로 고정하고 각 파일 시작과 최종 성공 집계 직전에 메모리/파일 바이트를 재확인합니다. 원본 입력 무결성과 별개이며 변경된 산출물 경로에 성공 집계를 붙이지 않습니다. `manual-result-corpus-audit.test.mjs`의 기존 사본 교체 음성 대조를 매개화해 수동 결과/전용 감사 모두 실제 자식 프로세스의 start 이후 WASM 사본을 교체하고 exit1·성공 집계 부재를 확인합니다. 제품 WASM이나 원본 fixture는 수정하지 않습니다.

main a19c3bf7에 이 검사/회귀만 추가한 tree `45079ca24d0d7d97d9d358a5799d308d17177a26`의 `/tmp/hwpjs-specialized-artifact-clean.cP2UTC`에서 게시 afb7 후보·Node24.20.0으로 기존 identity 검사와 교체 대조 3/3·fail/cancel/skip0·exit0입니다. 같은 사본의 정상 대조 `issue1893_clickhere_field_roundtrip.hwpx` 전체 전용 감사도 9시도/9검증/독립 XML9(필드6)·거부0·exit0입니다. 이 보강은 감사의 증거 결합이며 새 제품 편집 기능이나 실행 중인 고정44파일 감사 결과의 소급 변경이 아닙니다.

## 실제 실패와 원인

참조 `hwpx_sample2.hwpx`의 구역0·문단1은 section/column metadata run 뒤에 charPrIDRef67인 빈 run, pageNum/newNum metadata run, charPrIDRef32의 표 run이 있습니다. 원래 표시 문자열은 객체 표식 하나입니다. 후보 `f4e0f396a3fea6e6354b364ff176e31d72ed00ec643fa566c4abbd8bc2f58d77`의 위치0 prefix는 기존 빈 run을 채우고 해당 charPrIDRef67을 유지했습니다. 이전 anchor oracle은 자식이 없는 run을 순회에서 누락하여 표 run에 텍스트를 넣은 기대 XML을 만들었고 `complete XML mismatch`로 실패했습니다.

독립 검사의 source 선택을 보정한 것이며 새 파서/저장 기능 구현이나 포맷 명세 누락 발견으로 세지 않습니다. 제품 코드를 변경하거나 서로 다른 run 소속을 같은 것으로 정규화하지 않습니다. 원본의 직접 run 순서에서 metadata를 제외한 첫 내용/빈 run의 위치를 독립 XML로 선택하며 빈 run에 직접 문자 데이터가 있으면 모호한 원본으로 거부합니다. 빈 run의 원래 속성·다른 run·표·metadata·전체 비대상 ZIP payload를 계속 대조합니다.

## 적대적 회귀

필드 라벨의 별도 source-site 선택은 `tools/hwpx_field_prefix_site.py`가 소유합니다. 실제 공문36382669의 구역2·전역114/로컬1은 metadata/fieldBegin run 뒤 다른 run의 표 앞에 입력합니다.36385226의 구역0·문단74는 fieldBegin이 이전 문단에 있고 타원 개체 앞에 입력합니다. 이전 검사는 첫 run의 첫 자식과 tbl/pic/container만 보아 각각 표 뒤 빈 text와 타원 뒤 text를 수정한 기대 XML을 만들었습니다. 고정44파일 감사의 해당 XML 불일치는 보존하며 이 두 집중 재현을 파일 전체 통과로 바꾸지 않습니다.

필드 검사기는 직접 run 순서를 따르되 알려진0폭 metadata만 건너뛰고 tbl/pic/container/관측 ellipse 앞의 같은 run 안에 text를 기대합니다. 기존 text/빈 run·주석/알 수 없는 제어와 외래 namespace를 임의로 건너뛰지 않으며 객체가 선택 필드 밖이면 거부합니다. 제품 native 저장 코드는 변경하지 않습니다. `field-prefix-oracle-routing.test.mjs`의 normal/-O 합성15경계와 실제 두 공문의 정상/틀린 기대값·전체 XML/ZIP·undo/redo·재열기·원본 불변 검사가 이 계약을 확인합니다.

게시24af820d에 이 보정만 추가한 Git tree의 JS/도구/테스트와 실제 원본3개를 `/tmp/hwpjs-field-prefix-clean.lTDPCg`에 추출했습니다. 게시 Zig0.17 후보 `afb7fdfbbc8a9c9cc45a7cdb98ade6be7a6a88b1943e1c5354c63d6715b9e05e`를 명시한4/4·fail/cancel/skip0·exit0(1365ms)이며 aift MEMO 선택·합성15경계와 실제 두 공문 집중 저장 검사를 포함합니다. 같은 사본의 기존 generic field oracle 자체 검사도 normal/-O 양쪽 exit0입니다. 작업 트리의 미커밋 generic field oracle 변경에 의존하지 않으며 공문 전체 전용 감사나44파일의 최종 결과를 대체하지 않습니다.

후속36392900의 문단90도 실제 원문/저장으로 재현했습니다. 첫 run은0폭 ctrl이고 다음 run에 line/container/rect/pic 등14개 원본 개체가 있습니다. 제품은 첫 line 앞에 text를 삽입했지만 검사기는 line을 알지 못해 뒤 빈 text를 기대했습니다. 앞의 보정만 있는 사본의 `36392900-specialized.jsonl/.stderr`는 계속 XML 불일치·exit1이므로 해결로 계수하지 않았습니다. line을 포함하는 회귀를 먼저 추가해 `Incorrect source prefix site` 실패를 확인한 뒤 독립 선택기에 관측 line을 추가했습니다. 원본 개체의 재배치·일반 정규화는 허용하지 않습니다.

게시bf296cb3에 line 보정과 회귀만 추가한 `/tmp/hwpjs-field-line-clean.Yip6Fs`에서 Node24.20.0·게시 afb7 후보의4/4·fail/cancel/skip0·exit0(1754ms)을 확인했습니다. 합성 경계는17종(normal/-O), 실제 저장 원본은 세 공문입니다. 같은 분리 소스와 고정 f4e0 후보로36392900 전체 전용 prefix 감사를 재실행한 `36392900-specialized.jsonl/.stderr`는77시도/77검증/독립 XML77(필드74)·거부0·exit0·stderr0입니다. 후보가 다른 두 실행의 성공 수를 합산하지 않으며, 고정44파일 원래 실패 기록이나 모든 명령/조판 완료를 대체하지 않습니다.

36382669의 전체 전용 재검사에서는 문단121(로컬8)의 단일 ctrl/autoNum PAGE 앞 입력, 이어 문단129(로컬16)의 rect 앞 입력도 검사기 목록에 없었습니다. 각각 실제 원본/저장으로 재현했고 자동번호 합성 경계는 수정 전 `Incorrect source prefix site`로 실패했습니다. 자동번호를0폭 metadata로 건너뛰지 않고 하나의 보존 개체로 취급하며, rect도 다른 그래픽처럼 정확히 앞에 삽입합니다. 혼합/알 수 없는 ctrl은 계속 일반 통과시키지 않습니다. 중간 전체 감사 두 실패 로그는 `/tmp/hwpjs-field-line-clean.Yip6Fs/36382669-specialized.*`와 `/tmp/hwpjs-field-number-clean.9bILkA/36382669-specialized.*`입니다.

67561bd7에 자동번호/rect 보정만 추가한 `/tmp/hwpjs-field-number-final.MxG471`에서 Node24.20.0·f4e0 후보의 실제36382669 전체 전용 감사는127/127·독립 XML127(필드122),36385226은58/58·독립 XML58(필드54)로 각각거부0·exit0·signal=null·stderr0입니다. 상세는 각 ID의 `-specialized.jsonl/.stderr`가 소유합니다. 같은 분리 소스의 게시 afb7 후보 회귀는4/4·fail/cancel/skip0·exit0(2528ms)이며 normal/-O 합성21경계와 실제 세 공문의5좌표 저장/잘못된 기대값 거부/이력/재열기를 포함합니다. 이 후속 결과를 고정44파일 감사의 실패 행에 덮어쓰거나 전체 파서·모든 명령·브라우저 완료로 해석하지 않습니다.

별도 `anchor-empty-run-oracle.py`는 합성 원본에서 정상 빈 run prefix 하나를 허용하고 다른 run으로 이동·소유 run의 스타일 변경·metadata 변경·문자 데이터가 있는 모호한 빈 run 네 반례를 거부합니다. Python normal/-O 양쪽에서 실행합니다. 실제 원본 검사도 전체 XML·ZIP 대조 뒤 잘못된 run/스타일/metadata 세 변조를 양쪽 모드에서 거부합니다. 세 변조의 제품 표시 문자열이 정상 저장과 같다는 점도 확인하여 텍스트 projection만으로 서식 소속을 증명하지 못함을 검사합니다. 실제 undo 원본/redo 저장 바이트 일치·저장 재열기/무변경 save·원본 파일 불변도 확인합니다.

새 두 검사는 정규 HWPX gate에 등록하며 기존 미커밋 specialized-prefix-oracle 테스트를 커밋에 포함하지 않습니다. 명령은 [개발·검증 명령](development-commands.md)이 소유합니다. 전체 native·모든 명령/위치·실제 브라우저/원본 조판 동치의 검증은 아닙니다.

## 실행 기록

`/tmp/hwpjs-zig017-current-fixtures.xouwd1/sample2-specialized.jsonl/.stderr`는 수정 전 문단1에서 exit1입니다. 후속 새 회귀 `empty-run-oracle-final-tests.log/.stderr`는2/2·fail/cancel/skip0·exit0·stderr0입니다. 초기 회귀 도구의 ZipInfo 재사용에 따른 BadZipFile은 copy.copy로 수정했고, 변조 archive JSON이 기본 stdout 상한을 넘은 ENOBUFS는 해당 호출의 8MiB 상한으로 재실행했습니다. 이 두 도구 실패를 제품 실패로 판단하거나 최종 통과로 덮어쓰지 않습니다.

`sample2-specialized-fixed.jsonl/.stderr`는 같은 원본 전체 전용 입력89시도/89검증/독립 XML89·거부0·exit0·stderr0입니다. 기존 원본/전체 XML·ZIP·별도 편집기 재열기/이력 검사를 유지합니다. 기존 metadata/object 원본 회귀까지 합친 `empty-run-combined-tests.log/.stderr`는3/3·fail/cancel/skip0·exit0·stderr0입니다.

옛 실패 원본 `issue6298/copay_cap_tac_table_leading.hwpx`도 `issue6298-specialized.jsonl/.stderr`에서31시도/26검증/독립 XML26·UnsupportedFieldLabelRange5거부·exit0·stderr0입니다. 남은 문단83/534/536/699/701의 `manualFormulaResultTargets`가 각각 하나 반환되는 것까지 확인했지만 이 실행에서 수동 결과를 실제 편집한 것은 아니므로26개 성공에 합산하지 않습니다.

커밋용 별도 인덱스의 코드만 추출한 `/tmp/hwpjs-empty-run-clean.Oe5FYb`에서도 실제 sample2를 복사하고 main Zig0.17 WASM `afb7fdfbbc8a9c9cc45a7cdb98ade6be7a6a88b1943e1c5354c63d6715b9e05e`를 명시해2/2·fail/cancel/skip0·exit0·stderr0입니다. 제품/미커밋 후보를 구분하며 이 검사 보정을 파서 지원률 증가로 계수하지 않습니다.

보정 뒤 추적 HWPX 전용 경로 전체를 다시 실행한 `empty-run-tracked-specialized.jsonl/.stderr`도46경로·암호1·165시도/152검증/독립 XML152(필드6)·계산 결과13거부·exit0·stderr0으로 이전 분모/성공/거부가 유지됐습니다. 참조 전체975개 편집 재검사나 모든 입력 위치의 증거는 아닙니다.
