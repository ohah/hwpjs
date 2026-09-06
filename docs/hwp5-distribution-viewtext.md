# 배포용 형태 ViewText 디코더

[ViewText 계약](hwp5-track-change-viewtext.md) · [컨테이너 계약](hwp5-document-contracts.md)

## 현재 지원 범위

`src/hwp5/distribution/`는 태그 28의 256바이트 배포 데이터에서 키를 유도하고 AES-128-ECB 블록을 복호화합니다. 압축형은 관측된 정렬·CRC·크기 블록을 검증한 뒤 해제된 바이트를 반환합니다. 비압축형은 복호화된 블록 전체를 반환하며 원래 길이를 추측해 패딩을 제거하지 않습니다.

이 디코더는 비밀번호/DRM 해제가 아니며 데이터 인증을 제공하지 않습니다. 배포용 플래그가 켜진 **문서 전체** 지원도 아직 아닙니다. `stream.requireSupported`는 기존 암호화/DRM/배포용 문서 게이트를 유지합니다. 따라서 전용 디코더의 성공을 컨테이너·문서 의미 검증의 성공으로 바꾸지 않습니다.

## 명세·참조와 실측의 구분

`legacy/rust/.claude/skills/hwp-spec/4-2-13-배포용-문서-데이터.md` 표 53은 태그 28·256바이트 배포 데이터를 정의하지만 키 유도·AES·꼬리 배치를 설명하지 않습니다. 참조한 rhwp `src/parser/crypto.rs`와 레거시 `document/distribution.rs`는 MSVC-LCG/XOR 키 유도와 AES-128-ECB 처리를 구현합니다.

키 유도는 MIT인 rhwp를 참고해 별도 파일로 옮겼으며 [제3자 고지](../THIRD_PARTY_NOTICES.md)와 [원문 라이선스](../licenses/rhwp-MIT.txt)를 포함했습니다. AES는 Zig 표준 라이브러리를 사용하고 추가 의존성은 없습니다. 레거시의 불완전 블록 채우기나 rhwp의 청크 채우기는 채택하지 않았습니다.

명세의 모든 스트림에 배포 데이터가 있다는 설명을 무조건 적용하지 않습니다. 아래 네 표본의 DocInfo는 일반 raw DEFLATE 해제로 태그 16·17부터 읽혔습니다. 이 조사에서는 ViewText의 배포 envelope를 별도로 다룹니다. 일반 DocInfo/BodyText/Scripts 디코더에 자동 복호화를 넣지 않습니다.

## SSOT·경계·소유권

- `envelope.zig`: 태그·256바이트 크기·레벨 0, 일반/확장 레코드 헤더와 암호문 경계. 기존 record.Iterator의 실제 raw 길이를 사용하며 payload 크기로 헤더 폭을 추산하지 않습니다.
- `key.zig`: 32비트 wrapping LCG와 마스크 run, 첫 네 seed 바이트 보존, 16바이트 키 추출. 첫 네 바이트에서도 run을 소비하므로 XOR 시작 위치만 옮기지 않습니다.
- `trailer.zig`: 압축 종료 뒤 16바이트 정렬용 0 패딩, CRC32 DWORD + 12개 0, ISIZE DWORD + 12개 0. 다른 길이·0이 아닌 패딩·검사값 불일치를 거부합니다. 이 관측 배치를 모든 배포용 변형의 유일한 명세라고 주장하지 않습니다.
- `decode.zig`: 블록 복호화, 기존 bounded raw_deflate.decodePrefix 호출, 꼬리 검증, 결과 소유권. 암호문과 출력 한도를 독립적으로 검사하고 실패 시 작업 버퍼와 출력을 해제합니다.

빈 암호문 또는 16바이트 배수가 아닌 암호문은 `InvalidDistributionBlockSize`입니다. 입력을 임의로 채우지 않습니다. 암호문 한도는 해독 버퍼 할당 전, 출력 한도는 비압축형에서는 할당 전/압축형에서는 해제 중 적용합니다. 오류 후 부분 결과는 반환하지 않습니다. 검사값이 틀린 경우 `InvalidChecksum`이며 압축 해제에 성공했다는 이유로 성공 처리하지 않습니다.

## ViewText 연결

