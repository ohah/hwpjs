# HWP5 문단 텍스트 미리보기 API

`createHwp5Reader`는 CFB → FileHeader/DocInfo/BodyText Section → HWP5 레코드·문단 토큰을 연결하는 **읽기 전용** JS/WASM API입니다. HWP 5.0/5.1의 일부 입력을 대상으로 하며 모든 HWP 버전·필드·렌더링·편집·저장을 구현한 문서 모델이 아닙니다.

## 사용과 결과

`zig build -Doptimize=ReleaseSafe` 뒤 Node.js에서는 다음처럼 실행합니다. 브라우저에서도 WASM 바이트를 `fetch`한 뒤 같은 API에 전달할 수 있습니다.

```js
import { readFileSync } from 'node:fs';
import { createHwp5Reader } from './js/hwp5.mjs';

const reader = await createHwp5Reader(readFileSync('zig-out/bin/hwpjs.wasm'));
try {
  const result = reader.readText(readFileSync('sample.hwp'));
  for (const section of result.sections)
    for (const paragraph of section.paragraphs)
      console.log(section.index, paragraph.text, paragraph.tokens);
} finally {
  reader.close();
}
```

`version`은 네 숫자 배열입니다. `sections`는 원본 Section 번호 순서이며, 모든 문단 헤더를 순서대로 담습니다. 문단의 `nodeIndex`·`parentNodeIndex`는 해당 Section 레코드 트리의 인덱스입니다. `declaredUnits`는 헤더의 UTF-16 코드 단위 수이고, `textPresent`는 직접 `PARA_TEXT` 레코드가 실제로 있는지 나타냅니다. 직접 텍스트가 없으면 빈 문자열과 빈 토큰 배열을 반환하되 `textPresent: false`로 구분합니다.

`tokens`는 원래 UTF-16 코드 단위 오프셋 `startUnit`과 원본 바이트 `raw`를 소유 복사합니다. 일반 텍스트 토큰에는 UTF-8 JS 문자열 `text`가, 제어 토큰에는 `code`가 있습니다. 문단의 `text`는 일반 텍스트 토큰만 이어 붙인 편의 필드입니다. 제어 토큰은 삭제된 게 아니라 `tokens`에 남지만, 객체·필드·각주 등의 표시 문자열로 확장하지 않습니다. 원본 레코드 전체·서식·임의 미지원 구조는 이 미리보기 결과에 포함되지 않으므로 이를 재저장에 사용하면 안 됩니다.

암호화·DRM·배포용 문서와 지원 범위 밖 버전은 명시적으로 거부합니다. CFB는 먼저 strict 모드로 읽습니다. 관측된 메타데이터 오류에 한해 원본을 건드리지 않는 임시 복사본의 [제한적 보정](hwpx-ole-observed-repairs.md)을 거쳐 전체 strict 검사를 다시 통과한 경우에만 미리보기를 진행합니다. 기본 CFB API의 strict 판정은 변경되지 않으며, 미리보기 성공이 원본 CFB의 명세 적합성을 뜻하지 않습니다. DocInfo의 구역 수와 실제 BodyText Section 목록을 대조하며, 모든 레코드의 경계·계층과 문단 헤더·텍스트 길이·UTF-16 입력은 검사합니다. 미리보기와 무관한 DocInfo 서식·본문 표 등의 payload 의미는 해석하지 않으므로 그 부분의 손상까지 검증했다는 뜻이 아닙니다. `DocumentProperties`는 기본 7개 u16(14바이트) 또는 전체 caret 3개 u32까지 있는 26바이트 이상만 미리보기에서 허용하고, caret 일부만 있는 길이는 거부합니다. 일반 DocInfo 파서의 필드 계약은 변경하지 않습니다. 메모리 입력과 결과 크기는 각각 64 MiB로 제한합니다. `close()` 뒤에는 다시 읽을 수 없고, 이전에 반환한 JS 문자열·배열은 독립적으로 유지됩니다.

## 검증

`node --test tests/hwp5/text-preview.test.mjs`는 추적 실파일 48개 중 지원 입력 45개의 모든 문단 원시 텍스트 바이트를 독립 JS 레코드 순회 및 Node raw DEFLATE 결과와 대조합니다. 읽힌 파일의 FileHeader 버전은 5.0 계열 12개·5.1 계열 33개입니다. 나머지는 배포용 2개·암호화 1개로 명시적 거부합니다. `example.hwp`의 문단 헤더는 있지만 직접 텍스트가 없는 3건도 `textPresent: false`로 확인합니다. 손상 CFB·암호화 플래그·다중 구역·재호출·닫힌 reader·wire 잘림·선두 BOM 보존 반례도 검사합니다. 이는 한글 프로그램의 화면 텍스트나 모든 버전의 완전한 문서 의미와의 동등성 검증이 아닙니다.

