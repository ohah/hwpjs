# DocHistory의 선택적 컨테이너 연결

[문서 계약](hwp5-document-contracts.md) · [이력 날짜](hwp5-history-dates.md)

## 범위와 명세 근거

HWP5 3.2.11/4.4.1~4.4.2는 DocHistory 아래 VersionLog%d와 HistoryLastDoc을 정의하고, 이력 스트림의 압축·암호화를 설명합니다. 그렇다고 모든 이력 스트림이 FileHeader.compressed에 따라 일반 본문과 같은 방식으로 저장된다고 확정하지 않습니다. 기존 날짜/이력 항목 검사를 연결하되 복호화 알고리즘이나 XML 복원기를 새로 추정하지 않습니다.

`container_validation.Options.history`는 기본 null입니다. 이때 DocHistory를 새로 해석하거나 소비하지 않으며 기존 uninspected_streams 경계를 유지합니다. 검사하려면 아래 선택을 명시합니다.

```zig
.history = .{
    .encoding = .observed_hwp_compressed,
    .item = .{
        .start_layout = .observed_option_first,
        .date_layout = .observed_systemtime16,
    },
}
```

encoding에는 기본값이 없습니다. decoded는 저장된 바이트가 이미 decoded된 모델, observed_hwp_compressed는 관측 raw DEFLATE + 선택적 CRC32/ISIZE 꼬리 모델입니다. 후자는 기존 compressed_stream.decode를 재사용합니다. 압축 해제 실패 시 raw로 재시도하지 않고 오류를 전파합니다. 이 선택이 이력별 암호화를 해제하거나 모든 HWP 버전을 지원한다는 뜻은 아닙니다. 파일 전체의 암호화/DRM 등 기존 보안 거부 정책도 그대로입니다.

## 책임과 경로

- `container/numbered_stream.zig`: 대소문자를 구분하지 않는 ASCII 접두부와 정규 십진 접미사 읽기의 공통 구현. Section의 u16 제한/오류 형식은 기존 paths.sectionIndex가 유지하고 VersionLog는 u32 인덱스를 사용합니다.
- `container/selected_encoding.zig`: [XMLTemplate](hwp5-xml-template.md)와 공유하는 명시적 codec 선택/owned buffer 반환. 기존 압축 검사기를 호출하며 각 소비자의 남은 바이트 한도를 전달받습니다.
- `container/history.zig`: 정확한 DocHistory 직접 자식 선택, 수치 인덱스 정렬, 선택한 디코딩, 공유 예산, 결과 배열 수명.
- `history/item.zig`: 기존 STAG/ETAG·presence·payload 문법·날짜 선택. 컨테이너에서 이 규칙을 다시 구현하지 않습니다.
- `container/validation.zig`: 기존 파일/본문/별도 스트림 검사와 이력 검사 순서를 연결하고 최종 소유권·미소비 스트림을 보고합니다.

선택된 경로에서는 DocHistory가 storage, VersionLog 및 HistoryLastDoc이 stream이어야 합니다. VersionLog 이름은 0 또는 선행 0 없는 비음수 십진 접미사이며 u32 안이어야 합니다. 접두부가 일치하지만 접미사가 잘못되면 InvalidHistoryStreamName입니다. 이 u32 상한은 현재 인덱스 API의 범위이며 공식 파일 형식의 최대 이력 수를 주장하지 않습니다.

인덱스는 숫자 순서로 정렬합니다. 0부터 시작하거나 연속해야 한다고 강제하지 않고, 이름의 번호를 Item의 VERSION payload나 저장 시각과 같다고 가정하지 않습니다. 다른 루트의 VersionLog0, DocHistory 하위 중첩 storage의 동명 항목, 미지 직접 자식은 검사하지 않으며 미소비 상태로 남습니다. basename 검색으로 가져오지 않습니다.

