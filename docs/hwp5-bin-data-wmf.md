# HWP5 BinData WMF 선택 검사

## 계약과 소유권

HWP5 [BinData 표 17~18](../legacy/rust/documents/docs/spec/hwp-5.0.md)은 항목의 형식 이름·정확한 스트림 ID·항목별 압축 정책을 정합니다. WMF 자체의 헤더·record·EOF 규칙은 [WMF 공통 코어](wmf-header.md)가 소유합니다. [Microsoft META_HEADER](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/d169108a-e3fe-436a-bb44-bea61a46ce56)는 전체 metafile WORD 길이를 선언하고, [META_PLACEABLE](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/828e1864-7fe7-42d8-ab0a-1de161b32f27)은 그 앞의 별도 22바이트 확장입니다. 명세의 이름만으로 직접 BinData의 모든 bytes를 WMF라고 가정하지 않습니다.

`container.Options.images`와 그 안의 `wmf`는 기본 null입니다. 둘 다 선택할 때만 기존 정확한 BinData 경로·항목별 raw-DEFLATE 결과를 검사합니다. UTF-16LE `wmf` 확장자(ASCII 대소문자 무관) 또는 공통 `wmf/header.zig::looksLike` 후보 바이트를 사용하며, PNG/JPEG/BMP/GIF/PCX 우선순위를 바꾸지 않습니다. 선언된 WMF가 손상되면 오류로 전파하고 다른 형식/원본으로 재시도하지 않습니다. 다른 확장자의 WMF 바이트는 `extension_disagreements`로 진단합니다. HWPX도 같은 후보 판정을 재사용하지만 ZIP·MIME 선택은 기존 HWPX 계층이 소유합니다.

`container/wmf_images.zig`는 헤더·generic record framing/EOF만 호출하고 images·원본 WMF bytes·record 수·placeable 수·허용된 zero WORD 수·확장자 불일치의 scalar만 집계합니다. `max_total_wmf_bytes`는 기본 256MiB, 항목별 `max_bytes`는 64MiB입니다. 반복 참조도 매번 검사·합산하며 실패 시 이전 보고서를 바꾸지 않습니다. `placeable_size_layout`은 기본 공식 `specified`이고, 관측 `observed_payload_words`를 쓰려면 호출자가 명시해야 합니다. trailing zero WORD도 기본 0이며 자동 추측하지 않습니다.

이 검사는 그리기 명령의 의미·이미지 렌더링·편집·저장을 구현하지 않으며 `semantics_deferred`를 유지합니다. 제품 JS 공개 API는 여전히 CFB 중심입니다. WMF 헤더 검사 성공을 전체 HWP 문서 검증으로 세지 않습니다.

## 실파일 근거와 보류

로컬 두 corpus의 HWP 후보 584개를 독립 DocInfo 조사로 확인하면 strict CFB 관측 482개, CFB 거부 73개, 비CFB 29개입니다. 관측 중 보안 정책으로 7개를 제외한 475개 문서의 BinData 형식 선언은 WMF 66건입니다. 독립 Node WMF framing 조사에서 65건(표준 64·placeable 1)은 header 길이·record 경계·EOF·선언 최대 record가 일치했고 1건은 `InvalidWmfSize`였습니다. 이 검사에서는 유효 65건의 해제 WMF bytes 합계가 70,379,492, record 수 합계가 157,474입니다. CFB 디렉터리의 `.wmf` 이름 74건은 **경로 수**이며 DocInfo 참조 수와 혼동하지 않습니다. 이 corpus 수치는 제품 문서 의미·렌더링 지원률이 아닙니다.

선택 표본 `reference/rhwp/samples/156636617_240617 2024년 5월 월간 수출입 현황(확정치).hwp`는 DocInfo의 WMF ID 3·4를 문서 기본 압축으로 저장합니다. 독립 Node 조사에서 압축 크기는 19,471·7,462바이트, 해제 크기는 92,032·35,626바이트, record 수는 988·539이며 각 header의 MaxRecord는 실제 최대 4,118 WORD와 일치합니다. 해제 payload SHA-256은 `11c89d411b2451fdc05584484086fd4e3ec3115aeb8f4ba87b248efd7caf1449`와 `2fa3e8c1ced0751ad0aab422686ad325e721ee7cf1edf882c22b18be5df4f49f`입니다. Zig 컨테이너 선택 보고서는 두 항목의 127,658바이트·1,527 record와 일치하고, 선택 전 미처리 수에서 정확히 2건만 이동합니다.

