# 라우팅 무의존 공용 UI 패키지 설계

apps/web(Next.js)과 apps/desktop(Electron + React)이 **동일한 레이아웃/사이드바**를 쓰도록, `packages/ui`(또는 `packages/ui-materio`)에서 라우팅 의존을 제거하는 아키텍처 가이드.

---

## 0. Materio 내 라우터 의존 지점 목록

제거 대상은 **레이아웃/네비/사이드바** 코어만. 페이지 컴포넌트(forms, ecommerce, invoice 등)의 Link/redirect는 앱 또는 별도 마이그레이션.

| 위치 | 파일(TS 예시) | 의존 내용 |
|------|----------------|-----------|
| **Vertical MenuItem** | `@menu/components/vertical-menu/MenuItem.tsx` | `usePathname()` 로 활성 계산, `href` + `component`(Link) 로 이동 |
| **Vertical Menu** | `@menu/components/vertical-menu/Menu.tsx` | `usePathname()` 로 서브메뉴 open 상태 리셋 (`pathname` 변경 시) |
| **Vertical MenuButton** | `@menu/components/vertical-menu/MenuButton.tsx` | `RouterLink`(next/link) 사용 — `href` 있으면 Link 렌더 |
| **Horizontal MenuItem** | `@menu/components/horizontal-menu/MenuItem.tsx` | `usePathname()` 로 활성 계산 |
| **Horizontal MenuButton** | `@menu/components/horizontal-menu/MenuButton.tsx` | `RouterLink`(next/link) |
| **RouterLink** | `@menu/components/RouterLink.tsx` | `next/link` 래퍼 |
| **Navigation (사이드바)** | `components/layout/vertical/Navigation.tsx` | `Link href='/'` 로고 클릭 |
| **VerticalMenu (메뉴 트리)** | `components/layout/vertical/VerticalMenu.tsx` | `useParams()` 로 locale, MenuItem에 `href` 전달 |
| **NavSearch** | `components/layout/shared/search/index.tsx` | `useRouter`, `usePathname`, `useParams` — 선택 시 이동/외부 열기 |

**정리**: `usePathname` / `useRouter` / `useParams` / `next/link` / `RouterLink` 제거 → 대신 **activeKey**(또는 currentPath) props + **onNavigate(item)** 콜백.

---

## 1. 라우팅 의존 제거 전/후 컴포넌트 책임 분리

## 1. 라우팅 의존 제거 전/후 컴포넌트 책임 분리

### 제거 전 (현재)

| 컴포넌트 | 책임 (현재) |
|----------|-------------|
| **MenuItem** | `href` + `component`(Link)로 이동, `usePathname()`으로 active 계산 |
| **Menu** | `usePathname()` 변경 시 서브메뉴 open 상태 초기화 |
| **MenuButton** | `href` 있으면 `RouterLink`(next/link) 렌더, 없으면 `<a>` |
| **Navigation** | 로고에 `<Link href='/' />` 사용 |
| **VerticalMenu** | `useParams()`로 locale, 각 항목에 `href` 전달 |
| **NavSearch** | `useRouter`/`usePathname`/`useParams`로 이동·활성 표시 |

### 제거 후 (목표)

| 컴포넌트 | 책임 (변경 후) |
|----------|----------------|
| **MenuItem** | 클릭 시 `onNavigate(item)` 호출만. active는 `activeKey`/`currentPath`와 `item.key` 비교로만 표시 |
| **Menu** | 서브메뉴 open 상태는 내부 state 또는 `openKeys` props로 제어. pathname 구독 제거 |
| **MenuButton** | Link/NavLink 사용 안 함. `ListItemButton` + `onClick` → 부모에서 onNavigate 호출 |
| **Navigation** | 로고 클릭 시 `onNavigateHome()` 또는 `onNavigate({ key: homeKey })` 콜백만 호출 |
| **VerticalMenu** | 메뉴 데이터는 `items`(key/title/icon/href/external) 형태로 받고, 라우터/params 의존 제거 |
| **NavSearch** | `currentPath`/`activeKey`와 `onSelect(item)`을 props로 받아 라우터 무의존 |

---

### 패키지 수준 요약

```
packages/ui (제거 전)
├── next/link, next/navigation 사용
├── Sidebar/Nav/Menu가 href + Link로 렌더 → Next 전용
└── dependencies에 next 포함

packages/ui (제거 후)
├── next, react-router-dom 의존 없음
├── Nav: onNavigate(item) + activeKey/currentPath 주입만
├── MenuItem: ListItemButton + onClick → onNavigate
└── dependencies: react, MUI 등만
```

---

## 2. 공용 컴포넌트 API (props) 목록

### 2.1 공용 타입 — key 중심 nav item 모델

