# EMF+ GetDC와 classic EMF interleaving

## 범위와 상태 소유권

MS-EMFPLUS 2.3.3.2의 `EmfPlusGetDC (0x4004)`는 이후 만나는 일반 EMF record를 처리하도록 전환하고, 다음 EMF+ record에서 그 처리를 끝냅니다. `emf_plus_stream.State`가 이 구간의 활성 여부를 소유하며 `get_dc_records`와 활성 구간에서 관측한 `get_dc_emf_records`를 checked addition으로 집계합니다.

각 EMF+ record를 읽기 직전에 이전 GetDC 활성 상태를 끄고, 현재 record가 GetDC이면 다시 켭니다. 따라서 같은 `EMR_COMMENT_EMFPLUS` 안에서 GetDC 뒤 다른 EMF+ record가 이어지면 중간에 일반 EMF record가 없으므로 활성 상태가 남지 않습니다. GetDC가 comment의 마지막 EMF+ record이면 다음 외부 EMF record부터 활성화됩니다. 연속 GetDC도 마지막 record의 활성 상태 하나로 귀결되며 record 수는 각각 집계합니다.

`framing.zig`는 EMF+를 운반하는 `EMR_COMMENT` 자체를 classic playback 대상으로 세지 않습니다. 그 comment의 마지막 GetDC와 다음 EMF+ carrier comment 사이에서 만난 다른 EMF record만 stream state에 관측시킵니다. private/public/non-EMF+ comment는 일반 EMF record이므로 활성 구간 안에 있으면 같은 방식으로 관측됩니다. 다음 EMF+ carrier가 여러 record를 담더라도 첫 EMF+ record에서 구간이 종료됩니다.

## 완료로 세지 않는 범위

이 계층은 어느 일반 EMF record가 GetDC 구간에 속하는지 보존하는 framing 계약입니다. 일반 EMF record의 wire parser는 기존 framing 경로가 계속 담당하며 여기서 다시 해석하지 않습니다. 실제 renderer가 해당 record를 GDI+ playback surface에 합성하는 동작, device context 공유, 좌표·clip·object 상태 변환은 구현하지 않았습니다. 따라서 `get_dc_emf_records`는 replay 대상 관측 수이지 화면 출력 성공 수가 아닙니다.

로컬 지원 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 GetDC interleaving 출력과 비교하지 못했습니다. 합성 EMF fixture와 공식 상태 전이 대조 결과만 주장합니다.

## 공식 근거

- [MS-EMFPLUS EmfPlusGetDC](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/b7879ac2-355d-4419-8e65-e2e4de4fa4a9)
- [EMF+ 공통 record stream](emf-plus-record-stream.md)
- [RecordType wire 지원 매트릭스](emf-plus-record-coverage.md)

## 검증 기록

stream 테스트는 Header 전 비활성, GetDC 활성, 두 일반 record 관측, 다음 EMF+ EOF에서 종료, 같은 comment의 후속 EMF+에서 즉시 종료, 비활성 관측 무효, 관측 수와 GetDC 수 overflow rollback을 검사합니다. 상위 framing fixture는 GetDC가 끝인 첫 EMF+ carrier, 서로 다른 위치의 일반 EMF record 두 개, 다음 EMF+ EOF carrier를 배치해 정확히 두 record만 집계되는지 확인합니다. 한 record만 둔 초기 fixture에서는 잘못 첫 carrier를 세고 실제 record를 빼도 합계가 같아지는 위치 편향을 변이 검증에서 발견해 두 record로 보강했습니다.

다섯 관점의 적대적 검토로 (1) GetDC 고정 wire와 ignored Flags, (2) 다음 EMF+ record에서 종료되는 상태 전이, (3) comment 내부 다중 record와 외부 carrier 경계, (4) checked 집계·오류 rollback·framing 연결, (5) 구간 관측과 실제 playback 미지원의 분리를 대조합니다.

활성 시작·종료, 비활성 관측, 관측 count 값·overflow·반환값, GetDC count 값, framing carrier 조건·classification과 다음 record 종료를 각각 훼손한 10종 의미 변이를 독립 복사본과 모드별 새 cache에서 실행했습니다. Debug, ReleaseSafe, ReleaseFast의 30/30 실행이 모두 컴파일 오류·panic·timeout이 아닌 실제 테스트 실패로 검출됐고 임시 복사본·cache·실행기는 제거했습니다.

최종 `zig build audit --summary all`, `-Doptimize=ReleaseSafe`, `-Doptimize=ReleaseFast`는 각 모드에서 40/40 step과 1885/1885 test를 통과했습니다. 모드별 구성은 native 1846, chart ownership 31, WMF contents 8이며, 각 실행은 8,905,827 checks, imports 0과 CFB 12,000 mutation의 traps 0을 기록했습니다.
