# CFB 1.2.0 소스 대조

기준은 저장소 `legacy/cfb.js`입니다. ZIP/MIME 감지와 CFB writer는 이번 범위 밖입니다. 제품에서 레거시 JS 파서를 호출하지 않습니다. 라이선스는 저장소 고지에 따라 Apache-2.0이며, 커서 메서드 이식도 `THIRD_PARTY_NOTICES.md`에 기록합니다.

## 함수·분기 대응

| 레거시 함수/분기 | 현재 책임 | 검증 및 남은 차이 |
|---|---|---|
| `parse`, `read` | `src/cfb/reader.zig`, `js/cfb.mjs`, `input.mjs` | buffer/array/binary/base64, nullable options; 비정상 입력의 강제 변환은 차이 유지 |
| `check_get_mver`, `check_shifts` | `header.zig` | v3/v4, minor/BOM/CLSID 허용, 시그니처·shift·예약·cutoff·v3 count 오류 메시지 직접 대조 |
| `sectorify` | `sectors.zig`, `cfb_raw.zig`, `output-bytes.mjs` | 전체 raw 바이트, Buffer/Array/Uint8Array 표현; 원본과의 메모리 별칭은 복제하지 않음 |
| `sleuth_fat` | `allocation.zig` | 확장/다중 DIFAT, 마커 검증; 손상 체인 거부는 별도 차이 |
| `make_sector_list`, `get_sector_list` | `allocation.zig` | 일반/단편 스트림; 순환·공유 점유 오류는 별도 차이 |
| `get_mfat_entry` | `streams.zig` | v3/v4, 64바이트 경계, 단편화 전체 바이트; 조기 종료 시 조용한 잘림은 복제하지 않은 상태 |
| `read_directory` | `directory.zig`, `directory_name.zig`, `streams.zig` | 메타데이터, 이름, unused/storage/stream content 속성 존재; v4 u64와 엄격한 이름/참조 검사는 차이 유지 |
| `read_date` | `cfb-entry.mjs` | 0 및 상위 비트 포함 FILETIME의 속성 유무·Date 밀리초 값 정확 비교 |
| `build_full_paths` | `directory_tree.zig`, `path_builder.zig` | 부모 우선 트리/중첩 경로 일치; 부모가 뒤에 있는 순서에서 레거시 경로 손실 재현 |
| `find` | `find.zig`, `cfb_search.zig` | Unicode·NUL·제어문자·루트 상대·이름 검색, 4개 수명 단계; 이름/경로를 호출자가 변경한 객체는 미지원 |
| `prep_blob`, `ReadShift`, `WriteShift`, `CheckField` | `blob-cursor.mjs` | JS 복사본의 속성·정수/hex 읽기·쓰기·커서 이동·검사 오류; CFB parser 규칙을 포함하지 않음 |
| `parse` 반환 객체 | `cfb-entry.mjs`, `output-bytes.mjs` | 속성 존재, JS 타입, Buffer brand, 바이트, 날짜; 함수는 별도 동작 테스트 |

## 검증 방식

`tests/cfb/exact-result.mjs`는 없는 속성을 빈 값으로 치환하지 않습니다. enumerable own keys, 타입/바이트 표현, 값, Date 밀리초를 재귀 비교합니다. 함수 객체 자체의 동일성은 요구하지 않고 커서 동작 테스트로 검증합니다. 입력 원본과 반환 버퍼 간 alias, prototype 전체, 함수 identity까지 같은 API라는 주장은 하지 않습니다.

`exact.test.mjs`는 실제 HWP 48개, v3/v4 빈·미니·일반 스트림의 입력 표현 55조합, 비표준 허용 헤더, FILETIME, 10개 헤더 실패 메시지, 빈 스트림 및 unused slot의 content 존재를 검사합니다. 기존 60개 컨테이너 차등 비교와 768개 독립 바이트 oracle도 유지합니다. 브라우저도 같은 엄격 비교 함수를 사용합니다.

이전 실행 결과: Debug/ReleaseSafe/ReleaseFast audit에서 네이티브 14개·Node/WASM 37개 통과(37개 중 3개는 승인 대기 차이를 기록하는 재현 테스트). Chromium에서는 실제 HWP 48개·452개 스트림에 대한 엄격 비교와 합성 입력 16조합·커서 읽기, 검색 수명 264건을 검증했습니다. 아래 명세 대조 회차에서는 fixture 회귀 검사를 추가하여 ReleaseSafe 네이티브 14개·Node/WASM 38개를 재실행했고 모두 통과했습니다. 브라우저와 다른 최적화 모드는 이번 회차에 재실행하지 않았습니다.

SSOT는 제품의 규칙에 적용합니다. content 존재 여부·FAT 분류·헤더 진단·검색 규칙은 Zig에 있습니다. ABI는 JS 스키마로부터 Zig 선언을 생성하고 빌드 시 일치 검사합니다. 테스트의 정답은 제품 스키마나 parser에서 생성하지 않습니다.

## 재현된 예외 후보 — 승인 대기

