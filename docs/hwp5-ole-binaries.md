# BinData OLE 검사 연결

## 선택과 책임

`container.Options.ole` 기본값은 null입니다. 선택하면 `ole_binaries.Options.layout`을 명시해야 합니다. 검사 대상은 DocInfo STORAGE 또는 EMBEDDING 중 UTF-16 extension이 ASCII 대소문자를 무시해 ole인 항목입니다. 시그니처로 다른 항목을 자동 선택하지 않습니다. LINK를 따라가지 않으며, 미지 타입은 기존 BinData 보고서에 남습니다.

`binaries.inspectSelected`는 기존 경로 생성·정확한 조회·항목별 압축 정책을 그대로 사용합니다. 이미 한 번 해제한 바이트를 이미지/OLE 소비자에게 전달합니다. OLE 내부 구조는 [독립 컨테이너 코어](hwp5-ole-container.md)에 위임합니다. `extension.zig`는 이미지/OLE의 ASCII 형식 힌트 비교를 공유하며 경로 유효성이나 Unicode 검증을 대신하지 않습니다. 기존 inspect/inspectWithImages/inspectWithPolicy는 OLE 미선택 wrapper로 유지합니다.

보고서는 scalar 값만 보유합니다. 내부 CFB와 해제된 BinData는 즉시 해제하며 report에 빌린 포인터를 남기지 않습니다. `container.Report.ole`은 미선택이면 null입니다. 구조 검사 오류는 컨테이너까지 전파되고 다른 형식/원본으로 재시도하지 않습니다.

## 누적 한도와 집계

`ole_binaries.Budget`는 max_containers, max_total_envelope_bytes, max_total_stream_bytes, max_total_entries, max_total_path_bytes를 소유합니다. 항목마다 기존 CFB의 입력·스트림 합계·디렉터리 슬롯·경로 한도를 각각 남은 한도와 작은 값으로 제한합니다. 개별 CFB max_stream_bytes 등도 유지하며 strict는 항상 적용됩니다.

Report의 binaries는 소비된 EMBEDDING/STORAGE 항목 수, unhandled_binaries는 OLE 대상이 아닌 수입니다. containers는 구조 검사 성공 수, envelope_bytes는 접두사를 포함한 decoded 바이트 합계입니다. streams/stream_bytes는 kind 2 스트림 수/길이 합계이며 루트 mini-stream은 제외됩니다. entries는 unused를 포함한 물리 디렉터리 슬롯 수, path_bytes는 unused 슬롯을 포함해 CFB가 생성한 UTF-8 경로 바이트 합계입니다. 경로별 의미 해석이나 미지 스트림 지원 완료를 뜻하지 않습니다.

같은 물리 스트림을 가리키는 DocInfo 항목도 소비할 때마다 검사하고 합산합니다. 문서의 기존 total_decoded_bytes에서 내부 CFB를 다시 차감하지 않습니다. 위 합계는 OLE의 별도 작업 한도와 진단입니다. 실패한 Budget.consume은 이전 scalar 보고서를 바꾸지 않습니다. 호출자가 한도를 이전 소비량보다 낮게 바꿔도 뺄셈 언더플로 대신 LimitExceeded를 반환합니다.

## 초기 검증

네이티브는 OLE 힌트의 혼합 대소문자·길이·상위 바이트 불일치, STORAGE 선택, 실패 시 상태 보존, 같은 스트림의 두 참조, 다섯 누적 한도의 정확 일치/1 부족, 문서 decoded 바이트 중복 차감 방지, null 선택, 오류 전파를 확인합니다. 정상/실패 경로 OOM을 주입하고 뒤쪽 한도 오류의 명시적 allocator 잔량 0을 검사합니다. 세 모드 OLE BinData 필터는 root 포함 각각 3/3 통과했습니다. 공유 extension 변경 후 기존 PNG 필터 두 개도 Debug에서 각각 root 포함 2/2 통과했습니다.

