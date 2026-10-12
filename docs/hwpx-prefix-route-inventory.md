# HWPX prefix 입력 경로의 읽기 전용 전수 조사

`node tools/hwpx-prefix-route-inventory.mjs --wasm=/absolute/candidate/hwpjs.wasm --fixture=/absolute/document.hwpx`는 reader가 반환한 모든 문단에서 기존 prefix 입력 경로 선택을 조사합니다. 문서 전체 문단 번호와 구역 로컬 번호는 기존 `hwpx-paragraph-coordinates`가 소유합니다.

`hwpx-prefix-route-query`는 실제 입력의 `hwpx-prefix-edit-probe.insertPrefix`를 재사용합니다. 조회 함수만 전달하고 세 mutator를 plain/anchored/field 결과를 반환하는 대역으로 바꾸므로 실제 입력·값 변경은 실행하지 않습니다. 경로가 선택돼도 보호 검사·저장·이력·독립 XML 대조가 성공한다고 주장하지 않습니다. 거부는 전부 기록하고 종료코드1로 반환하며 OOM 등을 성공으로 세지 않습니다.

조사 후 저장본/원본 파일의 byte-exact 불변과 지정 WASM의 SHA256 불변을 확인합니다. 결과에는 입력/산출물 hash·경로별 수·모든 거부 위치를 포함합니다. 읽기/소유 경계·원본 조판·객체 payload 편집을 검증하는 명령은 아닙니다.

## 현재 실측

후보 SHA256 `50cabdb019974d12a6545d44281cf51cbabb86df5d987e185b41a11b3ccc2c24`, `reference/rhwp/samples/2025 행정업무운영 편람(최종).hwpx` SHA256 `c6dd7e847a99f219681afc5a29c80a9665c04df9cda4d820a3350d739664fdf6`에서 exit0입니다. `/tmp/hwpjs-large-prefix-route-inventory.log`의10409문단은 plain9887·anchored515·field7이고 refused 배열은 비어 있습니다. 저장본/입력 파일/산출물 불변 검사도 통과했습니다.

같은 후보의 이전20거부 위치 집중 편집 검사는1/1 exit0(234063.131667ms)이며 실제 입력·독립 전체 XML normal/-O·잘못된 기대값 거부·저장/재열기·undo/redo를 확인했습니다.20개 실제 편집 성공과10409개 읽기 전용 경로 선택은 별도 범위입니다. 현재 전용 prefix 전수 편집 감사(`/tmp/hwpjs-large-specialized-role-current.log`)는 실행 중이며 파일 전체 성공으로 합산하지 않습니다.

`node --test tests/hwpx/prefix-route-query.test.mjs tests/hwpx/prefix-edit-probe.test.mjs`는6/6 exit0입니다. 일반/필드 외부/앵커/유일 필드 선택, 실제 mutator 호출 금지, ABI 부재 fallback, 애매한 후보 거부와 예기치 않은 오류 전파를 검사했습니다.
