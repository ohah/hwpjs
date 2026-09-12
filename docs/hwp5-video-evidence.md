# HWP5 동영상 레코드 조사

[그리기·개체 계약](hwp5-drawings-contracts.md)

## 지원 경계

초기 대조에서는 동영상 payload 코어만 존재했고 문서 검사에 연결되지 않았습니다. 후속 연결 작업은 아래 별도 절에서 관리하며 문서 소유권·BinData 참조는 여전히 미검증입니다. 명세 4.1의 HWPTAG_BEGIN은 0x10이며 4.3 표 57의 VIDEO_DATA는 BEGIN+82, 즉 98입니다. 이 값을 독립 기대값으로 검사하는 네이티브 회귀 테스트를 추가했습니다. 최초 검증 실험의 기대값 114는 조사자의 기준값 계산 오류였으며 제품 상수 98은 수정하지 않았습니다. 수정된 기대값으로 당시 video 필터는 root 포함 4/4 통과했습니다.

## 조사 순서와 회귀 검증

기존 drawing-style-survey는 도형 계층 검사를 통과한 뒤에만 videoRecords를 집계했습니다. 따라서 과거의 0개 기록은 전체 파일·구역에서 동영상이 없다는 증거가 아닙니다. 집계를 레코드 framing 직후, 도형 계층 검사 전으로 옮겼습니다. CFB·보안 정책·스트림 복호화·framing에서 제외된 입력은 여전히 조사 범위 밖입니다.

조사기 전체에 도형 계층 실패를 주입한 최초 실험은 끝부분의 기존 정상 스타일 fixture 필수 assertion에서 중단되었습니다. 이 실험을 성공한 회귀 검증으로 세지 않습니다.

후속 보강으로 `tests/hwp5/drawing-section-evidence.mjs`에 구역 단위 decode → framing/동영상 집계 → 도형 계층 검사 순서를 분리했습니다. 본 조사기가 이 경로를 사용하며 정상 스타일 fixture assertion은 유지합니다. 별도 Node 테스트 5개는 정상 반환, 동일 Error/RuntimeError/TypeError 전파, decode/framing 실패 시 집계·계층 호출 부재를 검사하여 모두 통과했습니다. 이 테스트를 HWP5 audit 선행 단계에 연결했습니다.

적대적 검증은 `/tmp/hwpjs-video-inventory-mutant.bwNLZO`의 독립 복사본에서 계층 검사를 집계 앞으로 옮겼습니다. 5개 중 4개가 빈 집계를 검출해 실패하고 종료 코드 1을 반환했습니다. 실제 동영상 파일을 만들거나 검증한 결과가 아니라 조사 순서의 회귀 검출 증거입니다.

## 도형 검사와 독립적인 추가 표본 조사

`legacy/rust/crates/hwp-core/tests/fixtures`와 `reference/rhwp/samples`를 재귀 순회한 584개 `.hwp` 경로를 읽기 전용으로 조사했습니다. 동일 내용의 중복 경로를 제거한 파일 수가 아닙니다. 제품 CFB reader와 `hwp-corpus-evidence.observeHwpFile`의 fingerprint/CFB 거부 분류를 재사용했습니다. HWP5 문서 유효성 전체 검사가 아닙니다.

- HWP5 fingerprint 관측 482개, 알려진 strict CFB 거부 73개, 비CFB 29개.
- 관측 입력 중 보안 플래그 마스크 `2|4|16|256|1024`에 해당하는 7개를 제외했습니다. 배포용 ViewText는 이 조사에 포함하지 않았습니다.
- 나머지 입력의 `/BodyText/Section숫자` 스트림을 압축 플래그에 따라 Node `inflateRawSync`(출력 제한 64 MiB) 또는 원시 바이트로 읽고 `documentRecords`로 framing을 검사했습니다. DocInfo나 도형 계층 검사는 진입 조건에 넣지 않았습니다.
- 602개 구역·1,934,027개 레코드에서 태그 98은 0개였으며 이 구역들의 decode/framing 실패는 없었습니다.

이 결과는 조사 가능한 BodyText에서 표본을 찾지 못했다는 뜻입니다. 동영상 payload의 실제 배치·부모 종류·BinData ID 의미를 확인한 증거가 아니며 명세 밖의 소유권 규칙이나 자동 배치를 추정하는 근거로 사용하지 않습니다.

## 전체 검증

