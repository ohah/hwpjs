# 수식 셀 좌표 속성의 묶음 조회

## 책임과 보존 조건

`formula_cell_rectangle.read`는 공통 XML 트리의 `unprefixedAttributeValues`로 cellAddr의 두 값과 cellSpan의 두 값을 각각 한 번에 찾습니다. 별도 XML 파서·속성 캐시·편집 모델을 만들지 않습니다. 값은 원문을 빌리고 기존 unsigned 변환기를 그대로 사용합니다.

변환 순서는 colAddr→rowAddr→colSpan→rowSpan입니다. 첫 속성이 없고 두 번째 속성이 잘못된 숫자여도 이전과 같은 첫 속성 부재 오류를 반환해야 하므로, optionalUnsignedPair의 일괄 숫자 변환으로 대체하지 않습니다. 직접 자식 중복·부재, 범위/0 span·네임스페이스 판정도 유지합니다.

## 검증

기존 네 번 조회 구현을 테스트 전용 기준으로 보존해13종 XML을 UTF-8/UTF-16 각각에서 값 또는 정확한 오류로 비교했습니다. entity·이름 한정 속성·부재와 잘못된 숫자의 우선순위·오버플로·음수·중복 자식·경계를 포함합니다. 잘못된 owner/index와 원본 불변도 확인합니다. 별도 파일 `formula_cell_rectangle_batch_tests.zig`를 root에 직접 등록합니다.

작은 정상 셀의 성공 할당은 이전12회/묶음10회이며 양쪽 할당·해제 바이트가 같습니다. 새 구현의 전체 OOM 실패 지점과 기존 독립 점유 mask 검증을 유지합니다. 작업 트리 ReleaseSafe3/3·ReleaseFast4/4, main 격리 사본 ReleaseSafe5/5·exit0을 확인했습니다. 모드와 root를 중복 합산하지 않습니다. 전체 처리 시간 개선율은 측정하지 않았습니다.

## 실파일 대조 진행 경계

의존성과 자원 격리를 보완한 최종 main 격리 공개 묶음은 등록22파일·53/53·fail/skip0·exit0·stderr0바이트입니다(116965.81025ms). 후보 hash는 아래a872와 같으며 기본 경로/환경변수 모두 같은 후보를 읽고 동시성2로 실행했습니다. 로그는 `rectangle-public-suite-bounded-final.log`입니다. 이전49/50 실패 실행을 소급해 통과시키지 않습니다.

이후 감사 도구를 문서별 격리·RSS/시간 한도·안전한 metadata 비교로 보강했습니다. 최종436개 전후 응답 일치와 기존 저장 문제2종, aift의 표시 형식 차이·대형 assertion 문제는 [조회 감사 계약](hwpx-query-parity-audit.md)이 소유합니다. 기존 저장 문제 때문에 최종 exit1이며 전체 지원 완료가 아닙니다. 아래 단일 프로세스 자원 과다 기록은 과거 실패 이력입니다.

첫 참조 조회 대조는 자원 과다로 미완료 종료했습니다. 다음 파일aift.hwpx 처리 중 전용 Node PID45398의 RSS 약12GiB와 footprint 도구 보고값400453677720바이트를 관측했습니다. 이 보고값을 실제 RAM 상주량과 동일시하지 않습니다. cwd/명령을 확인한 해당 감사만 SIGTERM했고 exit143·PID 부재를 확인했습니다. 종료 전64개 HWPX 파일 행이 완료됐지만 최종 summary가 없으므로 전체 일치가 아닙니다. 문서별 격리·자원 상한 없이 이 도구를 재실행하거나 게시하지 않습니다. 조용한 로그를 이유로 재시작한 것이 아닙니다.

등록21파일 공개 회귀는50개 중49pass/1fail·exit1입니다. 제품 회귀49개는 통과했고 새 query parity 인수 회귀는 격리 사본에서 미게시 inventory helper가 없어 ERR_MODULE_NOT_FOUND로 실패했습니다. 작업 트리에서의 인수 회귀1/1과 격리 실행을 혼합해 통과로 읽지 않습니다. 감사 도구의 자원 격리와 의존성 구성을 보완한 뒤 다시 검증해야 합니다.

격리 사본은 `/tmp/hwpjs-note-geometry-publication.Wkoeip/tree`입니다. 추적 src/build2494파일은 main과 같고, 기존 변경은 root 등록과 rectangle adapter 두 파일이며 새 회귀 모듈만 추가했습니다. 이전 main 빌드 `72dd66e6b4a8a0f6d7d708e451c0beecb56d53334cefd76d0bf708211eab454b`, 묶음 후보 `a8724f6891851f45617f147a8022e3cdd73093796dfd9642e1fb4ef405ec275c`로 참조 HWPX의 모든 구역 paragraphTextSnapshot/formulaCurrent 응답·오류·무변경 저장을 대조 중입니다. 도구는 `tools/hwpx-query-parity-audit.mjs`, 로그는 같은 임시 디렉터리의 `rectangle-query-parity.jsonl`입니다. 최종 summary 전에는 전체 일치를 주장하지 않습니다. 같은 오류는 지원 성공이 아니며 편집·브라우저 증거를 대신하지 않습니다.

기존 수식 native 실행의1초 sample에서는 반복 OOM 주입 중 수식 평가와 속성 해제/재파싱을 관측했습니다. 그 실행은 중단·재시작하지 않았고 실제 index34 snapshot을 통과한 뒤 index37 merge 검사에서1024MiB 관측 한도를 넘었습니다. 이 프로파일은 무한 루프나 모든 비용이 속성 조회 때문이라는 증거가 아닙니다. 로그는 `/tmp/hwpjs-native-current-20261015.QKXKKy/average-snapshot-sample.txt`와 `audit-average-formulas-checked.jsonl`입니다.