```ts
// packages/ui: 라우터 무의존

export type NavItem = {
  key: string              // 활성 비교·라우트 식별용 (필수)
  title: string           // 표시 라벨 (label 대신 일관성으로 title)
  icon?: React.ReactNode
  href?: string           // 앱이 이동할 path/url (external이면 절대 URL)
  external?: boolean      // true → 새 창/외부 링크, onNavigate에서 window.open 등 처리
  disabled?: boolean
  children?: NavItem[]    // nested menu
}

export type NavGroup = {
  label: string | null
  items: NavItem[]
}
```

- **active 판별**: `activeKey === item.key` 또는 `currentPath === item.key` / `currentPath.startsWith(item.key + '/')` 는 앱에서 계산해 `activeKey`로 넘기거나, UI에서 옵션으로 지원.

### 2.2 Sidebar / Nav (public API)

| Prop | Type | 설명 |
|------|------|------|
| **groups** | `NavGroup[]` | key/title/icon/href/external 구조의 메뉴 트리 |
| **activeKey** | `string` | 현재 활성 메뉴 key. 활성 표시는 이 값과 `item.key` 비교로만 수행 |
| **currentPath**?(선택) | `string` | activeKey 대신 path 기반일 때; 활성은 `currentPath`와 `item.key`(또는 href)로 비교 |
| **onNavigate** | `(item: NavItem) => void` | 메뉴 클릭 시 호출. Link/NavLink 없이 ListItemButton + onClick에서만 호출 |
| **LinkComponent**?(선택) | `ComponentType<{ href: string; children: ReactNode }>` | Web에서 Next Link 주입 시. 없으면 버튼+onNavigate만 사용 |
| **onNavigateHome**?(선택) | `() => void` | 로고 클릭 시 (homeKey 대신 콜백만 받을 때) |
| **openKeys**?(선택) | `string[]` | 서브메뉴 펼침 상태 제어(controlled). 없으면 UI 내부 state로만 관리 |

- 구현: Sidebar/NavItem은 **Link/NavLink 사용 금지**. `ListItemButton` + `onClick={() => onNavigate(item)}` 으로 통일.

### 2.3 Layout

| Prop | Type | 설명 |
|------|------|------|
| **children** | `React.ReactNode` | 페이지 콘텐츠 |
| **sidebar** | `React.ReactNode` | Sidebar 컴포넌트(위 props 이미 주입된 상태) 또는 |
| **sidebarProps** | Sidebar용 props | Layout이 Sidebar를 내부에서 렌더할 때 |
| **header**?(선택) | `React.ReactNode` | 상단 헤더 |
| **footer**?(선택) | `React.ReactNode` | 하단 푸터 |

- Layout 자체는 라우팅을 모름. Sidebar에 `currentPath`/`onNavigate`를 넘기는 쪽은 **앱**이다.

---

## 3. Web / Desktop 연결 예시

### 3.1 apps/web (Next.js)

```tsx
"use client"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { SharedLayout, SharedSidebar } from "@doai/ui"
import { navGroups } from "./nav-config"

// pathname을 그대로 activeKey로 쓸 수 있음 (key가 path와 동일할 때).
// 하위 경로일 때 부모 메뉴 활성은 pathToActiveKey 또는 activeKeys로 처리.
export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  const onNavigate = (item: NavItem) => {
    if (item.external && item.href) {
      window.open(item.href, "_blank")
      return
    }
    if (item.key) router.push(item.key)
  }

  return (
    <SharedLayout
      sidebar={
        <SharedSidebar
          groups={navGroups}
          activeKey={pathname}
          onNavigate={onNavigate}
          LinkComponent={Link}
        />
      }
    >
      {children}
    </SharedLayout>
  )
}
```

### 3.2 apps/desktop (Electron, React state 또는 react-router)

```tsx
// state 기반
import { useState } from "react"
import { SharedLayout, SharedSidebar } from "@doai/ui"
import { navGroups } from "./nav-config"

type RouteKey = "config" | "logs" | "about"

export function App() {
  const [activeKey, setActiveKey] = useState<RouteKey>("config")

  const onNavigate = (item: NavItem) => {
    if (item.external && item.href) {
      window.open(item.href, "_blank")
      return
    }
    setActiveKey(item.key as RouteKey)
  }

  return (
    <SharedLayout
      sidebar={
        <SharedSidebar groups={navGroups} activeKey={activeKey} onNavigate={onNavigate} />
      }
    >
      {activeKey === "config" && <ConfigPage />}
      {activeKey === "logs" && <LogsPage />}
      {activeKey === "about" && <AboutPage />}
    </SharedLayout>
  )
}

// react-router 사용 시: currentPath={location.pathname}, onNavigate에서 navigate(item.key)
```

---

## 4. 흔한 함정 처리 가이드

### 4.1 활성 메뉴

