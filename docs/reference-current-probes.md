# 대형 참조 문서의 현재 편집 표본

2026-10-11 게시97cb3335 소스 산출물 SHA256 `5d6006852fc4f8997f4efcf076a858e624cd0ba4e9087943284fda18e7c01bea`로 `reference/rhwp/samples/2025 행정업무운영 편람(최종).hwpx`의 과거 전용 입력 거부 표본을 다시 확인했습니다. 원본 파일을 수정하지 않았습니다.

이전317b0eff 산출물의 `/tmp/hwpjs-large-reference-specialized-route-fixed.log`는 전용589시도/513검증/76거부를 기록합니다. 그 거부 수를 현재 미지원 수로 소급하지 않습니다. 현재 section0/paragraph1·3, section1/paragraph115는 일반 입력 가능, section1/paragraph108은 일반 입력 불가지만 anchorText가 객체 표식1개를 반환합니다. 네 곳 모두 기존 insertPrefix 경로의 `검증😀` 입력·저장본 텍스트 projection·undo 원본 byte-exact·redo 저장 byte-exact·재열기 재저장을 통과했습니다(실행 exit0). 공개 API 표본이며 독립 전체 XML/ZIP·Canvas 전수 검사나76곳 전체 재감사 완료는 아닙니다.

이력은 maxEntries8/maxCheckpointBytes16MiB입니다. 처음8×64MiB 설정은 ABI 총128MiB 한도로 enable 단계에서 LimitExceeded였고, 이를 문단 편집 실패나 한도 해제 근거로 계수하지 않았습니다. 한도를 바꾸지 않고 기존 감사 설정으로 검증했습니다. 이전439참조 root 감사는 다른 산출물/실행이며 현재 결과와 합산하지 않습니다.

## 필드 종류와 실행 상태 재확인

2026-10-11 원본 ZIP의 모든 `Contents/section*.xml`을 Python 표준 라이브러리 `zipfile`·`ElementTree`로 직접 순회하여 paragraph namespace의 `fieldBegin/@type`을 셌습니다. `HYPERLINK`14개, `CLICK_HERE`1개이며 다른 종류나 type 부재는 없었습니다. 두 종류 모두 `src/hwpx/field_text_kind.zig`의 지원 목록에 있습니다. 이 결과는 필드 종류 inventory이지 각 필드의 편집 적격성 증명이 아닙니다. 남은 거부는 마커 연결·중첩·문단 범위·소유권과 실제 명령 결과를 조사해야 하며, 이 근거만으로 제한을 해제하지 않습니다.

같은5d600685 산출물의 대형 문서 일반 입력/이력 감사와 전용 입력 감사는 관측 시점에 PID48386·48485가 각각 약28분 실행 중이었고 CPU 사용도 확인했습니다. 두 JSONL은 시작 레코드만 있어 완료 집계는 아직 없습니다. 출력이 없다는 이유로 재시작하거나 완료로 계수하지 않습니다.

별도 과거 native binary SHA256 `f082903941fbc1dd694d7f49936575476eb7472b8ac367719536d9c3b629548a`의3838테스트 실행은 세션 결과에서 `NativeRunnerClosed: code=null signal=SIGKILL`로 종료됨을 확인했습니다. 마지막 JSONL 성공 결과는3490번이며3491번 `field source merge plan allocation failures preserve cross-paragraph Unicode source`는 시작만 기록되었습니다. wrapper의 `completed:3491`은 마지막 테스트의 성공 증거가 아니므로 전체 통과로 해석하지 않습니다. SIGKILL 원인은 아직 확인되지 않았으며 제품 오류·메모리 부족·사용자 종료 중 어느 것으로도 단정하지 않습니다. 이 binary는 현재 기본 WASM의 최신 소스 검증도 아닙니다.

## 전용 감사의 거부 후 이력 검증

중단된 native 테스트의 후속 분리 재현·trace 설정 대조·수정 실측은 [필드 병합 할당 실패 감사](field-merge-failure-audit.md)가 소유합니다. 위 SIGKILL 미확정 기록과 최신 분리 테스트 통과는 다른 실행입니다.

`tools/hwpx-specialized-input-audit.mjs`의 거부 경로는 저장 원문만 비교하던 검사를 보완했습니다. `hwpx-refusal-history.mjs`가 revision 불변·빈 undo·기존 redo 유무·redo 저장 바이트·다시 undo한 원문/revision을 검사합니다. 거부 종류 판정은 기존 감사가 계속 소유하며 이 helper는 지원 범위를 완화하지 않습니다. 성공한 직전 체크포인트는 복사해 보관합니다.

`node --test tests/hwpx/refusal-history.test.mjs`는 빈/기존 redo 정상 경로와 revision·원문·undo·redo 유무·redo 체크포인트·복원 revision의6개 변조를 모두 확인했습니다(2/2, skip0). 기본 WASM SHA256 `fe97aa698bcc1cdfef9bc75f3fcafc4941a3c0069724bc700f0a62923c48fc20`의 실제 `chart.hwpx`17시도는4입력/독립 XML 검증과13계산 결과 필드 거부를 통과했고, `hyperlink.hwpx`4시도는4필드 입력/독립 XML 검증을 통과했습니다. 두 실행 모두 exit0이며 저장 재열기·undo/redo 검사를 유지합니다. chart의13거부는 결과 필드의 직접 prefix 거부이지 수식 정의 명령 미지원 판정이 아닙니다. 이미 실행 중인 대형 감사에는 이 소스 변경을 소급하지 않습니다.

## 대형 문서 전용 입력 감사 완료

후속 `/tmp/hwpjs-main-extrema-large-specialized-20261011.jsonl`과 실행 세션의 exit0을 확인했습니다. 고정5d600685 산출물의 실제 행정업무 편람 한 파일에서522시도/522입력·독립 XML 검증, 이 중 필드 전용 XML7개이며 거부0입니다. 저장본 텍스트·저장 재열기·undo 원문 byte-exact·redo 저장본 byte-exact·최종 undo를 유지했고 Python 일반/최적화 모드를 실행했습니다. 원본 파일은 수정하지 않았습니다.

이 실행은 일반 또는 필드 바깥 prefix가 가능한 문단을 제외한 전용 경로의 보완 감사입니다. 기존317b0eff의589시도/76거부와 현재522시도의 대상을 동일한 집합으로 가정하지 않습니다. 전체 일반 문단 감사는 관측 시점에 PID48386으로 계속 실행 중이므로 두 경로를 합쳐 문서 전체 완료로 주장하지 않습니다. 현재 기본fe97 산출물로 다시 실행한 검사도 아니며, 이후 추가한 거부 후 revision/redo helper는 이미 시작한 실행에 소급되지 않았습니다(이번 집계에는 거부가 없습니다).
