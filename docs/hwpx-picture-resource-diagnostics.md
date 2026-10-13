# 그림 자원 부재와 해독 실패의 구분

`pictureLayoutCoverage`는 기존 배치 후보/해독/실패/대기 개수를 유지하고 실패가 있으면 `failures`에 section·pictureNode·오류 원인을 전달합니다. 오류 문자열은160문자로 제한합니다. `pictureCoverageText`는 개수/식별자/문자열을 검증하고 최대3개 원인을 표시합니다. `MissingPictureImage`는 `이미지 연결 없음`으로 표시하되 실패 개수를 성공/대기로 바꾸지 않습니다. 실제 Canvas paint 성공이나 손상 문서 확정 판정은 아닙니다.

## 실제 덧말 파일의 원인

2026-10-13 후보39c827ed의 Worker에서 picture53은 PNG21787바이트를 반환하고 picture98은 MissingPictureImage를 반환합니다. 독립 Python ZIP/XML은 두 hc:img의 binaryItemIDRef가 각각 `image1`과 빈 문자열임을 확인했습니다. ZIP에는 BinData/image1.png만 있고 native picture53의 반환 전체 바이트는 그 payload와 같습니다. 따라서 앞선 브라우저의 해독1/실패1 중 실패는 이미지 연결 부재이며, 코덱에서 PNG 해독이 실패한 증거가 아닙니다. 빈 연결이 의도적 placeholder인지까지 단정하지 않습니다.

실제 Worker→picture resource 경로에서 정상 바이트에만 decoder가 호출되고, 누락 객체는 호출 없이 오류로 보존되는 것을 검사했습니다. 이 테스트의 decoder는 대역이며 실제 브라우저 PNG 해독을 새로 검증한 결과로 세지 않습니다. 조회 후 save는 원본 ZIP과 byte-exact입니다. 실패 객체를 삭제하거나 다른 PNG로 자동 연결하지 않습니다.

원문 독립 대조·코덱 미호출·원본 보존·원인 전달·개수/식별자/빈 원인/초과 길이/0그림 반례 및 기존 자원 예산·옛 epoch·해독 실패·배치 상태 회귀36/36, skip0, 종료코드0입니다. 상세 UI 문자열의 이번 실제 브라우저 재검증은 아직 별도이며 기존 브라우저의 그림 실패 관측은 [픽스쳐 감사](hwpx-table-fixture-edit-audit.md)에 있습니다. 두 기존 로컬 미추적 회귀 파일의 새 failures 기대값만 조정했고 그 파일 전체는 이번 커밋에 포함하지 않습니다.
