# HWP5 차트 Grid 숫자 셀 편집

## 범위와 SSOT

Grid 좌표는 object ID가 아니라 null을 포함한 `row * columns + column` 배열 위치로 결정한다. `chart_edit_session.grid_cell_number`와 `replaceGridCellNumber`는 행·열 범위를 각각 검사하고 대상이 실제 `VtDouble`일 때만 기존 `contents_number_edit.replacementNumber`에 연결한다. 숫자 payload 검증·직렬화를 별도로 복제하지 않는다.

고정 실제 Contents는 5×4의 20셀로, null 1개·String 7개·Double 12개다. Double은 0-based 좌표 `(1..4, 1..3)`에 있고 12개 모두 inline 정의이며 object ID 참조 수가 정확히 1이다. 각 payload는 10바이트이고 파일 편집은 객체 ID·Contents 길이를 유지한다.

## 검증

행·열 범위 밖, null/String 셀의 숫자 편집을 구분해 거부한다. 전치 좌표식과 우연히 같아지지 않는 `(2,3)` 셀에 NaN payload bits와 비기본 trailer를 저장한 뒤 바깥 HWP, 압축 BinData, 내부 OLE와 Contents를 다시 열어 확인한다. 기존 62개 편집과 12개 Grid Double을 합친 74개 명령을 역 wire 순서까지 포함해 한 번에 적용하고 모든 숫자 셀을 재파싱한다.

이 범위는 현재 관측된 Grid의 기존 Double 값을 고정폭으로 바꾸는 기능이다. null/String 셀을 숫자로 materialize하거나 행·열 추가, 수식·계열 캐시 동기화, 렌더링 동일성을 주장하지 않는다.

## 적대적 검증

행·열 전치, 행 범위를 columns로 검사, 열 범위를 rows로 검사, 공유 object ID 허용, payload 시작 위치 1바이트 이동의 다섯 결함을 각각 주입했다. 최초 공유성 변형은 기존 검사에서 통과했으므로 검출로 세지 않고 target resolver와 직접 공유 참조 테스트를 추가한 뒤 재실행했다. 보강 후 유효한 다섯 결함은 `Debug`, `ReleaseSafe`, `ReleaseFast` 총 15회 모두 컴파일 성공 후 실제 assertion 실패로 검출됐다.