비공개 mode 307은 selection u8(0 미선택, 1 raw CFB, 2 크기 접두사), 위 다섯 한도 u32, 문서 decoded 한도 u32, CFB를 받습니다. 출력은 선택 여부 u32, OLE 보고서 8개 u32, 기존 total_decoded_bytes/binary_data.decoded_bytes 두 u32로 44바이트입니다. 공개 제품 JS API는 변경하지 않습니다.

Debug 실제 WASM에서 곡선이있는분산형/한셀OLE/task1725 표본은 각각 정상 7/7/2건, 오류 34/34/26건을 통과했습니다. 각 표본의 원본으로 오류 후 복구도 확인합니다. 검사 선택 시 차트는 순번 1에 대응한 실제 storage 3만 검사합니다. task1725는 18개 바이너리를 OLE가 아닌 것으로 남기며 OLE 객체 ID 0을 임의로 해결하지 않습니다. compression 강제 1/2 입력을 독립 Node DEFLATE로 생성해 대조하고, 잘못된 크기를 미선택에서는 기존대로 보존하지만 선택 시 거부함을 검사합니다. raw 배치 성공은 실제 표본에서 접두사를 제거한 파생 입력이며 raw 형태의 실파일이 발견되었다는 뜻이 아닙니다.

ReleaseSafe/ReleaseFast 실제 WASM에서도 같은 결과(각 모드 정상 합계 16건·오류 94건)를 확인했습니다. 오류 후 복구 호출은 이 정상 집계와 별개입니다. 세 모드 모두 선택된 44바이트 보고서의 각 바이트를 개별 XOR 1 한 응답을 44/44 검출했습니다. LimitExceeded를 동일 메시지의 WebAssembly.RuntimeError로 바꿔도 정상 오류로 세지 않고 assertion 실패했습니다.

별도 소스 복사본 `/tmp/hwpjs-ole-binaries-mutants.tVL2rl`에서 OLE 소비 생략(selection), 누적 디렉터리 한도를 매번 전체 한도로 재사용(aggregate), 실패 전 보고서 변경(atomic), 성공한 내부 CFB의 deinit 제거(leak)를 실행했습니다. 절대 소스 경로를 사용했으며 제품 소스는 바꾸지 않았습니다. 네 변형 모두 세 모드에서 테스트 실패·종료 코드 1로 검출했습니다. selection은 containers 2 대신 0, aggregate는 예상한 한도 오류 누락, atomic은 binaries 7 대신 8, leak는 OOM 주입의 MemoryLeakDetected로 실패했습니다. 컴파일 실패를 검출 성공으로 세지 않았습니다.

소스·테스트를 고정해 Debug → ReleaseSafe → ReleaseFast 전체 audit를 순차 실행했습니다. `/tmp/hwpjs-ole-binaries-{Debug,ReleaseSafe,ReleaseFast}-audit.log`에서 각 모드 27/27 단계·990/990 네이티브 테스트·HWP/WASM 7,842,173회 검사 통과와 종료 코드 0을 확인했습니다. 포맷·JS 구문·공백 검사와 변경 문서의 로컬 링크 15개 검사도 통과했습니다. 이 결과는 선택적 BinData OLE 구조 검사 연결의 검증이며 아래의 내부 콘텐츠 의미 검증 완료가 아닙니다.

최종 `zig build test --summary all`은 5/5 단계·990/990 테스트, `zig build -Doptimize=ReleaseSafe --summary all`은 5/5 단계로 통과했습니다(종료 코드 0).

## 남은 범위

이 선택은 BinData 항목의 내부 CFB 구조만 검사합니다. 본문 OLE ID→DocInfo→저장 대상의 의미적 일치, 내부 Contents/OOXMLChartContents/Workbook/Package 스키마, OLE 실행, 렌더링·편집·저장 및 모든 버전 지원은 별도입니다. 본문 ordinal 보고서는 이 검사로 자동 완료 처리하지 않습니다.
