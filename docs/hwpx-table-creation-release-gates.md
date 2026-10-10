# 표 생성 게시 소스의 교차 포맷 게이트

게시5610e494의 WASM `a87ee487658b6ad9086f865360c22f24d1b93a574c7706ed6271366392e40c18`으로 native 생성/이력/표시 저장/리소스 집중9/9(root 포함)·exit0을 확인했습니다. 전체 native 완료 주장은 아닙니다.

같은 게시 소스의 HWP5 editor312/312·exit0(3555.314083ms), HWPX text34/34·exit0(49016.633167ms)이 통과했습니다. HWPX 검사는 tracked 열기/no-op·필드·주석·기존 표48숫자 입력·13수식과 독립 XML/ZIP을 포함합니다. 모든 객체/전체 reference 문서 지원으로 확대하지 않습니다.

HWP5 preview 실패는 검증 경로의 불일치였습니다. `Source.openReadOnly`는 observed_viewtext 정책을 명시적으로 선택하지만 기존 test는 배포 문서의 거부를 기대하고 oracle는 BodyText를 읽었습니다. 실제 distribution.hwp는5.0.5.0/153문단, viewtext.hwp는5.0.1.7/1문단이며 둘 다 readOnly=true/primarySource=distribution_viewtext입니다. CFB 파서/제품 복호화 코드는 변경하지 않았습니다.

교정 검사는 FileHeader 비트를 독립 기준으로 ViewText를 선택하고 기존 Node crypto/zlib oracle의 모든 문단 raw token 바이트를 대조합니다. 읽기 전용/primary 메타데이터도 검사합니다. 암호 문서1개 기본 거부는 유지하며48개 중47개 성공(5.0:14/5.1:33), independent matched47을 확인했습니다. 비교를 제거한 교정이 아닙니다. 교정 후 preview/display/oracle3파일21/21·exit0(294.63475ms)입니다.

작업 트리의 세 파일에 다른 추가 검사가 있어 덮어쓰거나 통째로 커밋하지 않습니다. 게시 버전 기반 최소 교정만 분리해 게시하며 원본 fixtures와 기존 추가 테스트를 유지합니다. 최초 hwp5-text-audit 호출은 게시 build에 없는 작업 트리 전용 step 이름이어서 실패했고, 실제 게시3파일 Node 명령으로 교정했습니다.

전체 parser/editor 목표와 원본 inline/쪽 배치·host 재배치·생성 셀 서식/구조·HWP5 생성은 여전히 남아 있습니다. 기본 WASM은 아직 승격하지 않았습니다.
