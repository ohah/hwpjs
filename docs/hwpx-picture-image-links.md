# HWPX 그림 이미지 OPF 연결

`src/hwpx/picture_image_links.zig`는 선택된 section XML 트리의 직접 `hp:pic → hc:img`를 원문 순서로 찾고, `binaryItemIDRef`를 기존 `binary_reference_links.zig`의 정확한 OPF ID 규칙으로 해결합니다. namespace가 다른 동명 요소와 `pic` 아래의 간접 `img`는 포함하지 않습니다. 결과는 section 순번·파트 item 인덱스·그림/이미지 요소 인덱스와 absent/empty/embedded/external/missing 상태를 보존하며, XML 문자 참조를 정규화한 ID 문자열은 각 사이트가 소유합니다. 빈 문자열을 ID 0이나 파일 경로로 바꾸지 않습니다.

마스터페이지에는 동일 판정을 `src/hwpx/masterpage_picture_image_links.zig`가 적용합니다. 선택된 파트의 XML 해제·요소 인덱싱·합계 한도는 `masterpage_xml_trees.zig` 하나가 소유하고 기존 마스터페이지 브러시 검사도 이를 재사용합니다. `Document.inspectPictureImageLinks()`와 `Document.inspectMasterPagePictureImageLinks()`가 각 범위를 개별 실행하며, `inspectKnown()`도 두 보고서를 각각 소유·해제합니다. 기본 `max_sites=500000`, `max_attribute_bytes=4096`은 보고서마다 따로 적용됩니다. 외부 URL은 가져오지 않고 내장 이미지 바이트도 아직 해제하지 않습니다.

이 보고서는 **원문 트리의 직접 부모 관계**를 검사합니다. 기존 스트리밍 [이진 참조 집계](hwpx-binary-references.md)는 section의 run/container/switch 범위 및 마스터페이지의 직접 `subList` 범위만 세므로, 임의 XML에서 두 결과가 같아야 한다고 가정하지 않습니다. 특히 마스터페이지의 `subList` 밖 그림은 이 원문 보고서에 남지만 스트리밍 보고서에는 없을 수 있습니다. 조건부 분기의 활성 선택, 그림 객체의 크기·자르기·회전·배치, 이미지 바이트 유효성·렌더링·편집·저장은 후속 책임입니다.

## 독립 대조와 적대적 경계

`python3 tools/hwpx-fill-brush-image-oracle.py --pictures`는 Python의 ZIP/ElementTree로 선택 OPF 파트의 직접 `pic/img`만 독립 추출합니다. 로컬 HWPX 484개에서 ZIP 거부 6개·암호화 2개를 제외한 476개에서 section 참조 1993건(내장 1945, 외부 7, 빈 ID 41), 마스터페이지 참조 35건(전부 내장)을 관측했습니다. 이 표본의 absent/missing은 0건이나 합성 테스트에서 다섯 상태를 별도로 검사합니다. 선택 실파일 8개 ReleaseFast shard는 출처별 참조 수·상태·OPF 항목 인덱스 합계를 독립 조사값과 대조합니다. 표본 분포는 모든 HWPX의 유효성 증명이 아닙니다.

합성 테스트는 XML 문자 참조가 있는 ID, 동일 이름의 다른 namespace, 간접 자식 제외, 다섯 대상 상태, 정확한 사이트/속성 한도, 마스터페이지 `subList` 안팎의 범위 차이, 모든 할당 실패를 확인합니다. Git 추적 `sample-5017-pics.hwpx`도 section 연결을 실행합니다. 적대적 재검토에서 조작된 트리 부모 인덱스와 마스터페이지 manifest가 다른 ZIP 엔트리를 가리키는 경우를 명시적으로 거부하도록 했습니다. 미해결 ID 원문을 트리/문서 해제 후 잃지 않도록 각 사이트가 문자열을 소유합니다. 요소 인덱스를 XML 원문으로 역참조하려면 원본 문서·트리를 유지해야 합니다. 이 연결 단계의 성공은 실제 이미지 바이트나 문서 전체 의미 검증을 뜻하지 않습니다.

2026-09-25 최종 소스에서 전용 Zig 테스트는 Debug·ReleaseSafe·ReleaseFast 각각 7/7, 마스터페이지 브러시 회귀는 Debug 6/6을 통과했습니다. 독립 oracle 자체 반례와 선택 실파일 ReleaseFast 8개 shard도 전부 통과했고, 각 사이트의 정규화된 ID가 해결된 manifest 항목 ID와 일치하는지 확인했습니다. 전체 Debug `zig build test --summary all`은 종료 코드 0·5/5 단계·2,449/2,449 테스트, ReleaseSafe 제품 빌드·CFB 비교·audit은 각각 종료 코드 0입니다. 빌드 출력에는 `failed command` 러너 문구가 섞였으나 최종 Build Summary는 성공이므로 출력 문자열 단독으로 실패나 성공을 판단하지 않습니다. 이 결과는 지원된 raw 그림 링크 범위의 회귀 검증이며 HWPX 전체 유효성 증명은 아닙니다.
