# 변경 추적 서명 필드의 관측 연결

[필드 계약](hwp5-fields-contracts.md) · [ViewText 조사](hwp5-track-change-viewtext.md)

## 근거와 지원 범위

공개 명세 revision 1.3의 표 128은 `FIELD_REVISION_SIGN`의 ID를 `%sig`로 정의합니다. 표 152는 공통 필드의 속성·UTF-16 명령·instance ID 배치를 정의하지만 아래 별칭 조합이나 숫자 인자의 의미는 설명하지 않습니다.

`reference/rhwp/samples/task2070/1130000-201900011_D0150004-1-002_2017년기준 시장구조조사.hwp`에서 제어코드 3의 `%sig` 텍스트 토큰이 `%unk` 컨트롤 헤더 및 정확한 `$RevisionSign;1;` 명령과 연결됩니다. BodyText/Section0과 ViewText/Section0에 각각 한 건입니다.

| 스트림 | 문단 레코드 인덱스 | 문단 레코드 바이트 위치 | 토큰 UTF-16 위치 | 컨트롤 레코드 인덱스 |
|---|---:|---:|---:|---:|
| BodyText | 34377 | 1024163 | 133 | 34380 |
| ViewText | 43359 | 1414932 | 133 | 43363 |

인덱스와 바이트 위치는 압축 해제한 해당 Section 기준의 0 기반 값입니다. 이 표본의 관측 표현을 지원하는 것이며 모든 버전·명령 인자를 해석한 것이 아닙니다.

## 책임과 보존

`body/revision_sign_field.zig`는 명령 전체의 정확한 UTF-16 바이트 비교만 소유합니다. `control_identity.zig`는 토큰 `%sig`·헤더 `%unk`·code 3을 확인한 뒤 기존 `field_start.Properties.parse`의 길이 검사를 사용해 `observed_revision_sign`을 반환합니다. 링크는 두 원본 ID를 그대로 보존합니다. 명령 내부의 NUL·추가 구분자·다른 인자를 같은 명령으로 정규화하지 않습니다. 공통 필드 뒤 extra는 기존 파서 계약대로 허용합니다.

동일 ID는 기존 exact 경로를 유지합니다. 다른 불일치에 대한 wildcard나 레이아웃 위치 제한 완화는 없습니다. 명령 실행, 서명 인증, 변경 추적 적용·범위·작성자 참조, 숫자 `1`의 의미는 미구현입니다.

## 회귀 검증

`body/revision_sign_tests.zig`는 모든 공통 속성 prefix 잘림, 명령 바이트 변조, 잘못된 토큰·헤더·제어코드, exact 경로와 extra 보존을 검사합니다. `tests/hwp5/revision-sign.mjs`는 명령의 모든 비트 변조와 인자·종결 변형을 추가합니다. 합성 입력은 정상 46건·거부 309건입니다.

실제 두 스트림에서 독립 레코드 순회로 위 링크와 명령 바이트를 대조합니다. 두 decoded 문서 검사(mode 24)는 성공하고 각각 관측 필드 연결 수 1을 반환합니다. 전체 원본 컨테이너(mode 25)도 성공합니다. 명령의 `1`을 `2`로 바꾸면 링크와 decoded 검사가 실패하며, BodyText를 같은 방식으로 변경한 메모리 내 CFB도 실패합니다. 오류 후 원본 보고서의 바이트 동일성을 검사합니다. 파일·스냅샷은 수정하지 않습니다.

ViewText의 mode 24 성공은 직접 공급한 스트림에 대한 결과입니다. 기본 컨테이너의 ViewText는 여전히 framing만 검사하고 의미 검증을 deferred로 보고합니다. 이 테스트로 그 경계를 완료 처리하지 않습니다.

Debug → ReleaseSafe → ReleaseFast 순차 전체 audit가 모두 성공했습니다. 각 모드 네이티브 266/266, Node 47/47이며 WASM 호출 수는 Debug/Safe 1,382,715회, Fast 1,382,721회입니다. 앞 두 모드 완료 후 원본 성공·보고서 복구 확인 6호출을 추가했고, 최종 전용 회귀 테스트는 세 모드 산출물에서 모두 재실행해 통과했습니다. 포맷·JS 구문·문서 링크·diff 검사도 통과했습니다. 전체 로그는 `/tmp/hwpjs-revision-sign-{debug,safe,fast}.log`입니다. 호출 수는 지원 완성도를 뜻하지 않습니다.
