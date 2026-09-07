# Bibliography 저장 배치의 미확정 경계

## 확인된 명세와 레퍼런스

HWP5 revision 1.3 §3.2.12와 로컬 명세 `legacy/rust/.claude/skills/hwp-spec/3-2-12-참고문헌.md`는 Bibliography storage에 참고문헌을 XML 파일 형태로 저장한다고 설명합니다. 자식 stream 이름, 직접/중첩 배치, 길이 envelope, 인코딩, 압축, XML 루트/필드 스키마는 이 항목에 정의되어 있지 않습니다.

현재 로컬 Rust/JS·rhwp·기타 reference의 소스 검색에서는 해당 storage를 파싱하는 구현을 찾지 못했습니다. rhwp의 UI 상수와 복사된 명세에 있는 이름을 wire 구현으로 취급하지 않았습니다. 외부 [hwp-cli 구조 설명](https://github.com/STAIxBWLB/hwp-cli/blob/main/docs/design/10-hwp5-structure-map.md)도 Bibliography를 unsupported/passed over로 분류합니다. 이 검색 결과는 다른 구현이 존재하지 않는다는 증명이 아닙니다. 외부 코드를 채택하거나 의존성에 추가하지 않았습니다.

## 2026-09-07 읽기 전용 표본 조사

로컬 `reference/rhwp` HEAD는 `e8800c8def63449808a4092798442652ed460552`입니다. `rg --files reference/rhwp/samples -g '*.hwp'`의 파일 목록을 대상으로 조사했습니다. 64 MiB 초과 파일은 생략하는 정책이었으나 해당 파일은 0개였습니다.

| 단계 | 결과 |
|---|---:|
| `.hwp` 경로 | 536 |
| CFB 시그니처 아님 | 29 |
| strict CFB 성공 | 434 |
| strict 거부 후 호환 모드 성공 | 73 |
| 호환 모드에서도 거부 | 0 |
| 열린 CFB의 Bibliography 루트 | 0 |
| 열린 CFB의 XMLTemplate 루트 | 0 |

strict 거부는 InvalidRoot 34개, InvalidFat 36개, InvalidUnusedEntry 3개였습니다. 이는 strict/호환 모드 차이의 실측이며 이번 조사에서 각 파일의 명세 위반 원인을 새로 증명한 것은 아닙니다. 거부된 73개를 무시한 채 전체 corpus에 storage가 없다고 주장하지 않도록 호환 모드에서도 직접 루트 자식을 확인했습니다. 29개 비 CFB 파일은 HWP5 storage 조사의 대상이 아닙니다. 경로 수는 독립 제작 문서 수나 버전별 지원률이 아닙니다.

이름의 단순 문자열 비교에 치우치지 않도록 CFB 507개 전체를 호환 모드로 다시 열고 CFB 이름 비교를 사용하는 `findExact('/Bibliography')`와 `findExact('/XMLTemplate')`로 재확인했습니다. 두 경로 모두 0개였습니다.

별도로 기존 Rust HWP fixture 48개는 모두 strict CFB로 열렸고 Bibliography가 없었습니다. 두 corpus에 중복이 있을 수 있으므로 독립 표본 수로 합산하지 않습니다.

## 구현을 확정하지 않은 부분

임의의 `Bibliography.xml` 이름, 모든 직접 자식이 UTF-16LE라는 정책, XMLTemplate과 같은 DWORD/WCHAR envelope를 추가하지 않았습니다. `.xml` 확장자만으로 자동 파싱하거나 FileHeader 압축 플래그를 적용하지도 않습니다. 해당 stream은 계속 미소비로 남습니다. 이는 Bibliography 지원 완료가 아니라, 추정 구현으로 파일을 잘못 거부하거나 성공으로 오인하지 않기 위한 명시적 미구현 경계입니다.

필요한 증거는 Bibliography가 실제 포함된 HWP5 표본 또는 구체적인 wire 설명입니다. 확보 후 root/child kind·저장 방식·XML 인코딩·schema/본문 인용 참조를 확인하고 기존 XML 예산/검사기에 연결해야 합니다. 전체 목표의 완료 항목에서 제외하지 않습니다.

다른 경로의 구현은 계속 진행할 수 있습니다. PrvImage 조사에서는 fixture 48개 중 부재 1, PNG 시그니처 32, GIF 시그니처 14, JPEG/JFIF 시그니처 1이 확인됐습니다. HWP §3.2.7의 BMP/GIF 설명과 실제 관측을 구분하고, 해당 이미지별 문법 검증은 별도 계층에서 진행합니다. 시그니처 관측만으로 이미지 유효성이나 렌더링 성공을 주장하지 않습니다.
