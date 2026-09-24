# HWPX 모든 ZIP 엔트리 바이트 무결성

`Document.inspectPayloadIntegrity(allocator, options)`는 패키지 ZIP의 **모든** 엔트리를 인덱스 순서로 정확히 한 번 해제하고, 기존 `Archive.decode`의 실제 길이·CRC 검사를 적용합니다. 선택된 header/section뿐 아니라 manifest의 BinData와 manifest 밖의 ZIP 엔트리도 포함합니다. 반환 바이트는 즉시 ZIP archive 할당자로 해제합니다. 검사 결과는 `PayloadIntegrityReport.deinit(allocator)`으로 해제하며, `unmanifested_entries`는 ZIP 인덱스 배열이므로 원본 `Document`가 살아 있을 때만 이름으로 역참조할 수 있습니다.

`manifested_entries`는 내장 OPF item이 가리킨 **서로 다른** ZIP 엔트리 수입니다. 동일 엔트리를 여러 OPF ID가 가리키면 `duplicate_manifest_bindings`에 추가합니다. `isEmbeded="0"` 외부 item은 `external_items`로 세되 네트워크/파일에 접근하지 않습니다. manifest 밖 항목은 오류로 가정하지 않고 ZIP 인덱스를 반환합니다. `mimetype`, OCF/OPF XML, `version.xml` 등도 OPF item이 아니면 이 목록에 포함될 수 있습니다. 이 분류는 media-type 일치, 이미지·폰트·OLE의 내부 포맷, XML 스키마, 실제 참조 사용 여부, 외부 링크 무결성을 **검증하지 않습니다**.

기본 엔트리별·총 해제 바이트 한도는 각각 512 MiB입니다. 총 한도는 모든 ZIP 엔트리에 대해 단일 카운터로 적용하며, 한도 초과는 `LimitExceeded`입니다. 입력 ZIP 인덱스의 별도 선언 크기 한도는 `inspectDocument`가 먼저 적용합니다. 실패 경로에는 부분 보고서를 반환하지 않습니다. 현재 `inspectKnown`은 보호 manifest의 암호화 분류 다음에 이 검사를 실행하므로 암호화 문서의 해제 바이트를 일반 문서로 검증하지 않습니다. 단독 `inspectPayloadIntegrity`는 ZIP 바이트 무결성만 보며 보호 의미를 해석하지 않습니다.

## 검증 범위

합성 패키지에서 모든 엔트리 해제·OPF 중복 ID 매핑·외부 item·manifest 밖 인덱스, 미참조 엔트리와 BinData의 CRC 변조, 엔트리별/총량 한도, 다른 report·ZIP 할당자, 소유권, 모든 할당 실패 지점을 검사합니다. 이 검사는 PNG라고 선언된 임의 문자열도 CRC만 맞으면 통과하도록 의도적으로 포맷 의미와 분리되어 있습니다.

2026-09-24 선택 실파일 조사에서 로컬 두 corpus의 HWPX 484개 중 ZIP 인덱스 거부 6개와 암호화 2개를 제외한 일반 문서 476개를 `inspectKnown`의 새 무결성 단계까지 검사했습니다. 보호된 2개는 이 단계에 진입하지 않습니다. 시스템 `unzip -tqq`로 **모든 484개 ZIP의 엔트리**를 독립 대조한 결과는 성공 478개·거부 6개였으며, 제품의 476개 일반 문서와 2개 보호 문서에 대한 ZIP 바이트 관측과 모순되지 않습니다. 이 대조는 동일 문서 내 media-type이나 XML 의미의 독립 검증이 아닙니다.

최종 소스에서 선택 실파일 8개 shard가 모두 통과했고, 각 문서는 `validated_entries == archive.entries.len` 및 `manifested_entries + unmanifested_entries.len == archive.entries.len`도 확인했습니다. 전용 6개 테스트는 Debug·ReleaseSafe·ReleaseFast 모두 통과했습니다. `inspectKnown` 통합 7개 테스트는 Debug·ReleaseSafe에서 통과했습니다. 전체 `zig build test --summary all`은 2,199/2,199 통과, `zig build -Doptimize=ReleaseSafe --summary all`, `zig build compare -Doptimize=ReleaseSafe --summary all`, Debug `zig build audit --summary all`, `zig fmt --check build.zig src`도 종료 코드 0이었습니다. 실파일 shard는 기본 audit에 포함되지 않습니다.
