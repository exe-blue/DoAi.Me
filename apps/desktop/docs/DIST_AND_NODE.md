# Dist 실행과 Node 의존성

## 현재 동작 (Node 없는 PC에서도 실행 가능)

- **패키징된 앱(dist)** 은 **시스템에 Node/npm이 없어도** 에이전트를 실행할 수 있다.
- `extraResources` 로 다음을 번들한다:
  - `src/agent` → `resources/agent` (agent.js 등)
  - `node-bundle` → `resources/node` (node.exe)
- 에이전트는 **번들된 `resources/node/node.exe`** 로 `resources/agent/agent.js` 를 실행한다. 따라서 **시스템 PATH의 node는 사용하지 않는다.**

## Dist에서 agent 실행 실패 시

- **원인**: `resources/agent/agent.js` 또는 `resources/node/node.exe` 가 없음 (빌드/패키징 누락).
- **앱 동작**: Agent 시작 시 `getAgentPaths()` 가 `null` 을 반환하면 상태를 `ERROR` 로 두고, UI와 로그에 다음 메시지를 남긴다.
  - *"Dist: agent.js or bundled node.exe missing. Run build (node-bundle + extraResources) and repackage. No system Node required."*
- **조치**: `pnpm dist` (또는 CI)에서 `scripts/download-node-win.js` 가 실행되어 `node-bundle/node.exe` 가 생성되었는지 확인하고, `extraResources` 에 `node-bundle` 이 포함되도록 다시 패키징한다.

## TODO (선택)

- **장기**: 에이전트를 Node 대신 단일 실행 파일(네이티브/컴파일 바이너리)로 배포하면 패키징이 단순해지고 node-bundle 단계를 제거할 수 있다. 당장 변경이 어렵다면, 위와 같이 **번들 node 누락 시 실패 메시지를 명확히 남기는 것**으로 Node 없는 PC에서의 진단은 가능하다.
