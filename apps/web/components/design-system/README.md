# Design System Components

DoAi.Me 대시보드용 **디자인 시스템 수준 컴포넌트**를 두는 폴더입니다.

## 규칙

1. **토큰 준수**  
   색·타이포·간격은 `docs/DESIGN_SYSTEM.md`와 `lib/design-tokens.ts`를 따릅니다.

2. **구성**  
   - `components/ui/` (shadcn)를 조합해 사용합니다.  
   - 필요 시 `components/farm/` 도메인 컴포넌트를 참조합니다.

3. **이름**  
   - 한 파일에 한 컴포넌트(또는 한 묶음).  
   - PascalCase 파일명, 명확한 export.

4. **용어**  
   - UI 텍스트·라벨: DESIGN_SYSTEM.md의 용어 표 사용 (예: PC, 디바이스, 태스크).

## 폴더 구조 (제안)

```
design-system/
├── README.md           # 이 파일
├── (primitives)        # 필요 시: 작은 블록 (Badge, StatusDot 등)
├── (patterns)          # 필요 시: 카드 레이아웃, 리스트 행 등
└── (추가 컴포넌트)      # 전달받은 컴포넌트를 여기에 추가
```

컴포넌트를 전달받으면 이 폴더에 추가하고, 필요 시 이 README와 `docs/DESIGN_SYSTEM.md`를 함께 업데이트합니다.
