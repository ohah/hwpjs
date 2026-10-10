# 도형 공통 속성의 미해석 꼬리

`src/hwp5/edit/drawing_object_extras.zig`는 기존 drawing_sources의 gso/직접 component/문단 검증과 object_common 파서를 재사용해 남은 바이트를 전부 소유 hex 문자열로 제공합니다. `control_node`·`paragraph_node`는 해당 원문 Tree의 인덱스이며 저장 후 영구 ID가 아닙니다. 반환 rows와 문자열은 `deinit(allocator, rows)`로 함께 해제합니다. source buffer의 수명에 기대거나 binary를 UTF-8 문자열로 잘못 변환하지 않습니다.

기존 `drawingSources`의 scalar 응답은 변경하지 않습니다. 새 decoder는 extra_bytes/소문자 hex 길이·문법·identity 순서/중복을 검사합니다. 로컬 통합 API는 `drawingObjectExtras(section)`이며 미제공 ABI는 명시적 오류입니다. Session/WASM/JS editor 연결은 아직 미커밋 통합 대상입니다. 이 코어/decoder 게시를 기본 데모의 새 API 제공으로 읽지 않습니다.

한컴 표69의46+2×설명 길이를 넘어서는 꼬리가 실제 HWP5-nopassword에 존재합니다. RHWP `parser/control/shape.rs`도 description 이후 남은 바이트를 raw_extra로 보존하며 의미를 해석하지 않습니다. 이를 근거로0을 패딩으로 단정하거나 geometry 제한을 해제하지 않습니다. 페이지 배치의 `UnsupportedHwp5DrawingObjectExtension`은 계속 유지합니다.

## 2026-10-10 검증

native2/2·exit0: 실제 첫 도형 header/control/component를 두 형제로 정규화한 파생 바이트의 꼬리를ff80으로 바꾸고, source buffer 변조 뒤 소유 문자열 불변·모든 할당 실패·부분 rows 정리를 검사했습니다. 파생본은 원본 문서가 아니며 전체 문서 지원으로 세지 않습니다. 같은 세 모듈만 기존 HEAD에 추가한 별도 Git tree에서도2/2와 ReleaseSafe 빌드가 통과했습니다.

로컬 후보 WASM SHA256 `0a72c99752e18c69369937cb34db091fba7215481c377ab90c459b89244cd79b`의 실파일·기존 scalar·wire를 별도 책임으로 분리한4파일4/4·skip0·exit0을 확인했습니다. 실제30도형 모두 extra_bytes2/hex0000을 독립 CFB.js/고정offset으로 대조했고, 조회·입력·undo/redo·오류 뒤 재조회·원본 불변을 확인했습니다. 꼬리 의미/렌더링·전체 body 필드·기본 WASM 승격 증거가 아닙니다.

```sh
zig test src/drawing_extra_source_test.zig -O ReleaseSafe --test-filter 'drawing opaque'
node --test tests/hwp5/drawing-object-extras-wire.test.mjs
```

## 문자열 종결자 가설과 참조 전수 관측

RHWP revision `e8800c8def63449808a4092798442652ed460552`의 byte_writer.write_hwp_string은 u16 개수와 UTF-16 내용만 쓰며 NUL을 추가하지 않습니다. control.serialize_common_obj_attr는 그 뒤 raw_extra를 별도로 복원합니다. 따라서 RHWP 코드는 관측된2바이트를 문자열 종결자로 해석한다는 근거가 아닙니다.

독립 `tools/hwp5-object-extra-survey.mjs`는 `.hwp`/`.hwpx` 확장자 대신 CFB signature를 선택하고 HWP5 FileHeader를 확인합니다. signature/길이/잘림/원문 불변/부분 관측 유지 테스트4/4·exit0입니다. Git 추적101경로의55CFB는52관측·배포2제외·암호1제외였고,81개체에 꼬리가 없었습니다. 같은 버전의 모든 문서가 같은 꼬리를 갖는다는 가정은 사용하지 않습니다.

참조975경로 중 CFB513개를 실제 signature로 선택한 최종 관측은504완료·배포6제외·암호1제외·부분 관측2파일입니다. 전체3399개체 중3389개의 공통 꼬리를 관측했고1249개는2바이트0000, 비영 꼬리는 없었습니다. 미해석10개는20250130-hongbo_saved/honbo-save의각5개40바이트 control header입니다. 부분 관측을 성공으로 세지 않아 종료코드는1입니다. 기록은 `/tmp/hwpjs-object-extra-reference-final-survey-20261010.jsonl`이며 원본은 수정하지 않았습니다. 숫자는 이 inventory의 관측값이지 스펙 또는 보편적인 버전 cutoff가 아닙니다.

40바이트 control의 필드 부재를 정상 optional로 읽는 변경을 시험했지만, 두 파일은 실제 editor에서 `RepairedSourceUnsupported`로 거부됐습니다. 이 자료만으로 정상 레이아웃을 새로 허용할 근거가 부족해 nullable 변경과 임시 테스트를 철회했습니다. 파서는 기존 최소길이/잘림 거부를 유지합니다. `/tmp/hwpjs-object-optional-20261010`은 철회된 실험 산출물로 제품 승격 대상이 아닙니다. 이것을 다른 후보의 통과 근거로 사용하지 않습니다.

## 게시 의존성 검증

별도 Git export 검사에서 조사기가 로컬 변경의 readStreams export에 기대어 remote-only helper와 연결되지 않는 것을 재현했습니다. 제품 parser가 아닌 도구 게시 누락입니다. `tools/cfb-stream-map.mjs`로 legacy CFB 스트림 관측 책임을 분리하고 source buffer를 복사하여 읽습니다. 조사기는 기존 helper의 게시된 inspect/records만 사용합니다. 실행 중인 전체 공개 회귀의 원문 oracle은 수정하지 않았습니다. 정상 module link와 실제 관측을 깨끗한 export에서 다시 확인하며, 기존 수정 전 검사 실패를 통과로 덮어쓰지 않습니다.
