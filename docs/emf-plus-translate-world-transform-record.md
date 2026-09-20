# EMF+ TranslateWorldTransform record

## 범위와 단일 출처

`src/image/emf/emf_plus_translate_world_transform.zig`는 MS-EMFPLUS 2.3.9.7의 EmfPlusTranslateWorldTransform wire record를 소유합니다. Type `0x402D`, Size 20, DataSize와 실제 data 길이 8을 각각 검사하고 `dx`, `dy`를 little-endian IEEE 754 binary32 순서로 읽습니다.

A flag는 `0x2000`이며 set이면 post-multiply, clear이면 pre-multiply입니다. 공용 `emf_plus_record_flags.zig`의 의미별 `isPostMultiply` 해석을 재사용하고 나머지 reserved Flags 원값을 보존합니다. float의 NaN, 무한대와 signed zero는 정규화하지 않습니다.

## 미지원 경계

반환값은 translation wire 명령만 표현합니다. 현재 world transform에 translation matrix를 실제 pre/post multiplication하거나 Save/Restore snapshot 및 렌더링에 적용하는 기능은 구현하지 않았습니다. 로컬 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 출력 동등성도 주장하지 않습니다.

## 검증 기록

A clear/set와 reserved Flags, `dx`/`dy` 순서와 원시 float bit, 모든 payload 잘림, RecordType과 세 size 축, 공통 framing에는 유효하지만 전용 크기는 잘못된 stream, count overflow·comment rollback 및 실제 EMF framing을 검사합니다.

다음 다섯 관점으로 적대적으로 검증했습니다.

- 공식 Type `0x402D`, Size 20, DataSize 8과 실제 payload 길이를 독립적으로 위반했습니다.
- little-endian `dx`/`dy` 순서, signed zero와 NaN payload bit가 보존되는지 확인했습니다.
- A bit의 pre/post 의미와 reserved Flags 원값 보존을 공용 flag SSOT에 대조했습니다.
- 전용 parser 호출을 제거하거나 report 증가를 무력화해 stream·framing·rollback 테스트가 각각 이를 검출하는지 확인했습니다.
- 실제 행렬 multiplication·graphics state replay를 wire parser 완료 범위로 과장하지 않는지 문서와 코드를 대조했습니다.

Type, Size, DataSize, data slice, A flag, `dx`/`dy` 순서, `dy` bit, stream parser와 stream counter의 고유 의미 변이 9개를 Debug·ReleaseSafe·ReleaseFast에서 각각 실행했습니다. 최초 판정기는 컴파일 오류도 검출로 오인할 수 있어 그 결과를 폐기했고, 컴파일 성공 후 테스트 실패 집계가 있는 실행만 인정하도록 강화했습니다. 최종 27/27회가 실행된 의미 테스트에서 검출됐고 생존·컴파일 오류·timeout은 0입니다. 산출물은 `/tmp/hwpjs-translate-mutants-run`입니다.

전체 `audit`도 세 모드에서 각각 40/40 단계와 1,804/1,804 테스트(native 1,765, chart 31, WMF 8)를 통과했습니다. HWP/WASM 검사는 각 모드 8,905,827회, import 위반 0이며 CFB 변이 12,000회에서 trap 0입니다. 로그는 `/tmp/hwpjs-emfplus-translate-world-transform-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
