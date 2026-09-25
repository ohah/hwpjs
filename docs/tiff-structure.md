# TIFF 6.0 구조 검사

`src/image/tiff/structure.zig`는 고전 TIFF의 바이트 순서, 값 42, 첫 IFD와 후속 IFD 연결, 태그 정렬, 알려진 필드 타입의 값 범위, strip/tile offset·byte-count 쌍의 범위를 검사합니다. 근거는 [TIFF 6.0 원문 2절](https://www.itu.int/itudoc/itu-t/com16/tiff-fx/docs/tiff6.pdf)의 8바이트 헤더, 12바이트 IFD 항목, 값의 인라인/외부 위치와 strip 정의입니다. `image/tiff` 식별은 [RFC 3302](https://datatracker.ietf.org/doc/html/rfc3302)를 따릅니다. 로컬 문서에서 관측된 `image/tif`는 별도 호환 표기이며 정식 MIME과 혼동하지 않습니다.

`inspect(bytes, options)`는 파일을 빌려 검사하고 할당하지 않으며 바이트 순서·IFD/필드/strip/tile 수와 첫 압축값을 스칼라 보고서로 반환합니다. IFD의 다음 offset이 0이 될 때까지 방문하고, 중복 offset은 순환으로 거부합니다. 필드 타입 1~12의 byte width로 외부 값 범위를 계산하고, 아직 정의되지 않은 타입은 값을 추정하지 않고 `unknown_types`에 셉니다. 미지 타입은 길이를 알 수 없어 해당 값 포인터의 범위도 검증하지 않습니다. strip/tile의 offset·byte count는 둘 다 있을 때 개수·자료형·범위를 대조하며, 한쪽만 있으면 오류입니다. byte count와 offset이 범위 안에 있다고 해서 이미지 내용이나 압축 해제가 성공했다는 뜻은 아닙니다. 모든 IFD가 이미지 데이터를 가진다고 가정하지 않아 strip/tile 쌍이 둘 다 없는 IFD는 이 계층에서 허용합니다.

기본 한도는 파일 64MiB, IFD 1024개, 총 필드 100만 개, 총 strip/tile 블록 10만 개입니다. 클래식 TIFF의 32비트 파일 범위도 넘지 못합니다. 순환·정렬·오프셋·필드·데이터 범위 오류는 오류로 반환하며, HWPX 이미지 검사 계층은 ZIP 오류와 분리해 대상별 `inspection_error`에 남깁니다. `image/tiff`/`image/tif` 선언만으로 TIFF라고 판정하지 않고 `II 2A 00` 또는 `MM 00 2A` 바이트로 선택합니다. BigTIFF의 버전 43은 이 계층에 포함되지 않습니다.

독립 Python ZIP/OPF/XML 조사에서 선택 section 그림 TIFF 대상은 6개(리틀엔디언 5개, 빅엔디언 1개)이며, 한 개는 압축값 5(LZW), 다섯 개는 1(비압축)입니다. IFD가 이미지 데이터 뒤쪽에 있는 대상도 4개입니다. 같은 길이와 헤더를 가진 대상 두 개도 실제 바이트는 서로 달라 별도 manifest 항목으로 셉니다. 독립 구조 검사에서는 여섯 대상 모두 통과했습니다. [그림 이미지 바이트 검사](hwpx-picture-image-payloads.md)의 실파일 shard는 이 구조 결과를 Zig 제품 검사와 대조합니다. 픽셀 복호화, LZW 해제, 색·해상도·ICC·Exif 및 SubIFD 포인터 의미, tiled 이미지의 렌더링, 다중 페이지 선택·표시·저장은 아직 검증하지 않습니다.

## 검증과 적대적 재검토

`zig test src/root.zig --test-filter 'TIFF structure'`는 Debug·ReleaseSafe·ReleaseFast 각각 6/6 통과했습니다. 합성 반례에는 두 바이트 순서, IFD가 이미지 앞/뒤에 있는 경우, 후속 IFD·순환, 태그 역순, 헤더·IFD 잘림, 미지 타입 보존, 인라인 값과 외부 strip 배열, 두 엔디언의 외부 배열, strip 쌍 누락·범위·개수 오류, 정확한 데이터 블록 한도를 포함합니다. HWPX 연결 테스트도 세 모드에서 각각 10/10 통과했습니다.

독립 `python3 tools/hwpx-fill-brush-image-oracle.py --self-test`와 `--picture-payloads`가 통과했고, ReleaseFast 실파일 shard 0~7이 모두 독립 기대값과 일치했습니다. TIFF는 shard 3/6/7에 각각 3/1/2개이며 Zig 구조 오류는 모두 0건입니다. 최종 전체 Debug `zig build test --summary all`은 종료 코드 0·5/5 단계·2,462/2,462 테스트, ReleaseSafe 제품 빌드와 전체 감사도 종료 코드 0입니다. 빌드 출력의 `failed command` 러너 문구는 최종 성공 요약과 구별합니다.

적대적 재검토에서 strip과 tile을 따로 세면 합계 한도를 우회할 수 있는 경로를 발견해 같은 `max_data_blocks` 예산으로 묶었습니다. 길이·헤더가 같은 두 실파일을 같은 바이트라고 오인한 문서 진술도 실제 ZIP payload 비교로 바로잡았습니다. 미지 필드 타입의 외부 값 범위, 압축·픽셀, 중첩 IFD 의미는 이 검사가 확인하지 않는다고 명시합니다.