- **문제**: 하위 경로일 때 부모 메뉴도 활성으로 보이게 하려면 path 매칭 규칙이 필요함.
- **처리**:  
  - packages/ui에서는 **동일 비교**만 수행: `currentPath === item.key` 또는 `currentPath.startsWith(item.key + "/")` 수준만 지원하거나,  
  - **앱에서** “활성 key 목록”을 계산해 `activeKeys={["/content", "/content/tasks"]}` 형태로 넘기거나, `currentPath`를 이미 “활성 key”로 정규화해 넘긴다.  
  - UI 패키지는 `currentPath`/`activeKey`로 받은 값으로만 하이라이트하면 됨.

### 4.2 외부 링크

- **문제**: 메뉴에 외부 URL이 있을 때 새 창으로 열어야 함.
- **처리**:  
  - `NavItem`에 `external?: boolean` (및 `href`) 두고, **onNavigate 쪽에서 분기**:  
    `if (item.external && item.href) { window.open(item.href, "_blank"); return; }`  
  - UI 패키지는 클릭 시 `onNavigate(item)`만 호출. 실제 `window.open`은 앱(web/desktop)에서 수행.

### 4.3 새 창 열기 (Ctrl+클릭 등)

- **문제**: 사용자가 Ctrl+클릭으로 새 창에서 열고 싶을 수 있음.
- **처리**:  
  - **LinkComponent**를 쓰는 경우: Next.js `<Link>`는 기본 동작으로 Ctrl+클릭을 처리할 수 있음.  
  - **버튼 + onNavigate만** 쓰는 경우: 클릭 이벤트에서 `e.ctrlKey || e.metaKey`면 `window.open(item.key, "_blank")` 호출하고, 아니면 `onNavigate(item)` 호출. 이 로직은 **앱**에 두는 것이 좋고, UI 패키지는 `onNavigate(item, { ctrlKey: e.ctrlKey })`처럼 옵션만 넘길 수 있게 할 수 있음.

### 4.4 로고/브랜드 링크

- **문제**: 사이드바 상단 로고 클릭 시 홈으로 이동.
- **처리**:  
  - 로고용 `NavItem`을 하나 두거나, Layout/Sidebar에 **homePath** + **onNavigateHome** 같은 props를 두어, 로고 클릭 시 `onNavigateHome()` 또는 `onNavigate({ key: homePath })`만 호출하게 하면 됨. 라우팅은 여전히 앱이 담당.

### 4.5 packages/ui에 라우터를 dependencies에 두지 않기

- **타입만 필요할 때**: `next` 또는 `react-router-dom`을 **peerDependencies**에 두지 말고, `NavItem`(key/title/icon/href/external)을 패키지 내부 타입으로만 정의.  
- **LinkComponent**는 `React.ComponentType<{ href: string; children: React.ReactNode }>` 정도로 주입받으면 UI 패키지에 라우터 불필요.

### 4.6 Nested menu 펼침 상태 유지

- **문제**: 서브메뉴를 열어둔 채로 다른 메뉴로 이동했다가 돌아오면, 기존 Materio는 `pathname` 변경 시 open state를 리셋함. 라우터 제거 후에는 pathname 구독이 없으므로 “어떤 서브메뉴를 열어둘지”를 앱과 맞춰야 함.
- **처리**:  
  - **Controlled**: `openKeys: string[]`(열린 서브메뉴 key 목록) + `onOpenKeysChange(openKeys)`를 props로 받아, 앱이 활성 경로에 따라 `openKeys`를 유지(예: `activeKey`가 `/content/tasks`면 `openKeys={['/content']}`).  
  - **Uncontrolled**: UI 내부에서만 open state를 관리하고, 라우터와 동기화하지 않음(페이지 전환 시 서브메뉴가 접힐 수 있음).  
  - **하이브리드**: 초기 펼침만 `defaultOpenKeys`로 주고, 이후는 내부 state. 필요하면 `activeKey`가 특정 key의 자식일 때 해당 key를 `openKeys`에 넣어 주입.

---

## 5. 체크리스트 (구현 시)

- [ ] **의존 제거**: packages/ui에서 `next/link`, `next/navigation`, `RouterLink`, `usePathname`/`useRouter`/`useParams` 제거
- [ ] **Nav 모델**: nav item을 key/title/icon/href/external 구조로 리팩터
- [ ] **Sidebar/NavItem**: Link/NavLink 제거 → `ListItemButton` + `onClick` → `onNavigate(item)` 만 호출
- [ ] **활성 상태**: `activeKey`(또는 currentPath) props와 `item.key` 비교로만 표시
- [ ] **Menu**: pathname 구독 제거, 서브메뉴 open은 `openKeys`(controlled) 또는 내부 state
- [ ] **Navigation 로고**: `Link` 제거 → `onNavigateHome()` 또는 `onNavigate({ key: homeKey })`
- [ ] **NavSearch**(사용 시): `currentPath`/`activeKey` + `onSelect(item)` props로 라우터 무의존
- [ ] **apps/web**: pathname → activeKey, useRouter().push → onNavigate 연결
- [ ] **apps/desktop**: activeKey를 state 또는 react-router로 계산해 동일 API로 연결
