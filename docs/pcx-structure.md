# PCX 헤더·RLE 경계 검사

`src/image/pcx/structure.zig`는 파일 바이트를 빌려 PCX 128바이트 헤더와 RLE 스트림을 할당 없이 검사합니다. 근거는 [ZSoft PCX 기술 참조 문서 원문 미러](https://files.mpoli.fi/unpacked/software/programm/general/gcgpe10.zip/pcx.txt)의 헤더·RLE 설명과 [IANA PCX 미디어 등록](https://www.iana.org/assignments/media-types/image/vnd.zbrush.pcx)입니다. 등록 MIME은 `image/vnd.zbrush.pcx`이며 `image/x-pcx`는 폐기된 별칭입니다. 이 corpus의 `image/pcx`는 관측된 비표준 선언으로 별도 허용하고, 포맷 자체의 공식 MIME이라고 주장하지 않습니다.

`inspect(bytes, options)`는 버전 0/2/3/4/5, RLE 인코딩 1, plane당 1/2/4/8비트, 1~4개 plane, 좌표 순서와 짝수 `BytesPerLine`이 표시 폭의 최소값 이상인지 검사합니다. RLE의 각 packet을 읽어 `height × planes × BytesPerLine`에 **정확히** 도달해야 하며 0회 반복, 값 누락, 부족·초과 출력을 거부합니다. 반복은 같은 행의 plane 경계를 넘을 수 있지만 ZSoft 명세에 따라 스캔라인 경계는 넘지 못합니다. 버전 5의 8비트 단일 plane에는 0x0c+768바이트 VGA 팔레트 꼬리를 선택적으로 허용하고, 그 밖의 설명되지 않은 꼬리는 거부합니다. 팔레트 내용·색 해석, 실제 픽셀 배열, 화면 렌더링은 검사하지 않습니다. 개별 파일 기본 64MiB, 해제 길이 기본 256MiB와 HWPX 보고서 전체 256MiB 제한을 적용합니다.

독립 ZIP/OPF/XML 조사에서 선택 section 그림 PCX는 1개이며 `reference/rhwp/samples/복학원서.hwpx`의 `BinData/image1.PCX`입니다. 헤더는 버전 5, 1비트/1 plane, 878×1001, plane당 110바이트/행이며 RLE 41,187바이트가 110,110바이트로 정확히 풀립니다. palette 꼬리는 없습니다. `unzip -p ... BinData/image1.PCX | file -`도 PCX 버전 3.0 제품 계열·좌표 `[0,0]–[877,1000]`·1비트·RLE를 독립 식별했습니다. Zig의 [HWPX 그림 바이트 검사](hwpx-picture-image-payloads.md)와 독립 Python 조사기는 이 결과를 분리해 대조합니다. 이 성공은 그림 배치·출력·색상·편집·저장, HWP BinData PCX 연결이나 전체 HWPX 의미 검증이 끝났다는 뜻이 아닙니다.

## 검증·적대적 재검토

`zig test src/root.zig --test-filter 'PCX structure'`는 버전·헤더·geometry·최소 선 길이·짝수 패딩·RLE 경계·한도·VGA palette를 검사합니다. Debug·ReleaseSafe·ReleaseFast에서 각각 5/5 통과했습니다. `HWPX picture image payloads` 테스트는 MIME 불일치·내부 오류 분리·누적 해제량 한도를 검사하며 세 모드에서 각각 12/12 통과했습니다. `python3 tools/hwpx-fill-brush-image-oracle.py --self-test`의 독립 반례도 통과했고, `--picture-payloads`는 shard 7의 PCX 1건을 `ok`로 집계했습니다. 제품의 동일 실파일 결과는 `HWPX known document inspections shard 7`에서 대조합니다.

최종 ReleaseFast 실파일 shard 0~7은 모두 통과했고, PCX 대상은 shard 7에서만 1건·내부 검사 실패 0건이었습니다. 최종 `zig build test --summary all`은 종료 코드 0·5/5 단계·2,468/2,468 테스트였고, `zig build -Doptimize=ReleaseSafe --summary all`도 5/5 단계로 통과했습니다. `zig build audit -Doptimize=ReleaseSafe --summary all`도 종료 코드 0으로 통과했습니다. 전체 Debug 출력의 `failed command` 러너 문구는 최종 성공 요약·프로세스 종료 코드와 구별합니다.

적대적 검토에서 개별 PCX만 제한하면 여러 내장 이미지가 합계 해제량을 우회하는 점을 확인해 공유 이미지 보고서에 누적 예산을 추가했습니다. 최초 구현은 출력 총량만 맞는 행간 RLE 반복을 허용했으나, 원문에서 행 끝의 decoding break를 확인하고 Zig·독립 조사기에 행 경계 거부 반례를 추가했습니다. VGA 팔레트가 존재할 때 RLE가 그 바이트를 이미지 데이터로 잘못 소비하지 않도록 769바이트 꼬리를 먼저 분리합니다. 버전만 손상된 파일을 `unknown`으로 숨기지 않도록 magic과 encoding 단서를 함께 쓰는 분류로 넓혔습니다. `image/pcx` 선언만으로 PCX라 판정하지 않고 실제 바이트를 사용합니다. PCX 1개 실파일만으로 모든 PCX 버전·팔레트 변형 호환성을 입증하지 않습니다.