실제 placeable WMF 한 건은 `reference/rhwp/samples/issue6060/30307_local_service_reform.hwp`의 `/BinData/BIN0003.WMF`입니다. Zig에서 strict CFB→정확한 스트림→raw-DEFLATE→WMF 코어를 직접 연결하면 900바이트·77 record·placeable 1건으로 통과하고, 독립 Node corpus 조사도 같은 값을 냅니다. 다만 같은 문서의 `/BinData/BIN0002.png`에는 IEND 뒤 1,740바이트의 0 패딩이 있으며, 현재 PNG strict 검사는 이를 `TrailingData`로 거부합니다. 따라서 이미지 검사를 켠 **전체 HWP 컨테이너 검사**는 WMF에 도달하기 전에 실패합니다. 이 placeable 사례를 전체 문서 경로 성공으로 세지 않으며, PNG 패딩 허용 여부와 명시적 정책은 별도 후속 검증 대상입니다.

탐색적 CFB 경로 조사에서는 74건 중 기본 압축 정책으로 펼친 64개 표준 WMF와 1개 placeable WMF가 선언 전체 크기와 맞았습니다. 6개는 선언 EOF 뒤 **비영 데이터**가 남았고, 암호 문서의 3개는 그대로 raw-DEFLATE를 적용할 수 없었습니다. 이 경로 수준 조사는 DocInfo 참조·항목별 압축 오버라이드를 적용하지 않은 선행 관측이며, 위의 별도 DocInfo 전수 조사와 구분합니다. 실제 선언된 실패 1건은 `reference/rhwp/samples/2025 행정업무운영 편람(최종).hwp`의 `/BinData/BIN0178.WMF`입니다. 1,570,816바이트로 해제되지만 header는 1,558,428바이트까지만 선언하며 EOF 뒤 비영 데이터가 남습니다. Zig의 실제 HWP 컨테이너 선택 경로도 이 파일을 `InvalidWmfSize`로 거부합니다. 이를 zero padding으로 무시하거나 WMF 검증 성공으로 바꾸지 않습니다. 잔여 데이터의 정체와 암호 문서는 후속 조사 대상입니다.

## 검증과 적대적 재검토

`zig test src/root.zig --test-filter 'HWP WMF'`는 byte/확장자 선택, 표준·placeable, 누적 한도, 헤더 길이·checksum·EOF 손상, 비영 꼬리 거부와 보고서 원자성을 검사합니다. `--test-filter 'HWP container WMF'`는 합성 DocInfo→CFB→BinData, 반복 참조, 모든 할당 실패 지점을 검사합니다. 독립 JS framing 반례는 `node --test tests/hwp5/wmf-framing-evidence.test.mjs`로 확인하며 기본 audit에도 포함합니다. 선택 실파일은 `zig test src/hwp5_wmf_known_survey.zig -O ReleaseFast --test-filter 'HWP WMF known'`, 독립 해시·DocInfo·raw-DEFLATE 대조는 `node tests/hwp5/wmf-corpus.mjs`, 선언 WMF 전수 분류는 `node tests/hwp5/wmf-corpus-survey.mjs`로 재현합니다. 세 실파일 명령은 Git에 없는 로컬 rhwp clone이 필요하며 기본 audit에는 포함하지 않습니다.

적대적 검토에서는 기존 형식 우선순위, 짧은 WMF 후보, 손상된 declared size, EOF 부재·뒤쪽 데이터, placeable checksum, 두 크기 정책의 명시적 선택, 허용 zero WORD의 명시적 선택, 개별/누적 byte 한도, 반복 참조와 실패 뒤 보고서 불변성을 확인합니다. 독립 Node 조사는 CFB 바이트 조회에 제품 CFB WASM을 재사용하므로 CFB 파서 자체의 독립 검증은 아닙니다. 전수 조사의 65건도 Zig 문서 전체 조립 경로의 65건 통과를 뜻하지 않으며, 그 경로의 실제 양성 증거는 위 표준 WMF 두 항목뿐입니다. placeable 한 건은 WMF 스트림 경로만 입증합니다.

최종 Debug `zig build test --summary all`은 2,476/2,476, ReleaseSafe `zig build audit -Doptimize=ReleaseSafe --summary all`은 41/41 단계·2,515/2,515 테스트가 통과했습니다. WMF 전용 필터는 Debug·ReleaseSafe·ReleaseFast 각각 4/4, 컨테이너 필터는 세 모드 각각 2/2, 선택 실파일은 ReleaseFast 3/3 통과했습니다. 기존 HWPX picture payload 필터는 Debug 12/12, 독립 Node framing 반례는 1/1, 실파일 해시·선언 WMF 전수 분류도 위 기대값과 일치합니다. Zig/JS 문법·포맷 및 diff 공백 검사는 별도로 통과했습니다. 이 수치를 WMF 그리기 명령·렌더링 또는 전체 HWP 문서 의미 검증의 완료로 해석하지 않습니다.
