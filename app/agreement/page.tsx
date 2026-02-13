import Link from "next/link";

export default function AgreementPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold mb-8">서비스 약관</h1>

        <div className="space-y-6 text-sm text-muted-foreground leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">제1조 (목적)</h2>
            <p>
              이 약관은 DoAi.Me(이하 &quot;서비스&quot;)가 제공하는 서비스의 이용 조건 및 절차,
              이용자와 서비스 간의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">제2조 (용어의 정의)</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>&quot;서비스&quot;란 DoAi.Me가 제공하는 디바이스 관리 및 자동화 플랫폼을 말합니다.</li>
              <li>&quot;이용자&quot;란 서비스에 접속하여 이 약관에 따라 서비스를 이용하는 회원을 말합니다.</li>
              <li>&quot;회원&quot;이란 서비스에 가입하여 이용자 계정을 부여받은 자를 말합니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">제3조 (약관의 효력 및 변경)</h2>
            <p>
              이 약관은 서비스 화면에 게시하거나 기타의 방법으로 회원에게 공지함으로써 효력이 발생합니다.
              서비스는 필요한 경우 약관을 변경할 수 있으며, 변경된 약관은 공지 후 효력이 발생합니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">제4조 (서비스의 제공)</h2>
            <p>서비스는 다음과 같은 기능을 제공합니다.</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>디바이스 원격 관리 및 모니터링</li>
              <li>작업 자동화 및 스케줄링</li>
              <li>실시간 상태 대시보드</li>
              <li>기타 서비스가 정하는 기능</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">제5조 (이용자의 의무)</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>이용자는 관계 법령, 이 약관의 규정, 이용안내 및 서비스와 관련하여 공지한 주의사항을 준수하여야 합니다.</li>
              <li>이용자는 서비스의 이용권한, 기타 이용계약상의 지위를 타인에게 양도·증여할 수 없습니다.</li>
              <li>이용자는 서비스를 이용하여 불법적인 활동을 하여서는 안 됩니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">제6조 (서비스의 중단)</h2>
            <p>
              서비스는 시스템 점검, 교체 및 고장, 통신 두절 등의 사유가 발생한 경우
              서비스의 제공을 일시적으로 중단할 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">제7조 (면책 조항)</h2>
            <p>
              서비스는 천재지변 또는 이에 준하는 불가항력으로 인하여 서비스를 제공할 수 없는 경우에는
              서비스 제공에 관한 책임이 면제됩니다.
              이용자의 귀책사유로 인한 서비스 이용의 장애에 대하여는 책임을 지지 않습니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">제8조 (분쟁 해결)</h2>
            <p>
              서비스와 이용자 간에 발생한 분쟁에 관한 소송은 대한민국 법을 적용하며,
              서비스의 본사 소재지를 관할하는 법원을 전속 관할 법원으로 합니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">부칙</h2>
            <p>이 약관은 2026년 2월 13일부터 시행합니다.</p>
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
