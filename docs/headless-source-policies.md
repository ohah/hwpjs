# 헤드리스 문서 열기 정책

일반 `editor.load(bytes,{format:'hwp5'})`는 기본 strict 정책을 유지합니다. 배포용 문서, 관측 컨테이너 보정, DocInfo 관측 보존, 저장된 구역 사본은 서로 다른 명시 옵션입니다. 옵션은 문서 열기 시도에만 적용되며 다음 문서에 상속하지 않습니다.

```js
await editor.load(bytes, {format:'hwp5', enableOptions:{distribution:true}});
await editor.load(bytes, {format:'hwp5', availableSectionCopy:true});
```

`availableSectionCopy`는 `load` 요청에 전달합니다. `enableOptions`는 로드 이후 편집 세션 활성화 요청의 정책이므로, 구역 수 검증이 실패한 원본을 여는 옵션을 여기에 넣지 않습니다. 사본 정책의 타입·포맷·충돌 검사는 기존 reader의 `availableSectionCopyRequest`를 단일 출처로 재사용하며 유효하지 않은 요청은 활성 문서 교체 전에 거부합니다. HWPX와의 결합, `distribution` 또는 `normalizeObservedCfb`와의 결합은 거부합니다.

배포용 문서는 [기존 배포 형식 보존](hwp5-distribution-write.md)을 따릅니다. 구역 사본은 [기존 사본 계약](hwp5-available-section-copy.md)에 따라 실제 저장된 구역만 사용하고 선언 수를 고칩니다. 누락된 내용을 복원했다고 표시하지 않습니다. 사본 생성 writer는 Root Entry 생성 시각을0으로 직렬화하므로 원본과의 디렉터리 메타데이터 전체 동일을 주장하지 않습니다. 독립 사본 편집 검사는 이 정확한 생성 시각 정규화 외에 다른 메타데이터 변경을 거부합니다.

작업 트리 데모는 해당 오류를 받으면 별도의 명시 선택 창을 띄웁니다. 취소 버튼에 초기 초점을 두며, 취소·Escape·중단은 재시도하지 않습니다. 한 번 수락한 정책이 다시 실패해도 반복해서 동의 창을 띄우지 않습니다. 보정·사본·배포 모드를 암묵적으로 혼합하지 않습니다.

## 검증

- SDK 정책 전달·활성 문서 보존2개, 데모 로더 기존13개와 새4개가 통과했습니다. 현재 패키지 테스트는202개 통과했습니다.
- 배포용 `distribution.hwp`, `viewtext.hwp`와 구역 수 불일치3개에서 공개 typed 입력·저장·이력·재열기 및 독립 CFB 검사가 통과했습니다. 근거: `zig-out/verification/headless-edit-source-policy-corrections`.
- 실제 브라우저 배포용 문서의 Canvas 입력·다운로드·독립 전체 Section/다른 스트림 검사·undo/redo·재업로드가 통과했습니다. 근거: `zig-out/verification/monorepo-demo-edit/2026-10-24T18-14-27-412Z`.
- 구역 사본의 같은 브라우저 왕복도 통과했습니다. 근거: `zig-out/verification/monorepo-demo-edit/2026-10-24T18-17-30-241Z`. 독립 검사는 선언 수 필드·대상 텍스트 삽입·정확한 Root Entry 생성 시각 정규화만 허용하고 다른 스트림과 메타데이터를 보존 대조합니다. 잘못된 입력 문자열과 메타데이터 변조는 거부했습니다.

SDK 게시, 작업 트리 데모 배포와 네이티브 전체 검증 상태는 별개입니다. 이 검사는 전체 픽스쳐 지원이나 한글과의 조판 동치를 뜻하지 않습니다.
