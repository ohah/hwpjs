# ICC TRC 태그별 타입 검사

## 계약

[ICC.1:2001-04 §6.4](https://www.color.org/specification/ICC.1-2001-04.pdf)와 [ICC.1:2022 §9.2](https://www.color.org/specifications/ICC.1-2022-05.pdf)의 rTRC·gTRC·bTRC·kTRC 정의를 기준으로 타입을 선택합니다. v2_2001은 curv, v4_2022는 curv 또는 para를 허용합니다. 단순 major 버전에서 모든 판본의 규칙을 추론하지 않습니다.

`trc_tag.parse(signature, payload, edition)`는 네 채널을 구분하고 기존 curveType/parametricCurveType 파서를 호출합니다. 이미 검증한 타입의 길이·개수·예약 필드 규칙을 다시 구현하지 않습니다. 반환 union의 curve_type은 identity·gamma·samples를 포함하며 parametric은 함수와 원시 파라미터를 보유합니다. 샘플 배열만 원본 입력을 빌립니다.

미지원 태그 이름은 null로 반환하며 검증 성공이 아닙니다. 알려진 태그에 허용하지 않은 타입이 오면 InvalidIccTrcType으로 거부합니다. 성공한 결과도 semantics_deferred=true로 남겨 수학적 함수 유효성·TRC 계산 모델·단조성·헤더 판본 일치·필수 태그 존재·다른 태그와의 관계를 아직 검사하지 않았음을 명시합니다. 값을 보정하거나 낮은 값으로 대체하지 않습니다.

판본 선택 타입은 `edition.zig`를 단일 출처로 분리했습니다. 기존 header_identifiers.Edition은 같은 타입의 별칭이므로 기존 호출을 유지합니다.

## 검증

네 곡선 종류의 순방향 연결은 [TRC 평가 통합](icc-trc-forward.md)에서 별도로 구현·검증합니다. 이 연결도 의미 보류를 해제하지 않습니다.

계산 모델의 후속 작업은 [샘플 곡선 역변환](icc-sampled-inverse.md)에 분리합니다. 이 함수는 샘플 곡선만 다루며 위 TRC 의미 보류를 자동 해제하지 않습니다.

새 Debug WASM에서 독립 JS 대조를 직접 실행하여 정상 비교 50건·예상 오류 거부 1,196건이 통과했습니다. 전체 감사 완료와는 구분합니다.

macOS `/System/Library/ColorSync/Profiles/`의 프로파일 11개에서 TRC 태그 29개를 실제 major에 맞춘 mode 155/156과 독립 JS 정수 읽기로 대조했으며 일치했습니다(v2 11개, v4 18개 태그). 대상은 ACESCG Linear, AdobeRGB1998, DCI(P3) RGB, Display P3, Generic Gray Gamma 2.2, Generic Gray, Generic RGB, ITU-2020, ITU-709, ROMM RGB, sRGB Profile입니다. 네 채널과 curv/para 선택을 포함하지만 모든 판본·함수 종류를 망라하지 않습니다. 샘플과 파라미터 원형, 타입·채널·보류 플래그 대조이며 곡선 출력·렌더링 검증이 아닙니다. 공유 데이터는 태그별로 세었고 수동 결과는 자동 감사 수에 합산하지 않습니다. 시스템 프로파일을 저장소로 복제하거나 변경하지 않았습니다.

초기 네이티브 테스트가 5/5 단계, 433/433으로 통과했습니다. 이후 union 필드 이름을 sampled에서 curve_type으로 명확히 했으며 현재 코드로 최종 감사를 실행 중입니다. 네 태그×두 판본, v2 para 거부, v4 para 허용, 잘림·미지원 이름·다른 타입·빌린 샘플 수명을 검사합니다.

테스트 mode 155/156은 각각 v2/v4 정책으로 TRC를 파싱합니다. 테스트 어댑터의 원시 결과 직렬화는 기존 곡선 probe를 재사용하며 JS 기대값은 별도로 구성합니다. 최종 Debug·ReleaseSafe·ReleaseFast 전체 감사가 모두 종료 코드 0, 20/20 단계, 네이티브 433/433, 감사 검사 4,547,710건으로 통과했습니다. 신규 비교 50건·예상 오류 거부 1,196건도 세 모드 모두 확인했습니다. 최종 로그는 로컬 `/tmp/hwpjs-icc-trc-Debug-final.log`, `/tmp/hwpjs-icc-trc-ReleaseSafe-final.log`, `/tmp/hwpjs-icc-trc-ReleaseFast-final.log`입니다. 검사 건수는 반복·변형을 포함하며 문서 수나 포맷 지원률이 아닙니다.

재검토에서 기존 헤더 API의 판본 타입 별칭 유지, 공통 접두사·곡선 파서 재사용, 미지원 이름/금지 타입 구분과 성공 결과의 의미 보류 표시를 확인했습니다. 추가 결함은 발견하지 못했습니다. 초기 네이티브 실행 이후 이름 정리를 반영한 코드가 위 최종 Debug 감사에 포함됩니다.