HistoryLastDoc은 존재와 encoded 바이트 수만 기록하고 **소비했다고 표시하지 않습니다**. 내용·LASTDOCDATA 관계·복원에 대한 검증은 남아 있습니다. 그 내용이 손상되었는지 이번 파서가 판단하지 않으므로 opaque 바이트를 압축 해제하거나 재작성하지 않습니다. 존재하지 않아도 자동 생성하거나 필수 오류로 승격하지 않습니다.

FileHeader.history 선언과 실제 storage 존재는 각각 declared/present로 기록합니다. 선언만으로 스트림을 만들거나 codec을 결정하지 않으며, 미선택과 선택했지만 storage가 없는 경우는 null Report와 present=false로 구분합니다.

## 예산과 소유권

max_items는 기본 4,096개, max_decoded_bytes는 기본 64 MiB입니다. item.framing.max_records는 한 항목마다 초기화하는 한도가 아니라 **선택된 전체 이력**이 공유합니다. max_payload_bytes는 개별 이력 레코드의 한도입니다.

디코딩마다 이력 자체의 남은 바이트 예산과 기존 문서 전체 max_total_bytes의 남은 예산 중 작은 값을 전달합니다. 레코드 수는 DocInfo/BodyText와 ViewText가 이미 소비한 수를 문서 전체 max_total_records에서 뺀 뒤 이력 자체의 남은 레코드 한도와 함께 적용합니다. 다음 항목에서 예산을 초기화하지 않습니다. 정확한 예산은 허용하고 한 단위 부족하면 오류입니다.

Report는 정렬된 Entry 배열을 소유합니다. 각 Entry는 index, 시작 flags/option, decoded_bytes와 기존 Item.Report의 scalar만 보유하며 decoded 바이트/CFB 노드를 빌리지 않습니다. 각 decoded 버퍼는 해당 항목 검사 뒤 해제합니다. 컨테이너 Report.deinit이 이력 배열도 해제합니다. 원문이 필요하면 기존 CFB/decoded Item API로 별도로 읽어야 하며 이 scalar 보고서가 원문 전체를 대체하지 않습니다.

성공한 VersionLog만 used로 표시하여 최종 uninspected_streams에서 제외합니다. 실패하면 전체 컨테이너 보고서를 반환하지 않고 이전 본문·이력 배열·버퍼를 정리합니다. 내부 helper의 used/remaining 문맥은 부분 진행될 수 있으며 컨테이너 호출은 실패 시 그 문맥을 버립니다. 호출자 Options와 원본 파일은 변경하지 않습니다.

## 검증 구성

테스트 mode 114는 mode/start/date u8 세 값, items/decoded bytes/history records/payload u32 네 한도 뒤에 기존 컨테이너 입력을 받습니다. mode 0은 미선택, 1은 decoded, 2는 관측 압축입니다. 기존 컨테이너 보고서 뒤에 선택 여부와 이력 scalar 보고서를 추가합니다. 기존 mode 25의 wire 및 제품 JS ABI는 바꾸지 않습니다.

독립 기대값은 Node zlib와 기존 JS 이력 oracle로 각 항목을 계산합니다. 변경되지 않은 일반 문서 보고서에 예상된 소비 바이트/스트림 차이와 독립 이력 보고서를 붙여 전체를 대조합니다. 제품 이력 serializer에서 기대값을 생성하지 않습니다.

실파일 `treatise sample.hwp`는 VersionLog0~3, decoded 길이 109/6,505/19,885/81,177(합계 107,676), 28레코드입니다. 원본과 메모리에서 재구성한 CFB의 선택/미선택, 날짜 선택, 두 시작 배치, decoded 이력/압축된 일반 본문의 조합을 검사합니다. 디스크 표본은 쓰지 않습니다.

검사는 정확한/부족한 items·bytes·records·payload·문서 전체 예산, CRC 오류·잘린 압축·잘못된 codec·항목 잘림·날짜 잘림, 잘못된 이름/CFB kind, 희소/큰 인덱스·대소문자, root/중첩의 동명 스트림, opaque HistoryLastDoc, 선언과 존재의 차이를 포함합니다. ViewText를 추가한 모델에서 본문+ViewText+이력이 전체 레코드 예산을 공유하는지 확인합니다.

