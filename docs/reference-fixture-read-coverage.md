# 참조 픽스쳐 읽기 조사

## 검사 범위

`tools/reference-parser-audit.mjs`는 지정한 root 아래 일반 파일 중 HWP/HWPX 확장자 전체를 열거하고 실제 signature로 reader를 선택합니다. 심볼릭 링크는 따라가지 않습니다. 입력64MiB 예산 초과·미지원 signature·reader 오류를 성공으로 집계하지 않습니다. 결과는 JSONL의 시작 inventory/각 파일 hash·상태/최종 summary입니다. 성공한 native 텍스트 projection과 입력 buffer 불변만 검사하며 전체 필드·편집·저장·레이아웃·GUI 증명이 아닙니다. 보고 도구의 종료코드만으로 전체 지원을 판단하지 않습니다.

## 현재 후보 실측

2026-10-12 조건부 개체 주변 편집 후보 SHA256 `e4a1faf91f41e82604c04f492d282c8a84ae4e91ca491e30bd2a737bb6124400`의 참조 전체 읽기는 `/tmp/hwpjs-reference-read-e4a1.9kW6CV`에서 exit0으로 종료했습니다. inventory975·HWP3 제외26·범위 내949, HWP5 509/HWPX435의 텍스트 읽기와 입력 불변·690523문단을 확인했습니다. 기본 무비밀번호 정책에서 `EncryptedDocument`1·`UnsupportedEncryption`1, 축소 원본의 `SectionCountMismatch`3은 그대로 거부했습니다. 기존 기본 제품이나 다른 후보의 읽기 성공을 가져온 결과가 아니며 전체 필드·편집·저장·브라우저/조판 완료는 아닙니다. 후보의 편집 검증은 [조건부 개체 주변 입력](hwpx-switch-anchor-edit.md)이 소유합니다.

2026-10-12 로컬 기본 WASM SHA256 `7b41bb97ffbb2bf77e21a40dd3e88968383a641734c759c956f854408d12ced3`으로 참조 root 전체 읽기를 다시 실행했습니다. `/tmp/hwpjs-reference-read-7b41.socNf5`의 최종 summary와 exit 0을 확인했습니다. 975경로 중 HWP3 26개 제외·범위 내 949개이며 HWP5 509개/HWPX 435개에서 690,523문단의 텍스트 읽기와 입력 버퍼 불변을 검증했습니다. 기본 무비밀번호 읽기의 암호 거부 2개와 issue5715/5802/5828의 `SectionCountMismatch` 3개는 유지됩니다. 아래 이전 후보 결과를 최신 산출물에 소급한 것이 아니며, 비밀번호 지정 읽기·모든 필드·편집·저장·실제 브라우저·원본 조판 완료의 증거가 아닙니다.

최신64726ccf 후보의 암호 companion `/tmp/hwpjs-current-retained-anchor-password-companion.log`는 HWP5/HWPX password API·Worker4파일12/12·skip/fail/cancel/todo0·strict code0/signal null로 종료했습니다(20607.946ms). 실제 참조 암호2파일과 레거시 암호 표본의 명시적 비밀번호 복호화·독립 payload·편집/저장·이력·재시도/보호 해제 저장 동의를 검사합니다. 최신 기본 읽기944/949 집계를 소급 변경하지 않으며 축소 참조3파일 선언 오류를 고치거나 모든 암호 scheme을 지원한 결과가 아닙니다.

원문 보존 확장 후 최신 후보 SHA25664726ccf687cc848e79cf5794dad8e29b1e100415dabb6d3b1352e1bf9b557e2의 `/tmp/hwpjs-current-retained-anchor-reference-read.jsonl`은 exit0으로 완료했습니다.975경로 중 HWP3 제외26·범위 내949이며 HWP5 509/HWPX435의 텍스트·입력 불변,690523문단을 확인했습니다.5거부는 이전과 같은 암호2파일 및 축소 참조3파일의 SectionCountMismatch입니다. 개별 파일 입력 해시와 최종 summary가 있으며 모든 필드 의미/편집/저장/브라우저 검증이 아닙니다. 기본 제품 WASM은 변경하지 않았습니다.

