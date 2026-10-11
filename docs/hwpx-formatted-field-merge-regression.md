# 서식 편집 후 원본 필드 문단 병합 회귀

## 수정 후보와 검증 경계

### 필드 바깥 입력의 오래된 거부 기대 확인

같은7f310f37 후보에서 Worker의 필드 바깥 입력은 정상 지원 동작임을 실측했습니다. 서식으로 세 조각이 된 hyperlink 라벨 뒤의 plain text(독립 XML에서 네 번째 `hp:t`)에 Unicode/기호를 삽입하고 `hwpx-field-outside-oracle.py` 일반 Python·`-O`로 전체 XML/비대상 ZIP을 대조했습니다. 잘못된 기대 문자열의 거부·undo/redo·재열기 저장 바이트도 확인했습니다. 기존 라벨 입력의 redo 검사는 유지하며, 실패 입력은 필드 끝을 가로지르는 범위로 바꿔 `UnsupportedFieldLabelRange`·applied=false·원문/redo 보존을 검증합니다. 거부 검사를 단순 제거한 것이 아닙니다.

이 후속 테스트까지 포함한 같은 관련11개는11/11·exit0·skip0(9768.026458ms)입니다. 앞선11개 중1실패와 구별합니다. 숫자 셀 분할의 기존 거부 기대3개는 아직 확인 대상이며 전체 구조66개·전체 공개 suite의 통과로 확대하지 않습니다. 테스트 파일과 runtime은 최신 전체 gate 전 미커밋입니다.

작업 트리의 후속 수정은 서로 다른 원본 template·원본 ordinal·생성 ID/조각 부재를 확인한 문단 쌍을 source 필드 경로로 전달합니다. `field_original_positions`가 원본 위치 투영과 이미 설치된 위치를 대조하고, 필드 계획이 마커 귀속을 검증한 뒤에만 텍스트/서식 전용 borrowed adapter를 사용합니다. 일반 Joined 변환기의 필드 거부 계약은 유지합니다. 서식 있는 source 후보는 기존 소유 행 작성기의 서식 분할을 재사용합니다. 같은 원본의 generated 분할 그룹은 기존 current/joined 경로를 유지합니다.

ReleaseSafe build6/6·exit0(52초), 후보 `formatted-original-field-merge/bin/hwpjs.wasm` SHA256 `7f310f37d2900794df5aeb2ec2b8df4c95e61f8b49b6e477a6209fadd2e74d26`입니다. 실패했던 API/실제 Worker 두 사례는 기대값 변경 없이2/2·exit0·skip0(4928.489709ms)로 통과했습니다. 독립 XML/ZIP 및 서식·이력·재열기 검사를 유지합니다. 확대 실행은11개 중10통과·1실패·skip0·exit1(7949.609042ms)이며 남은 실패는 별도의 필드 바깥 입력 거부 기대입니다. 해당 성공 명령의 무손실 검증 전에는 기대를 변경하지 않습니다.

native source 계획/저장 집중 검사는6/6·exit0입니다. 설치된 원본 위치가 있는 경로의 전 할당 실패 검사를 후속 추가한 뒤 해당 선언과 root2/2·exit0도 확인했습니다. unit·element·begin·kind 변조 거부와 입력 원문 불변을 포함합니다. 최초 공통 할당 검사 helper 이름을 잘못 호출한 test-only 컴파일 오류는 실제 `check(callback,args)` API로 수정했습니다. fmt/diff check는 통과했습니다. 진행 중인 전체 native 실행은 수정 전 소스이므로 이 후보의 전체 검증으로 사용하지 않습니다. runtime 변경은 미커밋이고 최신 전체 gate·남은4실패 조사·기본 제품/외부 데모 승격은 남아 있습니다.

최신06d4 후보의 두 구조 테스트 파일 전체 재실행은66개 중60통과·6실패·skip0·exit1(256307.792333ms)로 종료했습니다. 실패는 서식 후 병합2개, 참조 숫자 셀 분할의 거부 기대3개, 필드 바깥 입력의 거부 기대1개입니다. 뒤의4개는 명령이 성공했지만 성공 결과의 무손실 검증을 아직 수행하지 않았으므로 오래된 기대값이라고 확정하거나 테스트를 완화하지 않습니다.

2026-10-11 전체 공개 테스트의 이전 후보3d77 실행은 exit1로 종료했습니다. 최종 출력에 서식 편집 후 필드 병합 실패, 필드 바깥 입력의 기존 거부 기대 불일치, 참조 숫자 셀 분할의 기존 거부 기대 불일치가 포함됐습니다. 출력이 잘려 전체 실패 개수는 아직 확정하지 않았으며 전체 통과로 기록하지 않습니다.

최신06d4 후보에서도 `structure-editor.test.mjs`와 `structure-worker.test.mjs`의 `original field merge retains` 두 사례가 `UnsupportedStructuralFieldEdit`로 실패했습니다. 독립 XML oracle과 이력 기대를 변경하지 않았습니다.

현재 호출 경로에서 서식 편집은 원본 문단에 `field_positions`를 설치합니다. `paragraph_merge_session`은 이 값이 있으면 `field_current_merge`로 전달하지만, 이 모듈은 같은 template을 나눈 generated 문단 쌍만 허용합니다. 실제 테스트는 서로 다른 원본 문단 쌍이므로 해당 조건과 충돌합니다. 원본 필드 쌍 병합 경로는 별도로 존재하지만 기존 source 계획과 위치 투영도 이미 설치된 `field_positions`를 거부합니다. 분기만 바꾸거나 보호 검사를 삭제하는 것으로 해결됐다고 판단하지 않습니다.

처음 시도한 source 후보 서식 거부 완화·서식 작성기 선택·텍스트 어댑터 변경은 새 ReleaseSafe 빌드6/6 뒤에도 두 사례가 모두 실패했습니다. 이 시도는 실제 거부 지점에 도달하지 못했고 해당 변경은 모두 원복했습니다. 원래 실행 중인 native 검증의 소스는 이 시도 전 상태와 다시 일치하며, 실패 후보는 기본 WASM/외부 데모로 승격하지 않았습니다. 실제 경로의 소유권 검증·왕복 XML·undo/redo·할당 실패를 포함한 수정과 재검증은 남아 있습니다.
