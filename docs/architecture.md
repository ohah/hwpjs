# Zig/WASM 구현 구조

바이트 리더와 CFB 읽기·strict 검증·새 컨테이너 쓰기를 구현했습니다. CFB의 각 책임은 개별 파일로 나누며, `reader.zig`는 소유권과 처리 순서를 조립합니다. 상세 API와 검증 범위는 [CFB 읽기·쓰기](cfb-reader.md)를 참고하세요.

```text
src/
  binary/      경계 검사·정수 읽기 (현재 구현)
  cfb/         컨테이너 읽기·검증·새 컨테이너 쓰기 (구현)
  compression/ bounded raw DEFLATE·MIT 디코더 경계 수정본 (구현)
  hwp5/        FileHeader·버전·압축·레코드 경계·DocInfo 속성/ID 매핑/주요 리소스·일부 개수 검증 (구현), 나머지 의미 해석/쓰기 (예정)
  hwpx/        ZIP/XML 읽기·쓰기 (예정)
  model/       문서 공통 모델과 원본 정보 보존 (예정)
  root.zig     라이브러리 진입점
  wasm/        메모리 할당·CFB 수명·엔트리·원시 섹터 ABI
  wasm.zig     ABI 모듈 등록과 버전
js/            읽기·쓰기 API·메모리 복사·엔트리/편집 모델 변환·검색·Node 파일 입력
tests/cfb/     독립 JS 기준 구현과 비교, 브라우저 검증
tests/hwp5/    테스트 전용 WASM bridge·독립 zlib/레코드 oracle·적대적 검증 5회
```

CFB에는 HWP 문단·표·글꼴 로직을 넣지 않습니다. 파일·시계·브라우저 API에 직접 의존하지 않는 메모리 기반 읽기·쓰기를 우선합니다.

HWP5 기반의 책임 소유자·소유권·미지원 경계·검증 기록은 [HWP5 기반 구현](hwp5-foundation.md)에 모읍니다. 제품 JS ABI는 변경하지 않았고, 테스트 전용 bridge는 코어를 wasm32-freestanding으로 실행하기 위한 어댑터입니다.

DocInfo 리소스는 BinData·글꼴·탭·번호·글머리표·스타일·테두리/배경·글자 모양·문단 모양까지 해석합니다. `border_fill.zig`는 선 배열, `fill.zig`는 채우기 조합, `picture_info.zig`는 이미지 속성 공통 배치를 소유합니다. 문단 모양의 구/신 줄 간격을 임의로 하나로 합치지 않으며 전체 리소스 참조 검증은 후속 단계입니다.

저장은 문서 모델 → HWP 레코드 → 압축된 스트림 목록 → 새 CFB 생성 순서로 구현합니다. 기존 파일의 섹터를 제자리 수정하는 기능은 초기 범위에 포함하지 않습니다.

버전별 필드 부재와 기본값을 구분하고, 미지원 레코드·스트림 및 보존에 필요한 CFB 메타데이터를 유지하는 정책을 설계해야 합니다. 단순 재저장도 정보 보존 검증 전에는 무손실이라고 주장하지 않습니다.

구현 순서: CFB 읽기 → 새 CFB 쓰기 → 전체 스트림 왕복 비교 → HWP5 최소 읽기·쓰기 → 편집 후 저장 → HWPX 공통 모델 통합. 각 단계에서 기존 Rust fixture, 독립 리더, 손상 입력 테스트로 검증합니다.

CFB 단계의 현재 경계: 읽기 기본값은 레거시 호환, strict는 명세 검증을 추가합니다. 쓰기는 항상 명세용 이름 비교와 공통 메타데이터 검사를 사용합니다. `writer_directory.zig`는 의미 모델/형제 트리, `writer_layout.zig`는 FAT/DIFAT 수와 Range Lock 예약 배치, `writer.zig`는 바이트 직렬화를 담당합니다. `name_order.zig`와 `entry_rules.zig`는 strict 읽기와 쓰기가 공유하며, JS는 이를 재구현하지 않습니다.

이전 `benchmarks/zig-spike`는 실험이며 제품 파서로 승격하지 않았습니다. 기존 실험은 `legacy/rust/benchmarks/`에서 확인할 수 있습니다.