표 조회·주석 경계·기존 줄바꿈 수정 후보 SHA256 `1496892ec0ef9d66d540457f6e2460c186bb6d573292c88d4a68b0740b9100bc`의 `/tmp/hwpjs-table-query-reference-parser-audit.jsonl`은 종료코드0·stderr0바이트로 완료했습니다. inventory975개 중 HWP3 26개 제외, 범위 내949개 중 HWP5 509/HWPX435의 텍스트 읽기·입력 불변을 검증했습니다.690523문단이며 남은5거부는 `EncryptedDocument`1·`UnsupportedEncryption`1·`SectionCountMismatch`3입니다. 기본 무비밀번호 정책과 축소 참조 원본의 선언 불일치가 이전 결과와 동일합니다. 도구 종료코드0을949개 전부 지원이나 전체 필드·편집·저장·Canvas 지원으로 해석하지 않습니다. 제품 기본 WASM은 아직 f38c60이며 이 결과는 명시적 후보의 증거입니다.

위5거부 중 알려진 암호2파일은 비밀번호 없는 기본 reader의 결과입니다. 같은 기본 f38c60의 명시적 password API/Worker에서 실제 HWP5 보호 파일과 HWPX `HWP5-password-123456.hwpx`를 열고 독립 payload·편집·저장/이력·재열기를 확인했습니다. 전체 암호 회귀12/12(skip0), exit0이며 HWPX 세부 계약은 [보호 문서](hwpx-protection.md)가 소유합니다. 기본 읽기 감사의944/949 합계를 자동 성공으로 바꾸거나 암호를 추측해 넣지 않습니다. 나머지3개 축소 참조 파일의 구역 수 불일치는 아래 독립 관측을 그대로 유지합니다.

사용자가 범위를 HWP5·HWPX로 확정한 뒤 `/tmp/hwpjs-hwp5-hwpx-scoped-reference-read.jsonl`을 같은f38c60 후보로 재실행했습니다.975개 inventory 중 HWP3 26개는 excluded_format으로 별도 표시하고 성공/실패 어느 쪽에도 더하지 않습니다. 범위 내949개 중 HWP5 509/HWPX435 텍스트·입력 불변이 검증됐고 남은5거부는 HWPX 암호1·HWP5 암호1·구역 count 불일치3입니다. 미지 signature/초과 입력은 계속 오류이며 제외 범위처럼 숨기지 않습니다. 조회 범위 분리와 잘못된 인수 회귀2/2(skip0), exit0이 통과했습니다. 전체 파서 필드·편집·저장·Canvas 완료를 뜻하지 않습니다.

원본 필드 구역 색인 후보 SHA256 `f38c60ad10344e982e95dbfc5662d03f161add1a02caffe84e64617a01efb760`의 `/tmp/hwpjs-source-field-index-reference-read.jsonl`도975파일·690523문단, HWP5 509/HWPX435 텍스트 읽기·입력 불변 검증으로 종료했습니다. HWP3 26·HWPX 암호1·HWP5 암호1·SectionCountMismatch3 거부는 유지됩니다. 이 후보의 전체 텍스트 읽기 회귀이며 전체 필드/편집/조판 성공이 아닙니다.

최신 formula-worker 후보 SHA256 `cfdadd043558a5b4551c967657413332c07c5a4ec2d6c1ff9acb0fcbd9ad6c7d`로 `/tmp/hwpjs-current-reference-parser-audit.jsonl`을 다시 실행했습니다. 최종 summary는975파일·690523문단, HWP5 509/HWPX 435 텍스트 읽기·입력 불변 성공입니다. 거부31개는 HWP3 26, HWPX 암호1, HWP5 암호1, SectionCountMismatch3으로 아래 이전 후보와 동일합니다. 읽기 전용 projection 결과이며 전체 필드·편집·저장·UI 지원을 의미하지 않습니다.

아래 후보와 경로는 이전 실측 이력입니다.

후보 `/tmp/hwpjs-click-format.NPH9KZ/bin/hwpjs.wasm`, SHA256 `4345379c7126562e9583542f8a300c8088314cc63a1782a1739465965f9be781`입니다. 최종 코드로 재실행한 `/tmp/hwpjs-reference-text-read-verified.jsonl` 기준975파일,690523문단 projection입니다.

| 결과 | 파일 수 |
| --- | ---: |
| HWP5 텍스트 읽기·입력 불변 | 509 |
| HWPX 텍스트 읽기·입력 불변 | 435 |
| HWP3 signature 미지원 | 26 |
| HWPX 암호 거부 | 1 |
| HWP5 암호 거부 | 1 |
| HWP5 구역 개수 불일치 | 3 |

