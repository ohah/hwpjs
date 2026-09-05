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

현재 실행 결과: Debug/ReleaseSafe/ReleaseFast audit에서 네이티브 14개·Node/WASM 37개 통과(37개 중 3개는 승인 대기 차이를 기록하는 재현 테스트). Chromium에서는 실제 HWP 48개·452개 스트림에 대한 엄격 비교와 합성 입력 16조합·커서 읽기, 검색 수명 264건을 검증합니다.

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
