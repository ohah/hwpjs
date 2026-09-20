# EMF+ StrokeFillPath record

## 공식 문서와 구현 경계

MS-EMFPLUS `RecordType`은 `EmfPlusStrokeFillPath`를 `0x4037`로 열거하고, 열린 path figure를 닫아 현재 pen으로 stroke하고 현재 brush로 fill한다고 설명합니다. 그러나 2.3의 개별 record 정의에는 이 타입이 없으며 Flags, Size, DataSize 이후 payload 필드 배치를 정의하지 않습니다.

`src/image/emf/emf_plus_stroke_fill_path.zig`는 이 누락을 추측으로 채우지 않습니다. 공통 `emf_plus_record.Iterator`가 Type/Flags/Size/DataSize, 4바이트 정렬, `Size == 12 + DataSize`, comment 범위를 검증한 뒤 전용 관측 계층은 Type만 확인하고 Flags와 data slice를 원문 그대로 빌립니다. PenId, BrushId, PathId 또는 고정 payload 크기를 발명하지 않습니다.

`emf_plus_stream.zig`는 관측된 레코드 수만 checked addition으로 집계합니다. 이 수치는 payload 해석·객체 참조 검증·재생 지원을 뜻하지 않습니다.

## 공식 근거

- [MS-EMFPLUS RecordType Enumeration](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/abffcb71-1b31-414f-b032-f1e00c57a48a)
- [MS-EMFPLUS Record Types](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/0597197d-20f5-4c55-a185-260d7bec7a11)

## 검증 기록

빈 payload와 임의의 정렬 payload, 모든 범위가 섞인 원문 byte, nonzero Flags, 다른 RecordType 거부, stream 집계·overflow rollback, 실제 EMF framing 연결을 검사합니다.

다섯 관점의 적대적 검토로 (1) 공식 enum 값과 동작 설명, (2) 2.3에 개별 wire 정의가 실제로 없다는 점, (3) 공통 framing SSOT와 전용 관측 계층의 분리, (4) Flags·빈/비어 있지 않은 data 원문 보존과 실패 원자성, (5) payload 의미·객체 참조·replay 미지원 표기를 대조했습니다. 이 검토에서 report 필드가 지원 완료로 오해되지 않도록 이름을 `opaque_stroke_fill_path_records`로 고쳤습니다.

Type 판별, Flags 반환, opaque data 반환, stream checked count/overflow, stream routing을 각각 훼손한 5종 의미 변이를 독립 복사본과 모드별 새 cache에서 실행했습니다. Debug, ReleaseSafe, ReleaseFast의 15/15 실행이 모두 컴파일 오류·panic·timeout이 아닌 실제 테스트 실패로 검출됐고 임시 작업 사본은 제거했습니다.

최종 `zig build audit --summary all`, `-Doptimize=ReleaseSafe`, `-Doptimize=ReleaseFast`는 각 모드에서 40/40 step과 1845/1845 test를 통과했습니다. 모드별 구성은 native 1806, chart ownership 31, WMF contents 8이며, 각 실행은 8,905,827 checks, imports 0과 CFB 12,000 mutation의 traps 0을 기록했습니다.
