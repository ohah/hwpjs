# 빈 RevisionSign 표식을 보존하는 텍스트 편집

## 계약과 SSOT

`revision_sign_text_retention`은 정확한 UTF-16 `$RevisionSign;1;`, attributes0·other0·4바이트 영 확장, 같은 문단/같은 unit의 빈 결과 범위만 보존 대상으로 받습니다. `%sig` 마커와 `%unk` 헤더의 관계는 기존 `body/control_identity`를 재사용하며 `%unk` 전체나 명령 접두사 wildcard를 허용하지 않습니다. 표식의 의미 실행·서명 유효성 확인/갱신이나 원본 조판 동치를 주장하지 않습니다.

일반 field binding 수집은 유지하고 텍스트 전용 수집이 기존 편집 필드 종류와 이 표식만 허용합니다. 표식 결과/경계 입력은 `ReadOnlyRetainedFieldResult`, 제어 바이트 내부·삭제는 기존 control boundary 규칙으로 거부합니다. `field_dirty_values.prepareText`는 기존 일반 필드의 modified 처리를 유지하되 표식 속성을 쓰지 않습니다. 이름 결과 적용도 텍스트 전용 경로에서만 이 수집을 사용하며 일반 결과 적용 API는 넓히지 않습니다.

원본 입력 적격성은 선택/비선택 텍스트 경로에서 별도 span 검증을 거칩니다. generic field transaction·문단 구조·글자 속성 변경 허가와 섞지 않습니다. 알려진 수식과 참조의 계산/보호 계약, stale-layout 저장 동의는 유지합니다. 불명확한 속성·추가 확장·명령 인자·비어 있지 않은 결과는 보존 허가에서 제외하고 명시적으로 거부합니다.

## 실제 원본과 적대적 검증

분리 소스 `/tmp/hwpjs-revision-sign-retention.QtJvgD`는 읽기 API 후보 위에 이 변경만 적용합니다. 최초 WASM SHA256 `1a359d6459cc8c8ec13df8067eec40752c48e2adb668580458cdc32b91e0eb3b`, ReleaseSafe5/5입니다. 실제53,448문단 시장구조조사 원본에서 문단50000과 표식 문단8980의 앞 삽입·전체 Section/비대상 stream/CFB metadata·현재 필드17개·undo/redo·strict 재열기/byte-exact 재저장을 검사해 `revision-sign-text.log`1/1을 통과했습니다. empty 표식 내부 거부와 기존 글자 속성 거부 후 redo도 보존했습니다.

정확한11파일 선택의 `revision-sign-expanded-regressions.log`는38/38·fail/cancel/skip0·exit0입니다. 실제 개체/표 참조·Canvas·수식 정의/숫자 의존성·기존 필드 구역·source policy·책갈피 조회를 함께 검사했습니다. 참조 getter만 통과한 결과가 아닙니다.

명령 `;2;`·attributes·other·확장값·확장 길이·비어 있지 않은 결과·필드 끝 ID의7개 파생 입력은 원본을 덮어쓰지 않고 단일 Section만 바꿉니다. 다른 stream이 그대로임을 독립 검사하고, 실제 문단 모양 변경→undo로 만든 redo가 조회/입력 거부 후에도 유지됨을 확인했습니다. `revision-sign-negative-corrected.log`9/9는 이7개와 기존 읽기 반례2개입니다. 명령 변형의 조회는 `UnsupportedSectionControl`, 입력은 먼저 marker/header 연결을 검사하므로 `FieldMarkerMismatch`입니다. 처음에는 두 경로의 오류가 같다고 가정해1개 실패했고, 각각의 정확한 오류로 재검증했으며 오류 범위를 넓은 정규식으로 바꾸지 않았습니다.

실제 표식 문단만 compact source로 추출한 전체 부분 할당 실패·실패 draft의 저장 바이트 불변·저장/재열기·빈 범위 이동 및 generic transaction/글자 속성 거부는 ReleaseSafe/Debug 각각2/2·exit0입니다. 최초 후보와 native 테스트/등록 이후의 publication 빌드·정규 묶음은 구분합니다.

`publication/bin/hwpjs.wasm`도 SHA256이 위1a359d64와 같으며 ReleaseSafe5/5입니다. `revision-sign-publication-reader-parity.jsonl`은 이전b17b942c와 참조975개를 대조해 전체 읽기 JSON944동일·기존 거부5동일·HWP3범위제외26·exit0입니다. 같은 후보의 `revision-sign-publication-editor-audit.log`는 정규414/414·fail/cancel/skip0·exit0, 빌드7/7단계로 종료했습니다(664,134.11ms). 집중38개 결과를 정규 묶음 완료로 대체하지 않았습니다.

별도 `/tmp/hwpjs-window-ui-publication.5u0iBt/late-window-retention-positive.log`는5만 번째 문단의 실제 Worker 구간 이동·입력·저장·undo·잘못된 이동 거부 후 redo·strict 재열기까지1/1·fail/cancel/skip0·exit0(199,830.38ms)입니다. `late-window-retention-canvas.log`도 같은 문단의 Canvas controller 선택·beforeinput/input·저장 전체 Section 대조·undo/redo를1/1·fail/cancel/skip0·exit0(226,669.05ms)으로 통과했습니다. 두 검사는 실제 Worker/WASM이지만 DOM/Canvas 및 입력 이벤트는 모의 환경이며 실제 Chromium·포인터·IME 검사를 대신하지 않습니다. 느린 전체 UI 질의도 해결되지 않았습니다.

기본 WASM/외부 데모와 전체 native gate는 별도이며 현재 구현을 모든 `%unk` 문서 편집 지원으로 확대하지 않습니다.
