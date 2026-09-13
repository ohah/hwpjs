# HWP5 차트 Grid 타입 선언 이동

## 범위와 SSOT

최초 Grid String 또는 Double 셀을 null화할 때 함께 삭제되는 타입 선언을 다음 비편집 타입 참조로 이동한다. 타입 정의의 이름·버전은 `type_table.definitions`, 모든 원본 참조 좌표는 `type_table.references`, 셀 좌표와 값 종류는 `chart_edit_session`, 최종 원본 좌표 합성은 `contents_patch`가 각각 한 번만 소유한다.

`type_declaration_relocation.prepare`는 셀의 known wire 길이와 셀 안 introduced 참조의 선언 확장분을 더한 값이 셀 전체 span과 정확히 같은지 검사한다. String known wire는 `19 + payload length`, Double은 26바이트다. 값 타입·`VtValue`·`VtObject`의 관측 레이아웃상 한 셀의 타입 참조는 최대 세 개다. 설명되지 않는 바이트, 셀 경계를 가로지르는 참조, 잘못된 ID·이름·버전·known 참조 길이는 거부한다.

각 삭제 선언은 같은 ID의 첫 후속 4바이트 참조로 그대로 이동한다. 같은 batch에서 삭제될 셀의 참조는 건너뛴다. 후속 참조가 하나도 없으면 더 이상 선언이 필요하지 않으므로 이동 패치를 만들지 않는다. 객체 String alias 이동과 타입 선언 이동은 서로 다른 원본 span이며, 모든 패치는 정렬 후 기존 겹침 검사를 통과해야 한다.

## 실제 파일 검증

고정 실제 HWP의 최초 String `(0,1)`은 `VtString`·`VtValue` 선언 두 개를, 최초 Double `(1,1)`은 `VtDouble` 선언 하나를 소유한다. 네 개 셀 `(0,1)`, `(0,2)`, `(1,1)`, `(1,2)`를 wire 역순의 단일 batch로 null화해 첫 후속 참조도 편집 대상인 경우를 포함했다. 바깥 CFB, 압축 BinData, 내부 OLE와 Contents를 다시 열어 네 null 슬롯, 그 뒤 String·Double 값, 타입 정의 수를 확인한다.

직접 wire 검사는 이동 대상이 원래 네 바이트 참조이고 replacement가 원 선언 전체이며 ID가 같은지 확인한다. 타입 선언 원본 이름 손상도 파싱 후 편집 시점 검증에서 거부한다. allocation-failure 전수 경로에서 target·객체 이동·타입 이동 replacement와 메타데이터 배열이 모두 해제되는지 검사한다.

String known 길이를 1바이트 크게 계산, 같은 batch 편집 목적지를 건너뛰지 않음, 선언 대신 기존 4바이트 참조를 복사, 선언을 한 바이트 밀어 ID·payload를 변조, 원본 타입 참조 검증 제거의 다섯 결함을 각각 주입했다. `Debug`, `ReleaseSafe`, `ReleaseFast`의 유효한 15회 모두 컴파일 성공 후 실제 HWP 재파싱, 겹침 검사, 정확 wire 또는 손상 원본 오류 assertion에서 검출됐다.