네이티브 검사는 물리 순서가 VersionLog10/2/0인 컨테이너에서 결과가 0/2/10이고 option 값도 각 항목과 맞는지 검사합니다. 정상 경로와 마지막 이력 항목의 공유 레코드 예산 부족 경로에 모든 할당 실패를 주입하고 원본 불변성과 메모리 정리를 확인합니다. HistoryLastDoc은 미소비 1개로 남고 미선택에서는 4개 스트림이 미소비로 남습니다.

## 적대적 검증 기록

- 경로/정렬: 직접 자식만 선택하며 수치 순서를 사용합니다. 서로 다른 option/길이의 항목으로 정렬 후 데이터 대응도 확인했습니다. 잘못된 접미사는 오류, 인식 범위 밖의 동명 스트림은 미소비입니다.
- 예산: 항목마다 한도가 초기화되지 않는지, 본문·ViewText·이력이 전역 레코드 한도를 공유하는지 확인했습니다. ViewText를 추가한 모델은 1,328개 한도에서 성공하고 1,327개에서 실패합니다.
- 손상/선택: CRC·압축/레코드/날짜 잘림을 전파하고 손상 뒤 원문 fallback을 하지 않습니다. 이력 검사를 선택하지 않으면 같은 스트림을 검사 완료로 표시하지 않습니다.
- 소유권: 정상 및 마지막 항목의 한도 실패 경로에서 모든 할당 실패를 주입했습니다. 반환 보고서에는 해제된 입력을 가리키는 포인터가 없으며 원본 CFB를 변경하지 않습니다.
- SSOT: 숫자 접미사 문법은 Section/VersionLog가 공유하고, 이력 payload·날짜·압축은 기존 모듈을 재사용합니다. 테스트 기대값은 독립 JS/zlib로 계산하고 기존 mode 25/제품 ABI를 유지합니다.

집중 검사 구성은 성공 15개·거부 22개입니다. 초기 테스트의 Buffer/Uint8Array 타입 차이로 발생한 불변성 assertion 실패는 양쪽을 Buffer로 비교하도록 수정했습니다. 바이트 손상이나 제품 파서 오류로 집계하지 않습니다.

## 실행 결과

최종 코드/테스트에서 Debug → ReleaseSafe → ReleaseFast 전체 audit를 순차 실행했습니다. 세 모드 모두 16/16 빌드 단계, 네이티브 299/299, Node 47/47 및 22/22, HWP5 WASM 검사 1,628,756건을 통과했습니다. 각 모드의 historyContainerResults도 성공 15·거부 22, 실파일 4항목·107,676바이트·28레코드로 일치합니다. 검사 건수는 지원 필드/파일 수가 아닙니다.

실행 로그는 `/tmp/hwpjs-history-container-debug.log`, `/tmp/hwpjs-history-container-safe.log`, `/tmp/hwpjs-history-container-fast.log`입니다. 로그는 로컬 임시 산출물이며 재현 명령은 [개발·검증 명령](development-commands.md)의 세 모드 audit입니다. ReleaseSafe/Fast의 실제 audit probe로 집중 검사도 별도 재실행했습니다.

ReleaseSafe probe에서는 추가 수동 경계 검사로 잘못된 mode/start/date 값 3개와 선택 헤더의 0~18바이트 잘림 19개가 InvalidMode/UnexpectedEnd로 거부되는 것을 확인했습니다. 이 22건은 위 자동 audit 검사 건수에 포함하지 않습니다. Zig 포맷, 변경 JS 구문, 변경 문서의 로컬 링크, git diff 공백 검사도 통과했습니다.

## 남은 범위

이력별 암호화, 다른 저장 방식/버전, HistoryLastDoc와 LASTDOCDATA 연결, DiffML/HWPML 의미·이력 재생·복원·편집/저장은 남아 있습니다. 이번 연결로 선택한 VersionLog 검사는 컨테이너에서 실행되지만 전체 문서 이력이 유효하거나 복원 가능하다고 주장하지 않습니다.
