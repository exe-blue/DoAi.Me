import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold mb-8">개인정보 취급방침</h1>

        <div className="space-y-6 text-sm text-muted-foreground leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">1. 수집하는 개인정보 항목</h2>
            <p>
              DoAi.Me(이하 &quot;서비스&quot;)는 서비스 제공을 위해 다음과 같은 개인정보를 수집합니다.
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>이메일 주소 (회원가입 및 로그인)</li>
              <li>이름 또는 닉네임</li>
              <li>프로필 이미지 (소셜 로그인 시)</li>
              <li>서비스 이용 기록, 접속 로그, IP 주소</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">2. 개인정보의 수집 및 이용 목적</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>서비스 이용을 위한 회원 식별 및 인증</li>
              <li>서비스 제공 및 운영</li>
              <li>서비스 개선 및 신규 기능 개발</li>
              <li>고객 문의 대응 및 공지사항 전달</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">3. 개인정보의 보유 및 이용 기간</h2>
            <p>
              회원 탈퇴 시 즉시 파기합니다. 단, 관계 법령에 의해 보존할 필요가 있는 경우 해당 법령에서 정한 기간 동안 보존합니다.
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>계약 또는 청약철회 등에 관한 기록: 5년</li>
              <li>대금결제 및 재화 등의 공급에 관한 기록: 5년</li>
              <li>소비자의 불만 또는 분쟁처리에 관한 기록: 3년</li>
              <li>접속에 관한 기록: 3개월</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">4. 개인정보의 제3자 제공</h2>
            <p>
              서비스는 원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다.
              다만, 법령에 의해 요구되는 경우에는 예외로 합니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">5. 개인정보의 파기 절차 및 방법</h2>
            <p>
              전자적 파일 형태의 정보는 기록을 재생할 수 없는 기술적 방법을 사용하여 삭제합니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">6. 이용자의 권리</h2>
            <p>
              이용자는 언제든지 자신의 개인정보를 조회하거나 수정할 수 있으며,
              회원 탈퇴를 통해 개인정보의 삭제를 요청할 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">7. 개인정보 보호책임자</h2>
            <p>
              개인정보 처리에 관한 업무를 총괄해서 책임지고, 관련 불만 처리 및 피해 구제를 위해 아래와 같이 개인정보 보호책임자를 지정하고 있습니다.
            </p>
            <p className="mt-2">이메일: support@doai.me</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">8. 개인정보 처리방침 변경</h2>
            <p>
              이 개인정보 처리방침은 2026년 2월 13일부터 적용됩니다.
              변경 사항이 있을 경우 서비스 내 공지를 통해 안내합니다.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-6 border-t border-border">
          <Link href="/dashboard" className="text-sm text-primary hover:underline">
            ← 대시보드로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}