944성공을975전체 지원 완료로 표현하지 않습니다. 암호 거부는 기본 정책의 결과이며 decoder를 명시적으로 연결한 지원 검사가 아닙니다. HWP3는 사용자 요청으로 현재 구현·완료 검증 범위에서 제외합니다. 단순 signature 선택이 컨테이너/모든 내부 필드 검증을 뜻하지 않습니다.

## 구역 개수 불일치의 독립 관측

CFB.js/Node 해제로 DocInfo의 tag16 첫 u16과 실제 BodyText stream 목록을 대조했습니다. 참조 samples 기준:

| 파일 | 선언 | 관측 stream |
| --- | ---: | --- |
| issue5715/float_chart_ghost_ladder_gap.hwp | 2 | Section0 |
| issue5802/hf_cross_section_inherit.hwp | 11 | Section0, Section1 |
| issue5828/landscape_rowbreak_bleed.hwp | 4 | Section0 |

### 포맷별 버전 표본 범위

HWPX는 별도 독립 Python ZIP/XML로436개의 version.xml을 조사했습니다. `/tmp/hwpjs-line-geometry-reference-hwpx-version-inventory.json`은 종료 코드0·관측 오류0입니다. 모두2011/version HCFVersion이고 xmlVersion은1.1·1.2·1.3·1.31·1.4·1.5입니다. major/minor/micro/buildNumber/xmlVersion 조합은11종이며 micro/buildNumber 부재가1개 있습니다. HWP5 헤더 버전 분포와 합치지 않고, namespace가 다른 버전 또는 모든 필드 부재 처리의 완성 증거로 확대하지 않습니다.

해당1개는 `hwpx/issue2019_floating_form_74312.hwpx`이며 major5/minor0·patch0/revision0·xmlVersion1.1을 사용합니다. 단순 버전 정보 손실이 아니라 대체 속성군이 있는 원본입니다. version_xml은 micro/build_number와 patch/revision을 각각 nullable로 보존하며 서로 강제 덮어쓰거나 부재를0으로 채우지 않습니다. eba8c646 공개 editor로 원본 열기·무변경 저장·저장본 재열기/재저장을 실행해 ZIP byte-exact를 확인했습니다. 속성군의 의미 동치를 이 관측만으로 단정하거나 전체 편집·표시 성공으로 확대하지 않습니다.

최신 읽기 조사에서 HWP5로 분류된513개 원본을 독립 CFB.js FileHeader로 재관측했습니다. `/tmp/hwpjs-line-geometry-reference-version-inventory.json`은 종료 코드0·관측 오류0이며14개 버전이 존재합니다. 아래 수는 거부4개도 포함한 표본 수이지 버전별 완전 지원 수가 아닙니다.

| 헤더 버전 | 원본 수 |
| --- | ---: |
| 5.0.0.6 | 4 |
| 5.0.1.7 | 7 |
| 5.0.2.4 | 12 |
| 5.0.2.5 | 1 |
| 5.0.3.0 | 136 |
| 5.0.3.1 | 2 |
| 5.0.3.2 | 6 |
| 5.0.3.3 | 2 |
| 5.0.3.4 | 21 |
| 5.0.4.0 | 2 |
| 5.0.5.0 | 16 |
| 5.1.0.0 | 5 |
| 5.1.0.1 | 124 |
| 5.1.1.0 | 175 |

이 집계는 버전별 옵션 필드·기본값·저장/편집 동치 또는 표본이 없는 버전 지원을 인증하지 않습니다. 한 원본의 필드 경계 반례를 여러 버전으로 복제한 합성 검사와 실제 버전 원본 검사는 별도로 관리합니다.

최신 eba8c646 reader의 동일3거부에 대해 CFB.js/Node 독립 inspect와 DocInfo tag16을 다시 읽어 위 선언2/11/4·실제1/2/1을 재확인했습니다. RHWP 세 테스트 파일의 시작 주석도 원본 구역/문단 절단과 BinData 스텁임을 다시 확인했습니다. 이 관측은 원본을 수정하지 않았으며 임의 복구·일부 문서 편집 지원이나 전체 명세 동치의 증거가 아닙니다.

