# 표 번호 상호참조의 원본 대상 연결

이 단계는 immutable 원본 트리의 표 ID와 캡션 자동 번호 선언을 연결합니다. 현재 모델의 번호 순서/다시 시작 계산, 상호참조 결과 문자열 재계산·저장, 편집 허용 확대는 아직 하지 않습니다. 기존 필드 결과 문자열을 현재 계산값으로 승격하지 않습니다.

## 책임과 소유권

`cross_reference_object_target.collect`는 표·그리기·수식의 공통 object_common 파서를 공유해 section/record offset/control ID/instance ID를 수집합니다. 중복을 제거하지 않습니다. `table_number_targets.collect`는 table_lists의 TABLE 전/후 경계와 list_groups 소유권, control_links의 실제 코드18 연결을 사용해 캡션 문단의 직접 atno만 선택합니다. 셀·중첩 개체의 번호를 바깥 표 캡션으로 간주하지 않습니다. 종류 비트는 기존 number_control.Header.kind가 단일 출처입니다.

반환 배열은 호출자가 해제하고 원소는 모두 scalar입니다. 트리·원본 CFB·해제한 구역의 slice를 보유하지 않습니다. 자동 번호의 header/기호/앞뒤 장식 원값과 미해석 꼬리의 길이·비0 여부를 노출하지만 형식을 렌더링하거나 미지 비트를 보정하지 않습니다. 전체 원문 보존은 원래 트리/문서 소유자의 책임입니다. 이 투영은 두 번째 편집 모델이나 지속 캐시가 아닙니다.

`storedValue`는 로컬 표의 번호 내용 요청만 받습니다. 호출자는 캡션 있는 표만이 아니라 모든 object site를 제공해야 합니다. 기존 resolveCommand로 전체 ID 중복·종류·외부 참조를 먼저 검사한 뒤 정확한 section/record offset/ID가 같은 캡션을 선택합니다. 같은 source 주소에 다른 ID가 있으면 SourceBindingMismatch입니다. 필드 결과 값·근접 표·순번·비슷한 ID를 fallback으로 쓰지 않습니다.

선언된 번호0과 캡션/번호 부재는 다릅니다. 캡션 번호가 없거나 여러 개이거나 종류가 표 번호4가 아니면 각각 명시적 오류입니다. 페이지·개요·각주 index·책갈피 이름·외부 문서는 이 조회의 대상이 아닙니다. 이 반환값은 저장된 atno 선언이지 편집 후 새 번호나 조판 결과라는 보장이 아닙니다.

## 실제 조사와 검증

분리한 main에서 기존 object target 회귀3/3과 ReleaseSafe WASM 빌드도 통과했습니다. 표 번호 종류4를 그림 번호3으로 잘못 허용하는 변이를 임시 소스에 주입했을 때 집중검사가 실제 실패했고, 원복 후 재검사했습니다. 이 변이는 제품 소스나 커밋에 포함하지 않습니다.

독립 CFB/레코드 oracle은 제품 tree나 필드 결과 캐시를 읽지 않고 표 공통 ID, TABLE 전 직접 캡션 번호, xrf command를 순회합니다. 로컬 표 번호 요청의 선택된 원본 두 개를 대조하는 검사이며 모든 command 종류의 별도 파서는 아닙니다.

`hwpspec.hwp`는 공통 개체518/표459/번호 있는 캡션424, 상호참조142개 중137개가 선언에 연결되고5개 참조는 ID 대상을 찾지 못했습니다. 연결 순서대로 target u32/number u16의 little-endian 6바이트 쌍을 SHA256한 값은 `d2447c7a84804de00940b5d2ac2bc9e9f40cd4d0dc00a2f6daf942dee3e46b77`로 native와 독립 oracle이 일치했습니다. 앞 결과는9/10/12/14/18/28이며 저장된 xrf 표시 문자열을 기대값으로 쓰지 않았습니다.

HWP5 5.0.5.0 배포용 `hwp-3.0-HWPML.hwp`는 공통 개체321/표305/번호 있는 캡션274이며 참조5개는 모두 대상이 없습니다. 파일명만 HWP3처럼 보이는 HWP5이며 HWP3 지원을 추가하지 않았습니다. 미해결은 참조 수이고 고유 ID 수나 손상 확정 판정이 아닙니다. 두 파일의 공개 편집 제한은 그대로 유지합니다.

작업 트리 ReleaseSafe8/8, 이번 변경만 분리한 main 기준 native Debug/ReleaseSafe 각각6/6·skip/실패0입니다. 실제 table-caption의8개 ID/선언1..8, 트리/구역/CFB 해제 후 원소 소유권, 신규 수집 경로 전체 할당 실패, 0/부재/중복·잘못된 종류·source identity·외부/페이지 거부를 검사했습니다. 원본 spec의 일반 본문 숫자를 모두 X로 변조해 cached 결과 숫자도 무효화한 파생 입력에서도137개 선언 쌍의 digest가 같았습니다. 원본 파일이나 command/atno 메타데이터는 변경하지 않았습니다. 분리한 main의 독립 JS oracle3/3도 skip 없이 통과했습니다. 전체 native 전수·WASM/API·Worker·브라우저 및 실제 편집 허용 완료를 뜻하지 않습니다.
