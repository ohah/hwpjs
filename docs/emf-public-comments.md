# EMF public comments

## 책임과 wire 경계

`public_comment.zig`는 공통 [COMMENT envelope](emf-comment-envelope.md)가 `EMR_COMMENT_PUBLIC`으로 분류한 입력만 dispatch합니다. 공개 식별자 값은 `public_comment_identifier.zig`, 그룹 payload와 중첩 상태는 `public_comment_group.zig`, `EmrFormat` 한 항목은 `emr_format.zig`, MultiFormats 배열 조립은 `public_comment_multiformats.zig`, embedded WMF envelope는 `public_comment_windows_metafile.zig`가 각각 소유합니다. 공통 `DataSize`, alignment padding, record 후행 확장은 하위 파서가 다시 계산하지 않습니다.

공식 `EmrComment` 값 중 BeginGroup `0x00000002`, EndGroup `0x00000003`, MultiFormats `0x40000004`, Windows Metafile `0x80000001`을 해석합니다. 사용 금지된 Unicode String `0x00000040`과 Unicode End `0x00000080`은 오류입니다. 그 밖의 값은 인쇄 서버가 추가 공개 형식을 구현할 수 있다는 명세의 SHOULD 예외 때문에 버리지 않고 원시 식별자와 body를 보존합니다.

BeginGroup은 RectL, `nDescription`, 정확히 그 수만큼의 UTF-16LE code unit을 읽습니다. 0이면 설명이 부재하고, 0보다 크면 유효한 UTF-16이며 마지막 하나만 NUL이어야 합니다. EndGroup은 추가 parameter를 허용하지 않습니다. framing의 별도 상태는 중첩 깊이·시작/끝 수·최대 깊이를 세고, 선행 시작 없는 끝과 EOF까지 닫히지 않은 그룹을 거부합니다.

MultiFormats는 RectL, 형식 수, 16바이트 `EmrFormat` 배열과 뒤의 FormatData를 분리합니다. 각 항목은 Signature, Version, SizeData, offData를 보존합니다. 공식 Enhanced Metafile `0x464D4520`과 EPS `0x46535045`를 분류하고 EPS일 때만 Version 1을 강제합니다. 그 밖의 signature는 raw 값과 데이터를 보존하고 unknown으로 집계합니다. 이는 LibreOffice가 Microsoft Office의 관측 `PDF ` signature/Version 0을 별도로 지원하는 호환성 사례를 구조 파서가 손실하지 않기 위한 것이며, PDF 해석 지원을 뜻하지 않습니다. offData는 CommentIdentifier 시작 기준이고 4바이트 정렬이어야 합니다. 배열 순서대로 각 범위가 정확히 이어지고 SizeData 합이 전체 FormatData 크기와 같아야 합니다. 반환 iterator와 데이터 slice는 입력을 빌리며 형식 수만큼 할당하지 않습니다.

Windows Metafile은 외부 Version 0x0100/0x0300, Reserved 0, Checksum 원값, Flags 0, WinMetafileSize와 정확한 buffer를 검사합니다. buffer는 Placeable 확장이 아닌 18바이트 표준 META_HEADER로 시작해야 하며 기존 WMF generic record framing을 재사용해 유일한 META_EOF와 MaxRecord를 검증합니다. 공식 문서는 Checksum의 알고리즘이나 MUST 검증 규칙을 정의하지 않으므로 값을 보존하지만 임의 알고리즘을 만들어 일치 검증하지 않습니다. 외부 Version과 내부 META_HEADER Version의 동일성도 명세가 요구하지 않아 각각 보존합니다.

## 명세 근거

