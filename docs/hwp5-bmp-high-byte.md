# HWP5 BMP 32비트 상위 바이트 관측

## 의미 경계

`image/bmp/rgb32_high_byte.zig`는 이미 검증한 `structure.View`에서 `BI_RGB`·32 bpp의 저장 픽셀 네 번째 바이트만 셉니다. `images`, `zero`(0x00), `ff`(0xff), `other`(나머지)의 비할당 통계이며, 다른 BMP 형식은 모두 0입니다. 저장 행의 방향은 분포에 영향을 주지 않습니다. 헤더·행 길이·픽셀 범위를 다시 파싱하지 않습니다.

`container/bmp_images.zig`는 성공적으로 RGBA를 복원한 뒤 이 관측값을 `rgb32_high_byte_*` 스칼라에 더합니다. 다른 이미지 형식의 카운터·예산은 변경하지 않습니다. 가산 overflow 또는 뒤의 검사가 실패하면 상위 `images.Budget` 보고서는 교체되지 않습니다. 테스트 전용 WASM 응답과 제품 JS ABI는 이 통계를 내보내지 않습니다.

[Microsoft BITMAPINFOHEADER 문서](https://learn.microsoft.com/en-us/previous-versions/dd183376(v=vs.85))는 32 bpp `BI_RGB`의 상위 바이트가 사용되지 않는다고 명시합니다. 한편 [GDI Alpha Blending 문서](https://learn.microsoft.com/en-us/windows/win32/gdi/alpha-blending)는 메모리의 32 bpp `BI_RGB`를 알파 합성할 때 같은 바이트를 픽셀별 alpha로 다룹니다. 이 두 사용 경로는 다릅니다. 파일 바이트 분포만으로 한글 프로그램의 표시 경로를 판정하지 않습니다. 따라서 [기존 BMP RGBA 정책](bmp-pixels.md)의 `alpha=255`를 바꾸지 않으며, `ff`는 '불투명 픽셀 수'가 아니라 **원본 값이 0xff인 픽셀 수**입니다. `other`도 곧바로 반투명 픽셀 수가 아닙니다.

## 실제 HWP 검증과 한계

`reference/rhwp/samples/hwpx/hancom-hwp/hang_job_01.hwp`의 SHA-256은 `c8b091cc9edf63433a7d21729d675f8fad7f68fc8f09d74b6c0f138fb91de46f`입니다. DocInfo가 선언한 BMP 7건 모두 INFO 40바이트·32 bpp·`BI_RGB`이며, 압축 해제 후 저장 바이트와 독립 JS 조사기의 픽셀 CRC를 Zig가 항목별 대조합니다. 7건 총 1,067,410픽셀 중 상위 바이트는 0x00이 0개, 0xff가 1,062,880개, 그 밖이 4,530개입니다. 제품 HWP 컨테이너의 선택적 BMP 통계도 이 합계와 일치합니다. 파일 자체와 일곱 BMP의 개별 수치가 고정돼 있어 corpus 변경을 조용히 통과시키지 않습니다.

검증 명령은 [개발 명령](development-commands.md)에 둡니다. 실파일 검사는 로컬 `reference/rhwp`가 필요하고 기본 audit에는 포함되지 않습니다. 이 수치가 증명하는 것은 선언·압축·컨테이너 연결·BMP 바이트 및 현재 RGBA 정책과의 일치이지, 원본 한글 화면의 색/투명도 동일성은 아닙니다. 화면 의미를 확정하려면 같은 문서를 한글 프로그램에서 렌더링한 대조 자료와 해당 그림의 합성 설정을 확보해야 합니다.

## 적대적 검증 기록

- 합성 BI_RGB32의 0x00/0xff/그 외 바이트를 서로 구별하고, top-down 행에서도 분포가 그대로임을 확인했습니다. 8 bpp 색인 BMP와 명시적 알파 마스크가 있는 32 bpp BI_BITFIELDS는 관측 대상에서 제외합니다.
- 동일 BMP를 두 번 소비하면 각 카운터가 두 배가 되고, RGBA 예산 초과·카운터 overflow·파싱 실패 시 상위 보고서가 이전 값으로 남는 기존 원자성 검사를 통과했습니다. BMP 픽셀 디코더의 상위 바이트 무시 계약도 기존 테스트에서 유지됩니다.
- 실제 HWP의 독립 Node 조사와 Zig의 개별 CRC·상위 바이트 대조는 각각 통과했습니다. 선택적 Zig 실파일 검사 2/2, Debug 전체 `zig build test --summary all` 2,484/2,484, ReleaseSafe `zig build audit -Doptimize=ReleaseSafe --summary all` 종료 코드 0, ReleaseSafe 제품 빌드 5/5를 확인했습니다. Debug 전체 실행 이후 BI_BITFIELDS 배제 반례를 추가했으며, 이 반례는 별도 Debug 필터와 후속 ReleaseSafe audit에서 통과했습니다.
- 실파일 CRC 일치는 현재 디코더와 독립 oracle이 같은 `BI_RGB32` 파일 해석을 따름을 증명하지만, 실제 한글 화면이 4,530개의 비-0xff 바이트를 투명도에 사용하는지 판정하지 않습니다.