아래는 기존 제품 동작의 차이를 재현·기록한 것이며, 사용자가 예외를 모두 승인했다는 뜻이 아닙니다. 이번 회차에서 이를 레거시 버그와 같게 바꾸거나 거부 범위를 새로 넓히지 않았습니다.

| ID | 입력 | 레거시 관측 | 현재 관측 | 제안 |
|---|---|---|---|---|
| E1 | 디렉터리 A↔B 순환 | VM 200ms 제한으로 중단 | `CyclicDirectory` | 무한 처리 대신 거부 |
| E2 | 129바이트 스트림의 MiniFAT이 64바이트 뒤 종료 | size=129, content.length=64로 성공 | `InvalidMiniSector` | 데이터 잘림을 성공으로 숨기지 않고 거부 |
| E3 | 부모 Folder가 자식 A/B보다 뒤에 배치 | B 경로가 `B`로 반환 | `Root Entry/Folder/B` | 올바른 부모 경로 유지 |

`exceptions.test.mjs`와 독립 `exception-fixtures.mjs`로 세 경우를 재현합니다. 손상 파일은 VM 시간 제한 안에서만 레거시에 전달합니다. E3는 공개 이슈 #15와 같은 부모/형제 순서 문제를 독립 fixture로 확인한 것이며, 이슈 첨부 파일을 사용한 것은 아닙니다.

기타 기존 차이도 포괄 승인하지 않습니다: v4 directory count/FAT 마커·이름·참조의 추가 검증, v4 u64 크기와 자원 제한, JS 비정상 바이트/인코딩 거부, 변경된 결과 메타데이터 검색, raw 원본 alias. 특히 이 차이 전부를 “레거시 버그”라고 부르지 않습니다. 필요한 호환 범위와 실제 파일 근거를 정한 뒤 개별 결정해야 합니다.

따라서 이번 변경은 반환 형태와 확인한 읽기 분기 호환성을 높인 작업이며, 모든 가능한 입력에 대한 100% 호환 완료 선언이 아닙니다.

## 공식 MS-CFB 대조 — 2026-09-05

