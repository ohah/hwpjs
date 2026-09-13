# 차트 원본 span patch writer

## 계약

`chart/contents_patch.zig`의 `applyOriginal`은 `Contents.source`의 원본 좌표로 지정한 Patch 배열을 적용해 새 owned 버퍼를 반환합니다. 의미 필드를 직접 직렬화하지 않으며, 각 의미 serializer가 만든 replacement를 안전하게 조립하는 하위 계층입니다.

Patch는 `start`, `end`, `replacement`로 구성됩니다. 입력 순서대로 start가 정렬돼야 하고 원본 범위 안의 반개구간 `[start, end)`끼리 겹치면 안 됩니다. 같은 위치의 빈 구간 삽입은 caller 순서대로 적용할 수 있습니다. replacement는 빈 slice일 수 있어 삭제를 표현하며, start==end이면 삽입입니다.

writer가 소유하는 규칙은 다음과 같습니다.

- `Contents.end == source.len`과 원본 32..36의 extent가 `source.len - 36`인지 먼저 확인합니다.
- patch가 extent 네 바이트와 겹치거나 그 내부에 삽입하는 것을 금지합니다. caller가 extent를 별도 patch로 덮지 않습니다.
- 증가·감소를 반영한 최종 길이를 할당 전에 계산하고 usize overflow, 36바이트 미만, u32 extent 초과, caller 최대 출력 크기 초과를 거부합니다.
- 원본/교체 구간을 한 번씩 복사한 뒤 출력 extent를 최종 길이로 갱신합니다.
- 반환 버퍼는 caller 소유이며 원본과 replacement의 수명에 의존하지 않습니다.

정렬되지 않은 patch는 자동 정렬하지 않습니다. 자동 정렬은 동일 위치 삽입의 순서를 바꾸거나 잘못된 caller span을 숨길 수 있기 때문입니다. span 발견과 필드별 replacement 생성은 이 파일의 책임이 아닙니다.

## 현재 검증

SHA-256 고정 실제 9,876바이트 Contents에서 다음을 native로 검사합니다.

- patch 0개는 원본과 byte-for-byte 같습니다.
- 길이 3을 2로 교체, 3바이트 삽입, 5바이트 삭제를 함께 적용한 결과의 모든 변경 전후 구간과 최종 길이·extent를 대조합니다.
- 역전/범위 밖 span, 겹침, extent 내부 삽입·좌우 경계 교차, 36바이트 미만 결과, 출력 한도, source/end 불일치, 손상된 원본 extent를 정확한 오류로 거부합니다. extent 직후인 위치 36 삽입은 허용하고 새 extent를 확인합니다.
- 정상 경로는 기존 모든 할당 실패 검사에도 포함되어 output OOM에서 기존 Contents 소유권까지 정리되는지 확인합니다.

최초 splice 테스트의 마지막 기대 위치를 누적 변화량 `-1 + 3 = +2` 대신 삭제 길이까지 잘못 반영해 197로 적은 오류가 실제 검사에서 드러났습니다. 원본 205 이후의 올바른 출력 시작 202로 수정했으며 이 실패를 제품 결함이나 통과 실적으로 세지 않습니다.

### 결함 주입

임시 코어에서 출력 첫 바이트 손상, extent 갱신 제거, 겹침 오류를 다른 오류로 변경, extent 보호 제거, 출력 한도 제거, 원본 extent 검사 제거, source/end 검사 제거의 7종을 각각 주입했습니다. Debug·ReleaseSafe·ReleaseFast의 대조군 3개는 각각 7/7을 통과했고, 결함 총 21개는 모두 테스트 바이너리 컴파일 종료 코드 0 후 실행 종료 코드 1과 실제 `FAIL`로 검출했습니다. 컴파일 오류나 trap은 실적으로 세지 않았습니다. 로그는 `/tmp/hwpjs-chart-patch-mutants.*` 아래에 있습니다.

## 미구현 범위

현재 API는 caller가 확정한 span만 다룹니다. 문자열 길이 필드, 타입/객체 참조와 후속 오프셋, 특정 의미 필드의 span을 자동으로 찾지 않습니다. patch 결과를 다시 파싱해 구조 유효성을 보장하지 않으며 CFB 스트림 압축·교체도 하지 않습니다. 실제 편집 API는 필드별 span/serializer와 재파싱 검증을 이 계층 위에 추가해야 합니다.