`container/view_stream.zig`는 일반 및 확장 헤더의 정확한 태그 28·레벨 0·길이 256 시그니처를 먼저 확인합니다. 일치하면 전용 디코더, 아니면 기존 stream.decode를 한 번 호출합니다. 실패 후 다른 인코딩으로 재시도하지 않습니다. FileHeader의 compressed 비트는 해독 후 압축 해제 여부를 결정합니다. 헤더 서명만으로 선택하는 관측 정책이며 모호한 바이트열을 모든 포맷에서 판별한다는 보장은 아닙니다.

`container.Options.max_viewtext_ciphertext_bytes`는 ViewText 구역당 암호문 상한이며 기본 64 MiB입니다. 컨테이너 입력 크기 제한 및 문서 전체 해제 바이트·레코드 제한은 그대로 별도로 적용됩니다. `sections.decodeAt`은 ViewText 경로에만 이 디코더를 주입하고 BodyText 디코딩 책임은 바꾸지 않습니다. 결과는 기존 ViewText framing 검사로 전달되며 모든 payload의 의미 검증은 여전히 deferred입니다.

## 실제 표본 결과

| 표본 | FileHeader flags | 해제 바이트 | 레코드 |
|---|---:|---:|---:|
| `20250130-hongbo-no.hwp` | 5 | 15,540 | 306 |
| `20250130-hongbo.hwp` | 1 | 15,540 | 306 |
| `한글문서파일형식_5.0_revision1.3.hwp` | 131,077 | 2,142 | 34 |
| `issue5756/156732409_superscript_advance.hwp` | 5 | 30,378 | 706 |

네 파일에서 Node의 독립 BigInt 키 유도·AES·zlib 결과와 디코더 출력 전체 바이트가 일치하고 CRC/크기 블록도 맞았습니다. `20250130-hongbo.hwp`는 복호화된 ViewText가 BodyText와 바이트 단위로 같으며, mode 98 컨테이너 결과 `[0,1,1,306,15540,306]`을 확인했습니다. 이 파일의 잘린 암호문은 mode 25/98 모두 거부하고 원본 재처리는 복구됩니다. 나머지 세 파일은 배포용 플래그 때문에 일반 컨테이너 경로에서는 여전히 미지원입니다.

## 적대적 검증

`tests/hwp5/distribution-oracle.mjs`는 제품 helper를 쓰지 않는 BigInt LCG·Node AES/zlib/CRC 오라클입니다. `distribution.mjs`는 일반/확장 헤더, 256개 seed 조합, 16개 압축 종료 정렬 위치, 빈 출력, 모든 입력 잘림 위치, 잘못된 태그·레벨·길이, 꼬리의 각 바이트, 독립 암호문/출력 한도와 원본 복구를 검사합니다. 비압축형의 `0x10` 바이트 32개를 그대로 반환하는지도 확인해 PKCS#7 패딩 제거가 섞이지 않게 합니다.

네이티브 테스트는 성공·늦은 checksum 실패의 모든 할당 실패와 해제를 검사합니다. 컨테이너 통합에서는 배포 형태 비압축 ViewText의 모든 할당 실패, 암호문 한도 실패, 반환 보고서와 디코딩 버퍼 소유권을 확인합니다. 입력 CFB의 디렉터리 ID를 빈 항목이 제거된 toNodes 인덱스로 재사용하지 않습니다.

Debug/ReleaseSafe/ReleaseFast 순차 전체 감사는 각각 Node 47/47, WASM 1,382,347회를 통과했습니다. 최초 Debug 전체 감사의 네이티브는 264/264였고, 컨테이너 할당 실패 테스트 추가 후 Safe/Fast 및 최종 Debug 네이티브 재실행에서 265/265를 확인했습니다. 추가된 16개 정렬 위치의 합성 입력도 별도 Debug WASM 실행과 Safe/Fast 감사에서 통과했습니다. 전용 테스트 결과는 정상 513건·거부 347건과 네 실제 스트림 대조입니다. 포맷·JS 구문·diff·문서 링크·라이선스 원문 일치도 확인했습니다. 로그는 `/tmp/hwpjs-distribution-{debug,safe,fast}.log`, `/tmp/hwpjs-distribution-final-native-debug.log`입니다.

## 남은 범위

배포용 플래그가 켜진 문서의 primary ViewText 선택, BodyText/DocInfo 등 각 스트림 인코딩의 전체 정책, 다른 배포용 꼬리 형식, ViewText의 문단·필드·참조 의미 검증은 미완료입니다. 범용 비밀번호/DRM 지원이나 배포용 문서 전체 완료로 표시하지 않습니다.
