# 편집 모델과 원본 보존의 제한적 구현 실험

후속 [단순 문단 텍스트 편집 실험](hwp5-plain-text-edit-experiment.md)은 별도 `splice_text` 명령과 그 거부·조판 경계를 소유합니다. 아래 기록은 최초 스타일 참조 실험이며, 기존 `insert_text`·`delete_paragraph` 명령의 미지원 계약은 유지됩니다.

[모듈 인덱스](hwp5-modules.md) · [현재 읽기 전용 모델](hwp5-model-projection.md)

## 검증하려는 주장

공통 문서 모델을 편집의 기준으로 사용하면서, 같은 포맷으로 저장할 때 편집과 무관한 미해석 데이터를 유지할 수 있는지 검사합니다. 전면적인 편집·무손실 저장 지원으로 일반화하지 않습니다. 이번 범위는 기존 HWP5 문단의 `PARA_HEADER.style_id` 참조값 하나이며, 스타일을 실제로 적용하는 데 필요한 ParaShape·CharShape 변경이나 조판은 포함하지 않습니다.

## 구현과 SSOT

`src/hwp5/edit/style_preservation.zig`의 실험용 `Session`은 opaque 핸들입니다. 기존 `model_projection`의 소유 모델, 원본 CFB와 압축 해제한 Section, 문단별 원본 필드 위치를 내부에 둡니다. 호출자는 문단 식별·스타일의 scalar 복사본만 조회하고 `apply` 명령으로 기존 스타일 ID를 설정합니다. 원본 바이트와 모델의 mutable slice를 외부에 반환하지 않습니다. 핸들의 수명은 `open`부터 `close`까지이며, 닫힌 핸들을 사용하는 계약은 없습니다.

현재 편집값의 기준은 모델의 `style_id`입니다. 원본은 불변 기준값과 미해석 정보 보존만 담당합니다. 저장 시 모델과 원본의 해당 필드를 직접 비교하므로 별도 dirty 표식이나 모델 전체 해시는 필요하지 않습니다. 변경이 있으면 원본 Section을 복사하고 허용한 필드만 덮어씁니다. 최초 필드 위치·버전 해석은 기존 `paragraph_header`와 record framing을 재사용하며, `Header.style_id_offset`은 문단 헤더 모듈이 소유합니다. 구역/문단 순서를 바꾸는 편집을 추가하면 이 위치 연결 계약부터 다시 설계해야 합니다.

입력 경계는 `text_source.Source`, 스타일 리소스 수·ID_MAPPINGS 검사는 `resources.inspect/validateKnownCounts`, 문단 모델은 `model_projection`, 압축 출력은 기존 `raw_deflate.encodeStored`, 새 CFB 생성은 기존 `stream_replace.rebuildManyExact`를 사용합니다. 새 파서·CFB writer·압축기를 만들지 않습니다. 미리보기용 관측 복구로 원본 바이트가 치환된 입력은 이 실험의 저장 경로에서 거부합니다. 참조 ID가 리소스 목록 밖이거나 구역·문단 위치가 잘못됐으면 모델 변경 전에 거부합니다.

변경 없는 저장과 편집 후 원래 값으로 되돌린 저장은 전체 원본 파일을 그대로 복사합니다. 변경된 저장은 새 CFB를 생성하며 선택한 Section의 압축 표현·물리 섹터 배치는 달라질 수 있습니다. 이때 주장하는 보존은 압축 해제한 Section의 비편집 바이트와 다른 스트림의 payload이며, 변경 파일 전체의 바이트 동일성이 아닙니다. 수정 Section은 raw DEFLATE stored block으로 인코딩해 압축률을 보장하지 않습니다.

## 적대적 검증에서 확정한 제한

