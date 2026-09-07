# PNG 압축 텍스트 검증

## 범위와 명세

[PNG Third Edition §11.3.3.3](https://www.w3.org/TR/png-3/#11zTXt)의 zTXt는 키워드·NUL·압축 방식·압축 본문으로 구성됩니다. `compressed_text.zig`는 기존 keyword.split, bounded zlib.decode, text.validateLatin1를 조합합니다. 키워드·Latin-1 허용 범위는 [비압축 텍스트 계약](png-text.md)이 소유하며 재구현하지 않습니다.

압축 방식은 0만 지원합니다. 완전한 zlib 스트림 하나를 요구하며 헤더·윈도 크기·DEFLATE·Adler32·출력 한도는 [공통 zlib](zlib-validation.md)가 검사합니다. preset dictionary·raw DEFLATE·gzip으로 전환하지 않습니다. 뒤에 붙은 바이트나 두 번째 zlib 스트림도 거부합니다. IDAT의 사용하지 않는 후미 처리 정책을 텍스트에 적용하지 않습니다. 빈 텍스트도 완전한 빈 zlib 스트림이 있어야 하며 압축 데이터의 부재로 대체하지 않습니다.

`image.png_compressed_text.decode(allocator, payload, max_output)`는 keyword(입력을 빌림)와 text(압축 해제된 소유 버퍼)를 반환합니다. 호출자는 입력의 키워드 수명을 유지하고, 사용 후 Value.deinit으로 본문만 해제합니다. 문자 검사나 trailing 오류가 나면 이미 할당한 본문도 해제합니다. 문자의 인코딩·줄바꿈·키워드 대소문자를 바꾸지 않습니다.

## 합계 한도와 문서 조립

`pixels.Options.max_text_bytes`는 기본 64 MiB이며 tEXt와 zTXt의 **본문 바이트 합계**에 적용합니다. 키워드·청크 헤더·구분자는 여기에 더하지 않으며 별도의 기존 파일·청크·개수 한도로 제한합니다. 픽셀 출력 한도 max_decoded_bytes와도 독립적입니다. 0은 모든 텍스트를 금지하는 설정이 아니라 빈 본문만 허용하는 설정입니다.

`metadata.State.consumeBounded`가 남은 본문 예산을 계산합니다. zTXt를 해제하는 중에 남은 한도를 넘으면 실패하며, 출력 후 크기를 검사하는 방식이 아닙니다. 성공한 한 청크만 카운트에 반영하고 임시 본문은 즉시 해제합니다. tEXt와 zTXt 순서가 바뀌어도 같은 합계 한도를 적용합니다. 뺄셈 전 범위를 검사해 usize 오버플로를 피합니다.

기존 State.consume는 할당하지 않는 메타데이터 부분집합이며 zTXt를 소비하지 않습니다. PNG 전체 검사 경로는 반드시 consumeBounded를 사용합니다. tEXt 집계는 공통 recordText가 소유합니다. 픽셀 보고서의 기존 text_*는 tEXt 전용으로 유지하고 compressed_text_chunks/compressed_text_keyword_bytes/compressed_text_bytes를 zTXt 전용 통계로 추가합니다. 통계 보고서는 문자열 목록을 소유하는 문서 모델이 아닙니다.

반복 키워드·여러 zTXt·IDAT 전후 배치를 허용하되 필수 PNG 청크 순서는 그대로 검사합니다. 검증한 압축 payload 바이트만 ancillary deferred에서 제외합니다. 압축 해제 본문 크기와 입력 payload 크기를 혼용하지 않습니다. iTXt·키워드별 의미·제품 JS 텍스트 API·편집·저장은 아직 미구현입니다.

## 적대적 검증

네이티브는 방식 바이트 0..255, payload 모든 잘림, 출력 정확한 한도와 1바이트 부족, 빈 본문/0 한도, 빌린 키워드·소유 본문, 문자 오류, tEXt/zTXt 양 순서 합계 한도, 실패 상태 불변·usize 경계, 모든 할당 실패와 inflate 이후 오류 정리를 검사합니다.

테스트 전용 WASM mode 136 입력은 u32 LE 본문 합계 한도 + PNG입니다. 출력은 8개 u32 LE(tEXt 청크/키워드/본문, zTXt 청크/키워드/본문, deferred 청크/바이트)와 입력 순서의 텍스트 항목입니다. 각 항목은 종류(0=tEXt, 1=zTXt)·키워드 길이·본문 길이(u32 LE 각각) 뒤에 두 원문 바이트를 붙입니다. 제품 JS ABI는 변경하지 않습니다.

독립 JS는 Node inflateSync와 소비 길이, 공통 독립 키워드/Latin-1 검사로 기대값을 구성합니다. stored/fixed/dynamic 계열 생성 옵션, 압축 방식 전체, 각 문자 위치·키워드 길이, 잘림·체크섬·후미·사전·다른 압축 wrapper, 혼합/반복 청크, 1 MiB 압축 본문과 작은 예산 거부, 배치·입력 한도, 실제 HWP PrvImage를 비교합니다.

적대적 재검토에서 독립 검사기의 본문 배열 복사와 늦은 합계 검사를 보강했습니다. 문자 검사는 Buffer를 직접 순회하고 Node inflate에도 남은 합계 예산을 적용합니다. Node 24에서는 maxOutputLength=0이 ERR_OUT_OF_RANGE이므로, 예산 0일 때만 1바이트 상한으로 해제한 뒤 반드시 빈 결과인지 확인합니다. 검사기 자체의 합계 6/5바이트와 0바이트 경계도 정규 테스트에 포함합니다.

이 보강 후 Debug·ReleaseSafe·ReleaseFast 전체 audit를 재실행해 각각 17/17 단계, 네이티브 373/373, 감사 스크립트 3,191,512 checks를 통과했습니다. 전용 결과는 정상 739건·거부 1,920건(입력/출력 한도 미달 거부 포함)입니다. 실제 PNG 32개에는 zTXt가 없어 양성 압축 텍스트는 합성 입력으로 검증했습니다.

추가 수동 적대적 검사에서는 1 MiB 본문을 가진 zTXt를 반복한 PNG를 사용했습니다. Debug WASM의 기본 텍스트 예산에서 합계 64 MiB는 허용되고 65 MiB는 LimitExceeded로 거부됐습니다. 보강된 독립 Node 검사기도 같은 허용/거부 결과였습니다. 이 추가 검사는 정규 audit 횟수에 포함하지 않습니다. 포맷·변경 JS 문법·관련 로컬 문서 링크 34개·diff 공백 검사도 통과했습니다.
