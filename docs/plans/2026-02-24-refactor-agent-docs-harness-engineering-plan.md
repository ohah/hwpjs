---
title: refactor: 에이전트 문서 Harness Engineering 스타일 리팩터링
type: refactor
status: active
date: 2026-02-24
---

# 에이전트 문서 Harness Engineering 스타일 리팩터링

## Overview

OpenAI의 [Harness Engineering](https://openai.com/index/harness-engineering/) 글을 기준으로, 현재 단일 대형 `AGENTS.md`(약 813줄)를 **진입용 목차(~100줄)** 로 줄이고, 저장소 지식을 **구조화된 `docs/`** 를 시스템 오브 레코드로 두는 방식으로 리팩터링한다. 에이전트는 짧은 고정 진입점만 읽고, 필요 시 "다음에 볼 문서" 링크로 progressive disclosure 하도록 한다.

## Problem Statement / Motivation

- **현재**: `AGENTS.md` 한 파일에 에이전트 진입 규칙, 프로젝트 구조, 기술 스택, 아키텍처, 개발 가이드라인, 패키지 상세, 뷰어 아키텍처, 커밋 규칙 등이 모두 포함되어 있음(~813줄).
- **Harness에서 지적한 문제**:
  - 한 덩어리 매뉴얼은 검증·신선도·소유권·교차 링크가 어려워 **drift 불가피**
  - 모노리식 매뉴얼은 **쉽게 낡고**, 에이전트는 무엇이 아직 유효한지 구분하기 어려움
  - **"전부 중요" = "아무것도 중요하지 않음"** → 에이전트가 의도적 탐색 대신 국소 패턴 매칭에 의존
  - **컨텍스트가 희소** → 긴 지시 파일이 태스크·코드·관련 문서를 밀어내어 핵심 제약을 놓치거나 잘못된 제약에 최적화할 수 있음
- **목표**: AGENTS.md를 "백과사전"이 아니라 **"목차"** 로 두고, 상세는 `docs/` 등 구조화된 경로에 두어 검증·유지보수·progressive disclosure가 가능하게 함.

## Proposed Solution

### 1. AGENTS.md를 진입용 ToC(~100줄)로 축소

**AGENTS.md에 남길 내용:**

- OpenClaw hwpjs 에이전트 소개 (이 워크스페이스용)
- **세션 시작 시**: `SOUL.md`, `USER.md` 읽기; 필요 시 `memory/YYYY-MM-DD.md`, `MEMORY.md` 참고
- **하트비트 시**: `HEARTBEAT.md` 읽고 적힌 순서대로만 실행
- **언어·도구**: 한국어, 담백·결과 위주; 파일/명령 적극 사용, 파괴적 명령은 사용자 확인 후
- **프로젝트 한 줄 요약**: HWP 파싱 라이브러리, Rust 핵심 + Node/RN 래퍼
- **다음에 볼 문서(Where to look next)** 블록:
  - **스펙/레퍼런스**: `documents/docs/spec/` (특히 `hwp-5.0.md`), `.cursor/skills/hwp-spec/`
  - **설계/아키텍처**: `docs/design/` (또는 루트 `architecture.md`, `folder-structure.md` 링크)
  - **실행 계획**: `docs/plans/`, `documents/plans/`
  - **로드맵·백로그**: `documents/docs/roadmap/`, `documents/docs/backlog/`
  - **프로세스(커밋/린트/테스트)**: `commit-rules.md`, `lint-rules.md`, (선택) `docs/process/testing.md`
  - **패키지 상세**: `docs/design/` 또는 documents 가이드 링크

### 2. 저장소 지식 구조: `docs/` as system of record

Harness 예시에 맞춰, 루트 `docs/` 아래를 단일 진입 체계로 둔다.

| 목적 | 경로 | 비고 |
|------|------|------|
| 설계 문서 | `docs/design/` | architecture, folder-structure, viewer-architecture, (선택) packages-hwpjs |
| 실행 계획 | `docs/plans/` | 기존 `docs/plans/` 유지; `documents/plans/`는 README에서 링크로 통합 |
| 프로세스 | `docs/process/` (선택) | 테스트/빌드/린트 상세 |
| 레퍼런스 | `documents/docs/spec/` | 기존 유지, AGENTS.md에서 경로만 안내 |
| 제품/로드맵·백로그 | `documents/docs/roadmap/`, `documents/docs/backlog/` | 기존 유지 |

**AGENTS.md에서 옮길 내용 → 대상 파일:**

- 프로젝트 구조 트리 → `docs/design/folder-structure.md` (또는 기존 루트 `folder-structure.md`를 `docs/design/`으로 이동/복사 후 링크)
- 기술 스택 상세 → 기존 `tech-stack.md` 유지, AGENTS.md는 한 줄 링크
- 아키텍처 설계 전체 → `docs/design/architecture.md` (기존 `architecture.md` 이전 또는 병합)
- 워크스페이스 설정(Bun/Cargo) → `docs/design/architecture.md` 또는 `docs/process/workspace.md`
- 개발 가이드라인(함수 파라미터, HWP 타입, 테스트 규칙, 빌드, 린트) → `docs/process/` 또는 기존 `commit-rules.md`/`lint-rules.md` 확장·링크
- 패키지별 상세(crates/hwp-core, packages/hwpjs, examples, documents) → `docs/design/packages.md` 또는 documents 가이드와 정리 후 한 곳
- packages/hwpjs 구조와 원리(이중 빌드, exports, 패키징) → `docs/design/packages-hwpjs.md`
- 뷰어 아키텍처 및 확장 계획 → `docs/design/viewer-architecture.md`
- 주의사항 → ToC에 한두 줄 + 상세는 해당 design/process 문서로

### 3. Progressive disclosure

- 에이전트는 항상 **짧은 AGENTS.md** 만으로 "누가, 언제, 무엇을 읽는지"와 "다음에 어디를 볼지"를 알 수 있게 함.
- 설계·실행·프로세스 상세는 **필요할 때만** 링크를 따라가도록 안내.

### 4. 기계적 검증(추후 선택)

- `AGENTS.md` 줄 수 상한(예: 120줄) 린트
- `docs/design/`, `docs/plans/` 내부 링크 유효성 검사
- AGENTS.md에 명시된 경로가 실제 파일/디렉터리인지 CI에서 검사

## Technical Considerations

- **기존 파일 보존**: `SOUL.md`, `USER.md`, `HEARTBEAT.md`, `MEMORY.md`, `memory/` 는 위치·역할 유지. AGENTS.md에서는 요약·링크만 제공.
- **중복 제거**: 루트 `architecture.md`, `folder-structure.md`, `commit-rules.md`, `lint-rules.md` 가 이미 있으므로, 옮길 때 복사가 아닌 **이동 또는 링크 통합**으로 정리하면 유지보수 부담을 줄일 수 있음.
- **documents/ 와 docs/ 역할**: Rspress 문서 사이트(`documents/docs/`)와 스펙/로드맵/백로그는 그대로 두고, "에이전트용 설계·실행 계획"은 루트 `docs/` 에 두어 Cursor/에이전트 컨텍스트에서 찾기 쉽게 함.
- **.cursor 연동**: `.cursor/commands/commit.md`, `pr.md`, `.cursor/agents/`, `.cursor/skills/` 는 기존대로 두고, AGENTS.md와 새 `docs/` 경로만 수정·추가.

## Acceptance Criteria

- [ ] `AGENTS.md` 가 약 100줄 이하(권장 상한 120줄)로 축소되어, 진입 규칙 + "다음에 볼 문서" 링크만 포함한다.
- [ ] 설계 문서가 `docs/design/` (또는 명시된 대안)에 존재하고, AGENTS.md에서 링크로 참조된다.
- [ ] 실행 계획 진입점이 `docs/plans/` (및 필요 시 `documents/plans/` 링크)로 명확히 안내된다.
- [ ] 스펙·로드맵·백로그·커밋/린트 규칙 경로가 AGENTS.md에 한 줄씩 명시된다.
- [ ] 기존 에이전트 동작(세션 시작 시 SOUL/USER/memory/MEMORY, 하트비트 시 HEARTBEAT 순서)은 변경 없이 유지된다.
- [ ] (선택) `docs/process/` 또는 기존 루트 문서에 테스트/빌드/린트 상세가 정리되어 AGENTS.md와 중복이 없다.

## Success Metrics

- 에이전트가 긴 매뉴얼 대신 짧은 진입점 + 필요 시 링크만 읽어도 태스크를 수행할 수 있음.
- 설계·실행·프로세스 변경 시 한 곳만 수정하면 되어 drift가 줄어듦.
- 추후 린트/CI로 문서 신선도·교차 링크를 기계적으로 검증할 수 있는 구조가 됨.

## Dependencies & Risks

- **의존성**: 없음. 문서/디렉터리 이동·편집만으로 수행 가능.
- **리스크**: AGENTS.md 축소 과정에서 일부 규칙이 빠지면 에이전트 동작이 달라질 수 있음. 이전 버전(또는 분리된 design/process 문서)에 반드시 옮겨 적고, 리팩터 후 한 번 하트비트/세션 시나리오를 확인하는 것이 좋음.

## References & Research

- **Harness Engineering**: [Harness engineering: leveraging Codex in an agent-first world](https://openai.com/index/harness-engineering/) — AGENTS.md as table of contents, structured docs/ as system of record, progressive disclosure.
- **내부 연구**: repo-research-analyst·learnings-researcher 에이전트 실행 결과 요약(AGENTS.md 812줄, 섹션 목록, docs/ 구조 제안, docs/solutions 없음).
- **기존 문서**: `AGENTS.md`, `architecture.md`, `folder-structure.md`, `commit-rules.md`, `HEARTBEAT.md`, `documents/docs/spec/`, `documents/plans/`, `docs/plans/`.