기준은 Microsoft가 게시한 [MS-CFB revision 12.0, 2024-04-23](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-cfb/53989ce4-7b05-4f8d-829b-d08d6148375b)과 해당 페이지의 [공식 PDF](https://winprotocoldocs-bhdugrdyduf5h2e4.b02.azurefd.net/MS-CFB/%5BMS-CFB%5D.pdf)입니다. 제품 코드 기준은 `eb74d53e`이며, 이번 변경은 재현 fixture와 문서만 수정합니다.

결론: **CFB 읽기는 구현되어 있지만, 명세 전체 지원 또는 완전한 적합성 검증기는 아닙니다.** 레거시 출력 일치와 명세 적합성은 별도 기준입니다. 잘못된 파일을 수용한다는 사실만으로 정상 파일의 읽기 실패나 메모리 안전성 결함이 입증되는 것은 아닙니다.

| 명세 영역 | 구현된 부분 | 남은 부분 / 차이 |
|---|---|---|
| §2.1–2.2 구조·헤더 | v3/v4, 바이트 해석, shift·예약 필드·cutoff·시그니처 검사 | CLSID/BOM은 레거시 호환을 위해 허용. v4 헤더 패딩 검사 없음 |
| §2.3 FAT | 연결·범위·순환·공유 점유·FAT 역할 검사 | EOF 이후 FAT 항목, 참조되지 않은 할당 영역의 전역 일관성 검사 없음 |
| §2.4 MiniFAT | 64바이트 추출, 단편화·범위·공유·조기 종료 검사 | 선언된 MiniFAT 섹터 수보다 긴 실제 체인 수용 |
| §2.5 DIFAT | 확장/다중 DIFAT·FAT 수·역할 검사 | 종료 상태에서 ENDOFCHAIN뿐 아니라 FREESECT도 허용 |
| §2.6 디렉터리 | 메타데이터 해석, UTF-16·이름 종료·금지 문자, 종류·참조·고아·순환 검사 | 종류별 0 필드, Root Entry 이름, unused 필드, 형제 이름 중복·정렬·연속 red 검사 없음 |
| §2.6.4 이름 비교 | `find.zig`에 레거시 검색 규칙 단일화 | JS 전체 대문자 변환은 명세의 길이 우선·UTF-16 단위 simple 변환과 다름 |
| §2.7 사용자 스트림 | 일반/MiniFAT 원본 바이트 추출 | CFB 생성·추가·삭제·편집 후 직렬화는 미구현 |
| §2.8–2.9 대용량·제한 | 입력/스트림 기본 256 MiB 등 자원 제한 | 2 GiB 경계 Range Lock 전용 처리 없음. 명세 최대 크기 지원 아님. 최소 3개 전체 섹터 검사 누락 |

헤더 조건은 [§2.2](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-cfb/05060311-bfce-4b12-874d-71fd4ce63aea), 엔트리 필드는 [§2.6.1](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-cfb/60fe8611-66c3-496b-b70d-a504c94c9ace), 비교·트리 조건은 [§2.6.4](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-cfb/d30e462c-5f8a-435b-9c4c-cc0b9ea89956)를 대조했습니다. Range Lock은 코드 미구현 확인이며 2 GiB 초과 파일을 실측한 결과는 아닙니다.

### 실제 수용을 확인한 변이

Node 24 / 실제 WASM `createCfbReader().parse()`에서 아래 17건이 모두 성공했습니다. 향후 거부하도록 변경할 수 있는 **미해결 관측**이며, 수용 동작을 유지해야 한다는 회귀 계약이 아닙니다.

처음 15건은 수정된 `directoryOrder(false)`의 새 복사본에 각각 한 행만 적용했습니다. `D = 8192`, `E(i) = D + 128*i`. 별도 표시가 없으면 정수는 little-endian입니다.

| 변이 | 변경 위치 / 값 |
|---|---|
| v4 헤더 패딩 | byte 512 = 1 |
| 헤더 CLSID | byte 8 = 1 |
| byte order | u16 28 = 0 |
| storage 시작 섹터 | u32 E(3)+116 = 1 |
| storage 크기 | u32 E(3)+120 = 1 |
| stream CLSID | byte E(1)+80 = 1 |
| stream 생성 시각 | byte E(1)+100 = 1 |
| root 생성 시각 | byte E(0)+100 = 1 |
| root 이름 | 첫 UTF-16 문자를 X로 변경 |
| unused 링크 | u32 E(4)+68 = 0 |
| 형제 이름 중복 | entry 2의 B를 A로 변경 |
| 형제 정렬 위반 | entry 2의 B를 0으로 변경 |
| 연속 red | byte E(1)+67 및 E(2)+67 = 0 |
| EOF 이후 FAT 할당 | u32 4096+100*4 = ENDOFCHAIN |
| 부재 DIFAT 시작값 | u32 68 = FREESECT |

나머지 2건은 `miniContainer()` 기반입니다.

- MiniFAT 개수 불일치: `miniContainer(3,64,false)`에서 unused 디렉터리 링크를 NOSTREAM으로 정리하고, 512바이트 섹터 하나를 추가합니다. FAT[2]를 새 섹터 ID로, 새 섹터의 FAT를 ENDOFCHAIN으로 바꿉니다. 헤더 mini_count=1인 채 실제 체인 2개를 수용했습니다.
- 최소 크기 위반: `miniContainer(3,0,false)`를 1152바이트로 자르고, mini_start=ENDOFCHAIN, mini_count=0, FAT[2]=FREESECT, root.child=NOSTREAM으로 설정했습니다. 디렉터리가 128바이트만 남은 파일도 수용했습니다. v3 명세 최소 크기는 1536바이트입니다.

별도 검색 실측: `directoryOrder(false)`의 entry 2 이름 B를 ß로 바꾼 뒤 `find(container,"SS")`가 ß 엔트리를 반환했습니다. 명세에서는 두 이름의 UTF-16 길이가 달라 같지 않습니다. 레거시 API 검색과 명세용 이름 비교를 혼동하면 안 됩니다.

### 잘못된 지적을 피해야 하는 항목

- v3 stream size 상위 DWORD 무시는 §2.6.3의 호환 요구에 맞습니다.
- minor 0x003E는 SHOULD입니다. MUST인 byte order와 같은 강도로 취급하지 않습니다.
- 모든 노드가 black인 트리는 명세가 허용합니다. 일반적인 red-black 균형 조건을 추가로 강제하면 안 됩니다.
- §2.7은 사용자 데이터 체인 용량이 stream size 이상인 것을 허용합니다. 여분 용량만으로 잘못된 파일이라고 단정하지 않습니다.
- transaction signature가 0이 아닌 것만으로 읽기를 거부할 근거는 없습니다.

### 이번 수정과 검증 범위

재현 fixture에서 storage 시작값을 0으로, unused 엔트리의 L/R/C를 NOSTREAM으로 고치고, 빈 스트림에 불필요했던 할당 섹터를 제거했습니다. 해당 필드를 직접 확인하는 회귀 검사도 추가했습니다. 수정 후에도 E1/E2/E3의 차이가 재현됩니다. E1/E2는 의도적으로 손상된 입력입니다.

`zig build audit -Doptimize=ReleaseSafe --summary all`: 네이티브 14개, Node/WASM 38개 통과. 컨테이너 60개·스트림 483개·검색 5496건 차등 비교 실패 0, 변이 12000건 trap 0. 실제 HWP 48개에 대한 반환 형태·스트림 바이트 비교도 통과했습니다. 이는 HWP 레코드/화면 렌더링 비교가 아니며 전체 명세 적합성의 증명도 아닙니다.

후속 구현은 메타데이터·할당표·이름 비교 각각의 코어 책임 안에서 진행해야 합니다. 엄격 검증과 레거시 호환의 충돌을 명시한 뒤 정책을 정하고, 같은 검사를 JS에 재구현하지 않습니다. 이번 비교만으로 기본 API의 거부 범위를 변경하지 않았습니다.
