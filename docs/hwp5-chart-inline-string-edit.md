# HWP5 차트 inline String 격리 편집

## 범위

observed V6 실제 Contents에는 inline Font 이름 3개와 inline Text 6개가 있다. inline은 그 위치에서 object ID와 String 정의를 함께 만들기 때문에 기존 alias 전용 fork로 바꿀 수 없다. 특히 실제 fixture의 footnote Font ID는 정의를 포함해 22곳, legend Font ID는 4곳에서 참조된다. 정의 payload만 수정하면 모든 alias가 함께 바뀐다. root-title Font와 footnote·primary-axis 4개·root-title Text는 각각 단독 참조다.

## SSOT와 알고리즘

`object_table.Table.references`가 성공적으로 파싱한 모든 String/Number 값 참조의 object ID, inline 여부와 원본 wire span을 순서대로 소유한다. grid와 footnote처럼 object table 생성 전에 읽힌 초기 값도 `initial_objects`가 같은 등록 API로 정의 span을 넘긴다. `max_references`는 입력이 참조 배열을 무제한 키우지 못하게 하며, 실패 시 reader와 논리 참조 목록은 유지된다.

`contents_inline_fork.forkIntroduced`는 대상 inline 정의를 새 object ID와 payload로 바꾸되 그 위치에서 처음 등장한 type declaration bytes는 그대로 둔다. 원래 ID의 뒤쪽 alias가 있으면 가장 이른 alias의 4바이트 참조를 기존 payload의 inline 정의로 바꿔 원래 정의를 이전한다. 나머지 alias는 원래 ID와 값을 그대로 본다. 뒤쪽 alias가 없으면 이전 patch를 만들지 않는다. 이미 선언된 type ID를 사용하는 inline String 직렬화는 `string_wire.zig` 한 곳만 소유하며 alias fork도 같은 구현을 사용한다.

## 현재 검증과 다음 경계

고정 실제 Contents에서 공유 footnote Font를 격리한 뒤 대상만 새 ID·bytes·trailer가 되고, 원래 ID는 21개 참조와 정확히 한 정의를 유지하며 원래 bytes·trailer를 보존하는지 재파싱한다. 단독 root-title Text는 이전 객체 없이 새 ID만 남는지 확인한다. alias 대상, 기존 object ID, 손상된 span·source ID와 정의 표시가 없는 참조 그래프는 명시적으로 거부한다.

적대적 검증은 원래 정의를 마지막 alias로 이전, 정의 이전 생략, 대상에 원래 object ID 유지, 대상 payload 1바이트 변조, 이전 정의에 새 trailer 사용의 다섯 결함을 각각 주입했다. `Debug`, `ReleaseSafe`, `ReleaseFast`의 유효한 15회 모두 컴파일 뒤 실제 Contents 재파싱 또는 끝단 identity/payload 검사에서 실패했다.

이 문서의 범위는 Contents writer와 참조 SSOT다. HWP 파일의 typed target API와 여러 inline 편집을 한 patch batch로 합치는 adapter는 다음 파트이며, 아직 지원한다고 간주하지 않는다.
