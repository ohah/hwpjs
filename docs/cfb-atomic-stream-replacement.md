# CFB 원자적 다중 stream 교체

## 계약과 SSOT

`src/cfb/stream_replace.zig`의 `rebuildManyExact`는 이미 strict 여부를 결정해 연 CFB에서 하나 이상의 exact stream을 새 내용으로 교체하고 canonical CFB 하나를 반환합니다. 모든 경로를 `File.findExact`로 해석하고 stream 종류, 동일 entry 중복, active entry에서 compact node로의 매핑을 전부 검증한 뒤에만 `File.toNodes`를 한 번 호출합니다. 최종 직렬화도 원본 major version으로 한 번만 수행합니다.

중복은 문자열 비교가 아니라 해석된 directory entry identity로 판단하므로 CFB의 대소문자 비구분 별칭도 `DuplicateStreamReplacement`입니다. 빈 집합은 의도하지 않은 canonical rewrite를 막기 위해 `EmptyReplacementSet`, 없는 경로는 `StreamNotFound`, storage 대상은 `NotAStream`입니다. 실패 시 입력 `File`과 그 stream은 변경되지 않으며 부분 출력은 존재하지 않습니다. 입력 경로와 내용은 빌리고 반환 bytes만 caller가 소유합니다.

기존 `rebuildExact`는 별도 구현이 아니라 원소 한 개인 `rebuildManyExact` 호출입니다. HWP 바깥 BinData와 내부 OLE adapter는 계속 이 공통 계층을 사용하므로 exact 선택, compact mapping, version 보존과 writer 호출 규칙은 한 곳만 소유합니다.

## 검증과 한계

CFB v3/v4에서 역순으로 지정한 두 stream을 함께 교체하고 형제 stream 및 storage의 state·created·modified를 보존하는지 strict 재개방으로 확인합니다. 모든 할당 실패 지점, 빈 집합, 중간 missing/storage 대상, 같은 경로 및 대소문자 별칭 중복, 출력 한도를 검사합니다. 앞선 active entry를 inactive로 바꾼 별도 fixture는 뒤 stream이 compact node index로 정확히 교체되고 보존 stream이 유지되는지 확인합니다.

적대적 변이 검증에서는 빈 집합 허용, 중복 stream 허용, compact node 대신 raw directory entry index 사용, 첫 replacement만 적용, 출력 version 3 강제를 각각 주입했습니다. Debug·ReleaseSafe·ReleaseFast의 15개 실행 모두 컴파일 성공 뒤 테스트 실패로 검출했습니다.

이 API는 기존 stream 내용 교체만 담당합니다. stream/storage 추가·삭제·이름 변경, DocInfo 의미 검증, 여러 HWP BinData의 압축 인코딩과 편집 명령 조립은 상위 계층의 별도 범위입니다.
