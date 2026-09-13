# 차트 원본 바이트 보존

## 결정

`chart/observed_contents.zig`의 `Contents.source`는 성공적으로 전부 소비한 원본 Contents slice를 그대로 빌립니다. 복사하거나 소유하지 않으므로 호출자는 결과를 사용하는 동안 입력 버퍼를 유지하고, 원본 재생을 원하면 수정하지 않아야 합니다. `deinit`은 source를 해제하지 않습니다.

이 필드는 수정하지 않은 차트의 바이트 동일 재생과 향후 patch 기반 저장의 SSOT입니다. 현재 의미 모델만으로 원본을 다시 만들 수 있다고 가정하지 않습니다. 이유는 다음과 같습니다.

- 타입 테이블은 선언 ID·이름·버전을 보존하지만 각 클래스 참조가 사용한 원래 타입 ID를 모든 중첩 결과에 보존하지 않습니다. 같은 선언을 가진 ID가 여러 개면 의미만으로 원래 선택을 결정할 수 없습니다.
- 다수 구간은 의미가 확정되지 않은 raw 바이트로 보존됩니다. 이를 새 기본값으로 재생성하면 동일성을 보장할 수 없습니다.
- 선택된 배열 개수는 caller의 `Layout`이며 일반 파일의 자동 판정 규칙이 아닙니다.

따라서 향후 저장 계층은 최소한 두 경로를 구분해야 합니다. 미수정 객체는 source를 그대로 내보내고, 수정 객체는 확정된 span과 serializer를 사용해 교체하되 미해석 구간을 보존해야 합니다. `source` 추가만으로 writer·수정 span·CFB 스트림 교체·체크섬 또는 byte-identical round trip이 구현됐다고 주장하지 않습니다.

## 검증

SHA-256으로 고정한 실제 9,876바이트 Contents fixture의 native 소유권 검사에서 다음을 확인합니다.

- `source.len`이 입력 길이와 같고 시작 포인터도 입력과 동일합니다.
- 전체 바이트가 입력과 같으며, 파싱 후 입력 첫 바이트를 바꾸면 source에서도 같은 변경이 보입니다. 이는 복사가 아닌 borrow 계약의 증거입니다.
- 기존 Legend String도 입력을 빌리고, 복사된 transition raw는 입력 변경과 분리됩니다.
- 정상·모든 할당 실패·모든 잘림·후행 바이트·9개 한도 오류에서 기존 해제량 검사를 유지합니다.

Debug·ReleaseSafe·ReleaseFast의 `chart-ownership-audit`를 공유 산출물이 겹치지 않게 순차 재실행하여 각 10/10 단계·native 4/4를 확인했습니다. Debug·ReleaseFast 로그는 `/tmp/hwpjs-source-retention-{Debug,ReleaseFast}-audit.log`이며 ReleaseSafe는 직접 실행 결과로 확인했습니다.

## 적대적 검증

임시 제품 코어 복사본에서 성공 결과의 source만 빈 slice로 바꿨습니다. 세 모드 모두 테스트 바이너리 컴파일 종료 코드 0 후 실행 종료 코드 1이었고, 원본 보존 검사 두 개가 `expected 9876, found 0`으로 실패했습니다. 잘림·한도 소유권 검사 두 개는 계속 통과하여 다른 실패를 새 계약 검출로 오인하지 않았습니다. 로그는 `/tmp/hwpjs-source-retention-mutant.MNu1L1`에 있습니다.

최초 세 모드 소유권 audit 실행 중 Debug와 ReleaseFast 작업이 공유 산출물에서 겹쳤으므로 그 결과는 폐기했습니다. 두 프로세스의 종료를 확인한 뒤 순차 재실행한 위 결과만 실적으로 기록합니다.

## 범위 제한

source는 성공한 **하나의 명시적 선택 배치** 전체입니다. CFB의 `/Contents` 스트림 경로·압축 상태·디렉터리 메타데이터와 HWP 파일 전체를 포함하지 않습니다. 입력을 호출자가 변경하면 source도 변경되므로 immutable snapshot이 필요한 상위 계층은 별도로 복사해야 합니다. 보안상 민감한 원문을 자동 복제하지 않는 대신 이 수명 계약을 API 문서에서 숨기지 않습니다.
