# PNG 행 필터 복원

## 범위와 책임

`src/image/png/filter.zig`는 [PNG §9](https://www.w3.org/TR/png-3/#9Filters)의 method 0 필터 None/Sub/Up/Average/Paeth를 한 행의 packed bytes에 제자리 적용합니다. 파일·청크·zlib·색상 변환은 이 모듈에 넣지 않습니다.

`restore(kind, stride, row, previous)`의 row에는 필터 종류 바이트를 제외한 데이터만 전달합니다. previous는 이미 복원된 같은 길이의 별도 행이며 첫 행/새 Adam7 pass 시작은 null입니다. stride는 한 픽셀의 바이트 수를 올림한 값으로, 낮은 bit depth의 packed 픽셀은 1입니다. 1~8 범위를 허용하는 저수준 함수이며 특정 color/depth 조합이나 scanline 길이를 이 함수가 검증하지는 않습니다.

왼쪽 경계와 null 이전 행은 0입니다. Average는 u16 합계를 사용하고 Paeth는 i16 중간값을 사용합니다. Paeth 동점은 왼쪽→위→좌상단 순서이며 마지막 복원 합계만 modulo 256입니다. 16-bit sample도 두 바이트를 따로 복원하며 endian/sample 단위 합산으로 바꾸지 않습니다.

kind 5~255, stride 0/9 이상, 이전 행 길이 불일치, 이전 행과 목적 행의 메모리 중첩은 쓰기 전에 거부합니다. 모든 오류에서 row는 그대로입니다. 이전 행은 수정하지 않고 할당도 없습니다. 빈 행은 저수준 no-op으로 허용하지만, 상위 PNG 파서가 빈 pass의 필터 바이트를 소비해도 된다는 의미는 아닙니다.

## 검증

- Paeth 전체 256³=16,777,216 조합을 일반적인 최근접 후보 선택 oracle과 네이티브에서 대조합니다. 후보 동점은 기존 후보를 유지합니다.
- 고정 행으로 wrapping·Average 9-bit 합계·Paeth·첫 행을 확인합니다. 초기 Paeth 고정 기대값의 네 번째 바이트를 252로 잘못 적어 테스트가 실패했으며, 독립 JS 계산과 명세를 대조해 올바른 127로 수정했습니다. 제품 알고리즘을 기대값에 맞춰 변경하지 않았습니다.
- 오류 시 불변성, 동일/부분 중첩 양방향, 정확히 인접한 행, 빈 행, 전체 잘못된 필터 값을 검사합니다.
- 테스트 전용 WASM mode 129는 kind/stride/이전 행 존재(u8 각 1개), 행 길이(u32 LE), 선택적 이전 행, 필터링된 행을 받고 복원 행을 반환합니다. 외부 limit은 행 바이트 한도입니다.
- 독립 JS forward-filter가 알고 있는 원본 행을 필터링하고 WASM 복원 결과와 비교합니다. 필터 5종×stride 1~8×행 길이 0~65×이전 행 유무, 전체 바이트 값이 포함된 긴 행, 한도 정확/부족, 입력 잘림·후미·실패 후 정상 재호출을 확인합니다.

현재는 행 복원 계층만 구현했습니다. 실제 PNG 전체 이미지에서의 scanline 길이·Adam7 pass·palette 인덱스 검사와 zlib/청크 조립은 후속 범위입니다. 기존 structure.inspect의 pixels_validated=false는 바꾸지 않습니다.

최종 Debug·ReleaseSafe·ReleaseFast 전체 audit가 각각 17/17 단계, 네이티브 347/347, 감사 스크립트 3,160,304 checks를 통과했습니다. 필터 전용 WASM 결과는 정상 5,321건·거부 5,516건입니다. Paeth 전수 대조를 별도 네이티브 실행으로도 재확인했습니다. 포맷·변경 JS 문법·관련 로컬 문서 링크 17개를 확인했습니다. 이는 전체 PNG 디코딩이나 실제 이미지 픽셀 일치 검증을 완료했다는 뜻이 아닙니다.
