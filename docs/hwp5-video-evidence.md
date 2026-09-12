# HWP5 동영상 레코드 조사

[그리기·개체 계약](hwp5-drawings-contracts.md)

## 지원 경계

`document/section.zig`의 검사 호출과 `body/reader.zig`의 dispatch를 대조했습니다. 동영상 payload 코어는 있지만 문서 소유권·BinData 참조 검사는 연결되어 있지 않습니다. 명세 4.1의 HWPTAG_BEGIN은 0x10이며 4.3 표 57의 VIDEO_DATA는 BEGIN+82, 즉 98입니다. 이 값을 독립 기대값으로 검사하는 네이티브 회귀 테스트를 추가했습니다. 최초 검증 실험의 기대값 114는 조사자의 기준값 계산 오류였으며 제품 상수 98은 수정하지 않았습니다. 수정된 기대값으로 video 필터는 root 포함 4/4 통과했습니다.

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