제품 파서만의 판단이 아니라 독립 stream 관측도 불일치합니다. 이 결과만으로 원본 생성기 실수·실제 누락 구역·CFB orphan 여부를 모두 확정하지 않습니다. 선언을 임의로 바꾸거나 없는 구역을 생성하지 않으며, 해당 RHWP 회귀 사례/원문 directory 구조는 후속 조사 대상입니다.

## 잘라낸 참조 파일의 추가 원인 분리

후속 편집 probe(`/tmp/hwpjs-reference-section-edit-probe.jsonl`)는 정정 파생본에서 실제 prefix 입력→독립 전체 Section/비대상 stream/metadata→재열기→undo/redo를 검사합니다. issue5715의1구역과 issue5802의2구역,총3구역은 통과했습니다. 원본3파일의 지원 성공에 더하지 않습니다.

issue5828 파생본의 첫 문단 입력은 `UnsupportedTextControl`로 거부됐고 거부 후 파생본 원문 저장 동일성은 통과했습니다. 독립 원문 관측에서 해당 문단 mask는0x104,제어 코드2두 개/8한 개/13한 개이고 직접 헤더는cold/secd입니다. 코드8의 원문은 `08007469744d00000000000000000800`(unit0)로 인라인16바이트/식별자Mtit를 포함합니다. 의미 확인 없이 모든 예약 코드8을 허용하거나 표식을 삭제하지 않으며, 기존 strict원본 검증도 유지합니다.

후속 source 검색에서 RHWP parser/body_text와 model/paragraph·parser/tags가 Mtit/Mign을 CTRL_HEADER 없는 제목 차례 표식으로 다루는 위치를 찾았습니다. 원문8유닛 보존 회귀도 있습니다. 해당 해석·형식의 직접 비교와 제한된 보존 지원은 다음 단계이며 현재 제품에 예약 코드8 전면 허용을 추가하지 않았습니다.

후속 제한적 [제목 차례 표식 보존](hwp5-title-mark-retention.md)을 추가하여 파생본 issue5828의 입력 거부도 해소했습니다. 새 후보의 probe에서4개 실제 구역이 독립 저장·재열기·이력을 통과했습니다. 원본의 컨테이너/선언 오류는 그대로이며 파생본 성공을 원본 지원 성공에 더하지 않습니다.

RHWP `tests/cases/issue_5715_float_chart_ghost_ladder_gap.rs`, `issue_5802_hf_cross_section_inherit.rs`, `issue_5828_landscape_rowbreak_bleed.rs`는 모두 원본의 일부 구역/문단을 잘라내고 BinData를 스텁으로 만든 축소 픽스쳐라고 명시합니다. 정상 원본 문서를 그대로 보존한 사례가 아닙니다.

세 원본은 native strict CFB에서 `InvalidFat`이고 permissive directory에서는 독립 CFB.js와 같은1/2/1개 BodyText stream을 관측했습니다. 루트 creation FILETIME도 모두 비영 값이며 엄격 writer는 `InvalidRoot`로 거부합니다. CFB 컨테이너를 재작성하면서 root creation을0으로 만든 메모리 파생본은 strict CFB를 통과하지만 여전히 `SectionCountMismatch`입니다. 여기에 DocInfo tag16의 section count만 실제 stream 수로 바꾸면 reader가 각각118/23/2614문단을 읽습니다.

`tools/reference-section-count-probe.mjs`와 `/tmp/hwpjs-reference-section-count-probe.jsonl`이 이 분리 검사를 소유합니다. CFB.js로 비대상 stream·디렉터리 metadata를 비교하고 root creation 정정만 명시적으로 허용합니다. DocInfo의 decoded 변경과 source 파일을 다시 읽은 바이트 동일성도 확인합니다. 실제 source 파일을 쓰거나 원본 지원 성공으로 집계하지 않습니다. 후보 hash는 앞의434537...과 같습니다. 별도 경고/명시적 복구 입력 정책이나 정상화 파생본 편집은 후속 결정이며 기존 strict 검증을 임의로 제거하지 않았습니다.

## 도구 반례

중복 wasm/root,빈 값,미지원 옵션5반례의 검사1/1통과. 입력 불변 검사가 실패하면 verified 상태로 남기지 않도록 성공 집계를 검사 이후에 수행합니다. 중단된/실행 중인 JSONL을 최종 summary처럼 읽지 않습니다. 제품 기본 WASM은 교체하지 않았습니다.
