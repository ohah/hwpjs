# HWPX prefix 입력의 원본 run 소속 검증

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