- [MS-EMF 2.3.3.4 Public Comment Record Types](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/39c91f22-e4cc-4e82-a605-0137caa8457c)
- [MS-EMF 2.1.10 EmrComment](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/cd57866b-d2ef-49f0-9dd1-d928ddc02885)
- [MS-EMF 2.3.3.4.1 BeginGroup](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/9f0561a0-adfe-4a97-a452-99664787c1d2)
- [MS-EMF 2.3.3.4.2 EndGroup](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/11829e5d-d259-4179-b66b-bc2c7ab6b985)
- [MS-EMF 2.3.3.4.3 MultiFormats](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/4bc4608e-ca82-426d-ac0e-5ded2ad3fc4e)
- [MS-EMF 2.2.4 EmrFormat](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/1bd63563-ce67-4528-bf28-5a8852ff0270)
- [MS-EMF 2.3.3.4.4 Windows Metafile](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/0dbabbd2-c61d-4534-b526-b9431c494da8)
- [MS-WMF META_HEADER](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/d169108a-e3fe-436a-bb44-bea61a46ce56)
- [LibreOffice EMF reader의 Microsoft Office PDF signature 호환 경로](https://github.com/LibreOffice/core/blob/master/emfio/source/reader/emfreader.cxx)

## 검증과 미구현 경계

단위 테스트는 모든 고정 prefix 잘림, 식별자 인접/예약/미지 값, UTF-16 종결·내부 NUL·고립 surrogate, 그룹 중첩/underflow/미종결과 상태 변경 원자성, CountFormats 과대값, descriptor 잘림, 공식/미지 Signature·EPS Version, 정렬되지 않거나 겹치거나 빈틈이 있는 offData, 데이터 합계, 표준 WMF 헤더·크기·EOF·MaxRecord를 검사합니다. 전체 EMF 테스트는 중첩 그룹 보고서와 unknown 공개 형식 보존, 두 상태 오류가 framing에서 전파되는지 확인합니다.

적대적 검토를 다섯 차례 나누어 명세 필드/상태, 정수 범위, 실제 호환성, 상위 framing 연결, SSOT·수명을 대조했습니다. 그 과정에서 UTF-16 surrogate와 내부 NUL 검사, overflow 실패 시 그룹 상태 원자성, iterator 곱셈 범위, 관측 vendor signature 보존을 보강했습니다. 격리 복사본에서 (1) 예약 ID 거부, (2) 그룹 EOF 미종결, (3) offData 기준점, (4) WMF Reserved, (5) WMF MaxRecord, (6) UTF-16 유효성, (7) vendor signature 보존, (8) FormatData 합계, (9) framing의 public dispatch, (10) WinMetafileSize, (11) EPS Version 검사를 각각 제거했습니다. 각 복사본은 실행마다 별도 local/global Zig cache를 사용했고 Debug·ReleaseSafe·ReleaseFast의 유효한 33/33회가 컴파일 후 관련 테스트 실패로 결함을 검출했습니다. 테스트가 수집되지 않은 좁은 filter 시도와 컴파일 자체를 깨뜨린 변형은 이 수치에 포함하지 않았습니다. 로그는 `/tmp/hwpjs-emf-public-{reserved,finish,offset,wmfreserved,wmfmax,utf,extension,datasum,routing2,wmfsize2,eps2}-*.log`입니다.

최종 세 모드 전체 `audit`는 각각 40/40 단계와 1484/1484 테스트가 통과했습니다. 이 중 공통 native test는 1445개이고 별도 차트 31개, WMF 8개가 추가됩니다. CFB 12,000회 변이 trap 0, 584개 HWP의 2,167개 BinData 조사, Zig format·JS·문서 링크 검사도 같은 audit에 포함됐습니다.

MultiFormats 안의 Enhanced EMF/EPS 내용을 재귀적으로 해석하거나 EPS를 실행하지 않습니다. Windows Metafile의 개별 record payload·Object Table·렌더링도 이번 계층의 완료 범위가 아닙니다. EMF+와 EMFSPOOL comment stream은 계속 별도 후속 파트이며, HWP corpus에서 EMF signature 표본이 발견되지 않았으므로 실제 HWP public comment 동등성을 주장하지 않습니다.
