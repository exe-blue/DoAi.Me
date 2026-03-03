# Supabase 마이그레이션 이력 불일치 해결

`npx supabase db pull` 실행 시 아래 오류가 나면:

```
The remote database's migration history does not match local files in supabase\migrations directory.
```

**해결:** 터미널에 출력된 `supabase migration repair` 명령을 **그대로** 순서대로 실행하세요.

1. **reverted** 로 표시된 항목부터 실행 (원격 이력에서 제거).
2. 이어서 **applied** 로 표시된 항목을 모두 실행 (원격 이력에 반영).

예 (실제 출력에 맞게 버전 번호가 다를 수 있음):

```powershell
cd C:\Users\choi\doai.me\DoAi.Me

# 1) reverted
npx supabase migration repair --status reverted 20260213
npx supabase migration repair --status reverted 20260226
npx supabase migration repair --status reverted 20260227

# 2) applied (출력에 나온 목록 전부)
npx supabase migration repair --status applied 20260213
npx supabase migration repair --status applied 20260223110000
# ... 나머지도 동일하게
```

이후 다시 `npx supabase db pull` 로 확인.  
출력되는 제안 목록이 바뀌면, **그때 출력된 repair 명령**을 다시 실행하면 됩니다.