소스·테스트를 고정해 Debug → ReleaseSafe → ReleaseFast 전체 audit를 순차 실행했습니다. 세 모드 각각 27/27 단계·979/979 네이티브 테스트·HWP/WASM 7,840,885회 검사로 통과했고 실행 종료 코드 0을 확인했습니다. 로그는 `/tmp/hwpjs-video-inventory-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. 수정된 drawing survey의 실제 `videoRecords`도 각 모드에서 빈 배열입니다. 변경 문서의 로컬 링크 4개와 변경 파일 포맷·공백 검사도 통과했습니다. 동영상 문서 지원은 별도 후속 작업이며 이 조사기 검증으로 완료를 주장하지 않습니다.

최종 `zig build test --summary all`은 5/5 단계·979/979 테스트, `zig build -Doptimize=ReleaseSafe --summary all`은 5/5 단계로 통과했습니다(종료 코드 0).

## 선택적 문서 payload 연결

`body/video_validation.zig`는 Tree의 태그 98을 순회하고 기존 `video_data.Video.parse`를 재사용합니다. 문서 옵션 `video_layout=null`은 records/unselected/unselected_bytes로 집계하며 파싱 완료로 세지 않습니다. 명시적 specified_remainder/explicit_units 선택은 모든 해당 payload에 적용하고 실패 시 다른 배치로 재시도하지 않습니다. 표 123 시작 위치를 선택하는 실험이며 공통 개체 prefix나 부모 ID를 추정하지 않습니다.

`document/section.zig`에서 연결하며 구역 보고서 `videos`가 결과를 소유합니다. parsed/local/web/extra_bytes는 선택한 payload의 해석 결과이고, pending_owners는 모든 태그 98 레코드 수입니다. pending_references는 해석한 로컬의 두 슬롯·웹의 한 슬롯 수로 ID 0도 제외하지 않습니다. resource ordinal·storage ID·부재 의미를 확정하지 않고 실제 입력의 원시 payload를 변경하지 않습니다. 기본 body reader는 여전히 unknown을 반환하며 기존 미검증 계수에서 임의로 빼지 않습니다.

기존 문서 보고서의 테스트 wire 형식은 유지했습니다. 비공개 WASM mode 300은 selection + version + 구역, 301은 selection + 기존 decoded 입력, 302는 selection + 기존 CFB 입력입니다. selection 0은 미선택, 1은 나머지 웹 바이트, 2는 뒤 u32의 명시적 UTF-16 단위 수입니다. 300 출력은 보고서의 9개 u32, 301/302는 구역 수 u32 뒤 구역별 동일 보고서입니다. 공개 제품 JS API 변경이 아닙니다.

Debug 네이티브 video 필터는 root 포함 7/7 통과했습니다. 서로 다른 깊이·루트 위치, ID 0/65535, UTF-16 원값, 잘림·미지원 종류·최대 길이, 실제 문서 연결, 정상·오류 경로의 명시적 allocator 회계와 전체 OOM 주입을 포함합니다. OOM 실험의 초기 테스트가 OutOfMemory를 UnexpectedEnd로 기대하던 오류는 OOM 전파로 수정했습니다.

초기 Debug WASM은 실제 `20250130-hongbo.hwp`의 비동영상 원본과 그 메모리 복사본에 삽입한 두 종류의 합성 payload를 대조하여 정상 10건과 오류 20건을 확인했습니다. 이후 확대된 검증 결과는 아래 절에 기록합니다. 실제 동영상 파일은 0개이며 웹/로컬 실파일 지원을 입증한 것은 아닙니다. 위 979개 전체 검증 결과는 앞선 조사기 변경에 대한 기록으로, 이 후속 소스 변경의 검증 결과가 아닙니다.

### 문서·CFB 오류 전파와 적대적 보강

잘림 실험을 mode 300뿐 아니라 decoded 문서(301)·CFB(302)에도 연결했습니다. 같은 입력 생성 함수를 재사용하며, 각 거부 직후 원본 정상 CFB를 다시 검사해 이전 오류/결과가 남지 않는지 확인합니다. Debug/ReleaseSafe/ReleaseFast 각 네이티브 video 테스트 7/7(root 포함), 실제 WASM 정상 10건·오류 52건이 통과했습니다. 이는 두 종류의 합성 payload 연결 검사이며 실제 동영상 파일 수는 계속 0입니다.

실제 WASM 응답을 변조하는 실험에서 각 모드별로 구역 보고서 36바이트·decoded 보고서 40바이트·동영상 parsed=1인 CFB 보고서 40바이트를 한 바이트씩 XOR 1 했고 116/116 모두 검출했습니다. CFB의 초기 빈 보고서만 변조한 첫 실험에서 보강해 실제 선택 보고서를 대상으로 삼았습니다. UnexpectedEnd를 같은 메시지의 WebAssembly.RuntimeError로 바꾼 실험도 각 모드에서 실패하여 trap이 정상 거부에 섞이지 않음을 확인했습니다.

소스 변형은 `/tmp/hwpjs-video-validation-mutants.k3J5b9`의 독립 복사본에서 실행했습니다. absolute-unselected 로그는 문서 옵션을 null로 강제한 변형이며 세 모드 모두 parsed 값 불일치로 테스트가 실패했습니다. absolute-leak 로그는 선택 시 Tree 해제를 생략한 변형이며 세 모드 모두 명시적 allocator 잔량 800바이트를 검출하고 테스트가 실패했습니다(누수 검사 panic에 따른 ABRT 포함). 초기 상대 경로 실험의 actual-leak 로그에는 unselected 소스 경로가 찍혀 있어 누수 변형 증거에서 제외했고, 절대 소스 경로로 재실행한 absolute-* 로그만 최종 근거로 사용합니다.

이후 소스·테스트를 고정하여 Debug → ReleaseSafe → ReleaseFast 전체 audit를 순차 실행했습니다. `/tmp/hwpjs-video-validation-{Debug,ReleaseSafe,ReleaseFast}-audit.log`에서 각각 27/27 단계·982/982 네이티브 테스트·HWP/WASM 7,840,996회 검사를 통과했고 종료 코드 0을 확인했습니다. 동영상 결과는 정상 10·오류 52건으로 정규 audit에 포함됩니다. 변경 파일 포맷·공백·JS 구문과 변경 문서의 로컬 링크 1개 검사도 통과했습니다. 이는 명시적으로 선택한 payload 검사의 연결 검증이며 동영상 소유권·참조 해결·실제 재생 지원 완료가 아닙니다.

최종 `zig build test --summary all`은 5/5 단계·982/982 테스트, `zig build -Doptimize=ReleaseSafe --summary all`은 5/5 단계로 통과했습니다(종료 코드 0).