2026-09-28 CFB 편차 조사에서는 로컬 `.hwp` 경로 789개를 조사했습니다. 원본 strict CFB가 실패한 91개 중 기본 CFB 읽기가 가능한 90개의 활성 스트림 1,175개는 경로와 SHA-256이 레거시 `cfb.js`와 일치했습니다. 나머지 1개는 FAT 자체 표식이 잘못돼 두 기본 읽기에서 열리지 않았지만, DIFAT가 지정한 마지막 FAT 섹터의 표식 한 칸만 별도 복사본에서 고치면 두 기본 읽기의 스트림 5개가 서로 일치했습니다. 제한적 복사본 보정 뒤 91개 모두 전체 strict CFB 검사를 통과했으며, 별도 실파일 검사는 직전 7개 거부 문서의 활성 스트림 137개를 원본의 기본 읽기 또는 FAT 표식 한 칸만 고친 기본 읽기와 바이트 단위로 대조했습니다. 당시 HWP5 미리보기는 789개 중 667개 경로에서 성공했습니다. 경로 수는 중복 파일을 포함하며 CFB 복사본의 strict 성공이나 토큰 미리보기 성공이 원본 CFB의 명세 적합성 또는 완전한 문서 의미를 뜻하지 않습니다.

## 2026-09-28 거부 파일 전수 분류와 미리보기 범위 수정

`node tools/hwp5-preview-corpus-audit.mjs`는 현재 `reference`·`legacy`의 `.hwp` 경로 791개를 파일별로 읽습니다. 이전 789개와는 파일 목록 범위가 달라 성공 2개가 더 포함되며, 이전 거부 122개는 동일했습니다. 수정 전 669개가 성공했고, 거부 122개는 CFB 서명이 아닌 HWP 원시 헤더 84개, ZIP 헤더 3개, 512바이트 미만의 비문서/placeholder 12개, 배포용 8개, 암호화 2개, 미지원 버전 1개, 잘못된 raw DEFLATE 1개, 선언 구역 수와 실제 Section 수가 다른 3개, `UnexpectedEnd` 8개였습니다. 마지막 8개는 독립 레코드 경계 순회상 전부 framing 자체는 완전했습니다. 그중 4개는 DocInfo의 서식 tag 21/24, 2개는 본문 표 tag 77의 짧은 payload 때문에 **미리보기와 무관한 파서**에서 실패했고, 2개는 `DocumentProperties`의 14바이트 기본 필드 뒤 caret 12바이트가 없었습니다. [로컬 HWP5 명세](../legacy/rust/documents/docs/spec/hwp-5.0.md)는 26바이트를 기록하고, 레퍼런스 `rhwp/src/parser/doc_info.rs`는 caret 좌표를 조건부로 읽습니다. 따라서 14바이트 형식은 명세 일반 규칙이 아니라 관측된 미리보기 호환 예외로만 허용합니다.

수정 후 677/791개가 미리보기에 성공하고 114개가 명시적으로 거부됩니다. 거부 내역은 위의 서명/비문서 99개, 배포용 8개, 암호화 2개, 미지원 버전 1개, DEFLATE 오류 1개, 구역 수 불일치 3개입니다. 마지막 3개는 독립 DocInfo 레코드 순회에서 선언/실제 Section 수가 각각 4/1, 2/1, 11/2로 확인돼 자동 보정하지 않습니다. 허용 677개 중 기본 CFB 읽기가 가능한 676개의 문단 **459,401개**는 별도 JS 레코드 순회·Node raw DEFLATE가 추출한 텍스트 원시 바이트와 모두 일치했습니다. 남은 1개는 원본 FAT 표식 오류로 기본 CFB 오라클이 열지 못하며, 위의 별도 FAT 한 칸 보정·CFB 스트림 대조 범위에 속합니다. `--files`는 파일별 분류를 출력합니다. 이 대조는 텍스트 원시 바이트에 한정되며 화면 표현·서식·객체·저장 동등성을 증명하지 않습니다.