- 스타일 참조를 바꾸면 원본 LineSeg 등 조판 데이터가 낡을 수 있습니다. 기본 `save`는 `LayoutReflowRequired`로 거부합니다. 테스트만 `allow_stale_layout=true`를 지정해 바이트 보존을 확인하며 결과의 `layout_requires_reflow=true`를 유지합니다. 그 출력이 한컴에서 정상 조판된다는 실측은 없습니다.
- 길이를 바꾸는 텍스트 삽입과 문단 삭제 명령은 `UnsupportedStructuralEdit`로 거부합니다. 미해석 레코드가 문단 번호·UTF-16 위치·다른 개체를 참조할 수 있어, 바이트 복사만으로 편집 후 의미 보존을 증명할 수 없습니다.
- 실제 `noori.hwp`의 원본 PARA_HEADER는 65개인데 Rust JSON의 문단 헤더는 109개입니다. 표 셀과 컨트롤 목록에 같은 원본 문단이 중복 투영됩니다. Instance ID도 반복되므로 전역 고유 식별자로 사용할 수 없습니다. 원본 Section/record 위치와 논리 개체의 소유 관계가 필요하며, JSON 배열 순서나 Instance ID만으로 연결하지 않습니다.
- HWPX XML/ZIP 어댑터와 HWP↔HWPX 변환은 이번 실험에서 검증하지 않았습니다. 같은 포맷의 고정 길이 참조 편집 결과를 교차 포맷 또는 일반 구조 편집으로 확대하지 않습니다.

## 실행과 검증 경계

명령의 단일 출처는 [개발·검증 명령](development-commands.md)입니다. `tests/hwp5/style-preservation/session.test.zig`는 원본 입력 수명, 변경→저장→재읽기, 되돌리기, invalid ID/경로 및 구조 편집 거부의 원자성, 세션 독립성, 반복 저장, 출력 한도, 모든 open/save 할당 실패 지점의 정리를 검사합니다.

`probe.zig`는 테스트용 파일 입출력 경계만 담당하고 `file-audit.mjs`가 실파일과 반례를 조립합니다. 대조기는 legacy CFB.js로 입력과 출력을 읽고 Node raw DEFLATE로 Section을 해제해 원본에서 선택한 한 바이트만 바꾼 기대값과 전수 비교합니다. 기존 Rust `toJson`에서도 모든 변경이 해당 스타일 참조에 한정됐는지 검사하며 중복 JSON 투영도 함께 확인합니다. unknown 확장 크기 레코드, 문단 헤더 꼬리, 레코드 index와 문단 index가 어긋나는 배치, 별도 미지원 스트림의 보존을 검사합니다. 변경 무시·다른 문단 변경·미해석 바이트 손상의 세 반례가 대조기에 검출되어야 합니다.

2026-09-30 실측: Debug·ReleaseSafe·ReleaseFast 각각 audit 10/10 단계와 세션 테스트 4/4가 통과했습니다. 실제 HWP 4개에서 첫/중간/끝 문단 12곳을 편집했으며 그중 중첩 문단은 3곳입니다. 별도로 비압축 입력 1건, 2구역 입력 1건, 미해석 데이터 배치 2건을 합성해 총 4건의 추가 편집을 대조했습니다. 실제 4개 파일의 무변경 저장은 전체 파일 바이트가 같았습니다. 잘못된 참조·경로, 조판 opt-in 누락, 텍스트 길이 불일치의 거부 8건과 대조기 반례 3건도 확인했습니다.

제품 소스의 임시 복사본에 변경 무시, 조판 거부 제거, 스타일 범위 검사 제거, 출력 위치 1바이트 이동의 결함을 각각 주입했습니다. ReleaseSafe 세션 테스트가 네 결함 모두 실행 시 실패로 검출했습니다. 컴파일 실패를 검출 성공으로 세지 않았으며 실제 제품 소스에는 결함을 적용하지 않았습니다. 기존 미리보기 및 문서 도구의 Node 회귀 테스트 17/17, ReleaseSafe WASM 빌드와 Zig format 검사도 통과했습니다.

기존 전체 Zig 회귀 테스트도 2,681/2,681 통과했습니다(22분). 새 세션 테스트 4개는 별도 실험 audit에 포함되므로 이 수에 중복 합산하지 않습니다.

출력 HWP와 합성 입력은 audit이 출력하는 임시 artifacts 경로에서 확인할 수 있으며 입력 fixture를 덮어쓰지 않습니다. 이 결과는 해당 표본과 허용 필드의 보존을 입증할 뿐, 모든 실제 문서·모든 편집·한컴 조판 호환성의 증명이 아닙니다.
