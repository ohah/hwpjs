# 대형 참조 문서의 현재 편집 표본

2026-10-11 게시97cb3335 소스 산출물 SHA256 `5d6006852fc4f8997f4efcf076a858e624cd0ba4e9087943284fda18e7c01bea`로 `reference/rhwp/samples/2025 행정업무운영 편람(최종).hwpx`의 과거 전용 입력 거부 표본을 다시 확인했습니다. 원본 파일을 수정하지 않았습니다.

이전317b0eff 산출물의 `/tmp/hwpjs-large-reference-specialized-route-fixed.log`는 전용589시도/513검증/76거부를 기록합니다. 그 거부 수를 현재 미지원 수로 소급하지 않습니다. 현재 section0/paragraph1·3, section1/paragraph115는 일반 입력 가능, section1/paragraph108은 일반 입력 불가지만 anchorText가 객체 표식1개를 반환합니다. 네 곳 모두 기존 insertPrefix 경로의 `검증😀` 입력·저장본 텍스트 projection·undo 원본 byte-exact·redo 저장 byte-exact·재열기 재저장을 통과했습니다(실행 exit0). 공개 API 표본이며 독립 전체 XML/ZIP·Canvas 전수 검사나76곳 전체 재감사 완료는 아닙니다.

이력은 maxEntries8/maxCheckpointBytes16MiB입니다. 처음8×64MiB 설정은 ABI 총128MiB 한도로 enable 단계에서 LimitExceeded였고, 이를 문단 편집 실패나 한도 해제 근거로 계수하지 않았습니다. 한도를 바꾸지 않고 기존 감사 설정으로 검증했습니다. 이전439참조 root 감사는 다른 산출물/실행이며 현재 결과와 합산하지 않습니다.

## 필드 종류와 실행 상태 재확인

2026-10-11 원본 ZIP의 모든 `Contents/section*.xml`을 Python 표준 라이브러리 `zipfile`·`ElementTree`로 직접 순회하여 paragraph namespace의 `fieldBegin/@type`을 셌습니다. `HYPERLINK`14개, `CLICK_HERE`1개이며 다른 종류나 type 부재는 없었습니다. 두 종류 모두 `src/hwpx/field_text_kind.zig`의 지원 목록에 있습니다. 이 결과는 필드 종류 inventory이지 각 필드의 편집 적격성 증명이 아닙니다. 남은 거부는 마커 연결·중첩·문단 범위·소유권과 실제 명령 결과를 조사해야 하며, 이 근거만으로 제한을 해제하지 않습니다.

같은5d600685 산출물의 대형 문서 일반 입력/이력 감사와 전용 입력 감사는 관측 시점에 PID48386·48485가 각각 약28분 실행 중이었고 CPU 사용도 확인했습니다. 두 JSONL은 시작 레코드만 있어 완료 집계는 아직 없습니다. 출력이 없다는 이유로 재시작하거나 완료로 계수하지 않습니다.

별도 과거 native binary SHA256 `f082903941fbc1dd694d7f49936575476eb7472b8ac367719536d9c3b629548a`의3838테스트 실행은 세션 결과에서 `NativeRunnerClosed: code=null signal=SIGKILL`로 종료됨을 확인했습니다. 마지막 JSONL 성공 결과는3490번이며3491번 `field source merge plan allocation failures preserve cross-paragraph Unicode source`는 시작만 기록되었습니다. wrapper의 `completed:3491`은 마지막 테스트의 성공 증거가 아니므로 전체 통과로 해석하지 않습니다. SIGKILL 원인은 아직 확인되지 않았으며 제품 오류·메모리 부족·사용자 종료 중 어느 것으로도 단정하지 않습니다. 이 binary는 현재 기본 WASM의 최신 소스 검증도 아닙니다.
