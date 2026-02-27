import Link from "next/link";

export const metadata = {
  title: "개인정보처리방침 | DoAi.Me",
  description: "DoAi.Me 스마트폰 팜 관제 서비스 개인정보처리방침",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold mb-2">DoAi.Me 개인정보처리방침</h1>
        <p className="text-sm text-muted-foreground mb-8">
          시행일자: 2026년 2월 26일
        </p>

        <div className="space-y-6 text-sm text-muted-foreground leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">
              제1조 (개요)
            </h2>
            <p>
              DoAi.Me(이하 &quot;회사&quot;)는 「개인정보 보호법」, 「정보통신망
              이용촉진 및 정보보호 등에 관한 법률」 등 관련 법령에 따라 이용자의
              개인정보를 보호하고 이와 관련한 고충을 신속·원활하게 처리할 수
              있도록 하기 위하여 다음과 같이 개인정보 처리방침을
              수립·공개합니다.
            </p>
            <p className="mt-2">
              이 방침은 서비스(웹사이트, 콘솔, 관련 서비스)에 적용되며, 회사가
              제공하는 스마트폰 팜 관제 서비스 이용 시 수집·이용·보관·파기되는
              개인정보에 관한 사항을 담고 있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">
              제2조 (개인정보의 수집 항목 및 수집 방법)
            </h2>
            <p className="mb-2">
              ① 회사는 서비스 제공을 위해 아래와 같이 개인정보를 수집할 수
              있습니다.
            </p>
            <ul className="list-disc pl-5 space-y-1 mb-2">
              <li>
                <strong className="text-foreground">필수 항목:</strong> 이메일
                주소, 비밀번호(암호화 저장), 서비스 이용을 위한 계정 식별 정보
              </li>
              <li>
                <strong className="text-foreground">선택 항목:</strong> 이름
                또는 닉네임, 프로필 이미지(소셜 로그인 시 연동되는 경우)
              </li>
              <li>
                <strong className="text-foreground">자동 수집 항목:</strong>{" "}
                서비스 이용 기록, 접속 로그, 접속 IP 주소, 쿠키 및 유사 기술
                식별자, 브라우저/기기 정보
              </li>
            </ul>
            <p>
              ② 수집 방법: 회원가입·로그인·서비스 이용 과정에서 입력, 생성,
              수집되는 정보 및 쿠키·로그를 통한 자동 수집.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">
              제3조 (개인정보의 수집·이용 목적)
            </h2>
            <p className="mb-2">
              수집한 개인정보는 다음의 목적으로만 이용됩니다.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>회원 가입·식별·본인 인증 및 계정 관리</li>
              <li>서비스 제공·운영·개선 및 신규 서비스 개발</li>
              <li>서비스 이용 기록 분석, 통계, 품질 관리 및 보안</li>
              <li>고객 문의·불만 처리 및 공지·안내 사항 전달</li>
              <li>관련 법령 및 이용약관 위반 행위 방지 및 대응</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">
              제4조 (개인정보의 보유·이용 기간)
            </h2>
            <p className="mb-2">
              ① 회사는 수집·이용 목적이 달성된 후에는 해당 개인정보를 지체 없이
              파기합니다. 단, 회원 탈퇴 시에는 탈퇴 처리 완료 시점부터 별도
              보관이 필요한 경우를 제외하고 즉시 파기합니다.
            </p>
            <p className="mb-2">
              ② 관계 법령에 따라 보존할 필요가 있는 경우 해당 법령에서 정한 기간
              동안 보존합니다.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                계약 또는 청약철회 등에 관한 기록: 5년 (전자상거래 등에서의
                소비자 보호에 관한 법률)
              </li>
              <li>
                대금결제 및 재화·서비스 공급에 관한 기록: 5년 (전자상거래
                등에서의 소비자 보호에 관한 법률)
              </li>
              <li>
                소비자 불만 또는 분쟁처리에 관한 기록: 3년 (전자상거래 등에서의
                소비자 보호에 관한 법률)
              </li>
              <li>
                표시·광고에 관한 기록: 6개월 (전자상거래 등에서의 소비자 보호에
                관한 법률)
              </li>
              <li>웹사이트 방문에 관한 기록: 3개월 (통신비밀보호법)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">
              제5조 (개인정보의 제3자 제공)
            </h2>
            <p>
              회사는 원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다.
              다만, 이용자가 사전에 동의한 경우, 또는 법령에 의해 요구되는
              경우(수사·조사·소송 등)에는 예외로 하며, 이 경우 법령이 정한
              절차에 따라 최소한으로 제공합니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">
              제6조 (개인정보 처리의 위탁)
            </h2>
            <p>
              회사는 원활한 서비스 제공을 위해 필요한 범위에서 개인정보 처리
              업무를 외부에 위탁할 수 있습니다(예: 클라우드·호스팅,
              인증·결제·분석 서비스). 위탁 시 위탁받는 자, 위탁 업무 내용,
              개인정보 보호 조치에 관한 사항을 계약 등으로 명시하고, 위탁받는
              자가 관련 법령을 준수하도록 관리합니다. 위탁 업무와 수탁자가
              변경되는 경우 이 방침을 통해 공개합니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">
              제7조 (정보주체의 권리·의무 및 행사 방법)
            </h2>
            <p className="mb-2">
              이용자(정보주체)는 언제든지 다음 권리를 행사할 수 있습니다.
            </p>
            <ul className="list-disc pl-5 space-y-1 mb-2">
              <li>개인정보 열람 요청</li>
              <li>오류 등이 있을 경우 정정·삭제 요청</li>
              <li>처리 정지 요청</li>
              <li>회원 탈퇴를 통한 개인정보 삭제 요청</li>
            </ul>
            <p>
              위 권리 행사는 서비스 내 설정, 고객센터(이메일) 등을 통해 요청하실
              수 있으며, 회사는 법령에 따른 기한 내에 조치하고 결과를
              통지합니다. 만 14세 미만 아동의 경우 법정대리인이 권리를 행사할 수
              있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">
              제8조 (개인정보의 파기 절차 및 방법)
            </h2>
            <p className="mb-2">
              ① 보유 기간이 경과하거나 처리 목적이 달성된 개인정보는 지체 없이
              파기합니다.
            </p>
            <p className="mb-2">
              ② 파기 절차: 목적 달성 후 별도 DB(또는 보관 장소)로 옮겨 내부 방침
              및 법령에 따라 일정 기간 저장된 후 파기합니다.
            </p>
            <p>
              ③ 파기 방법: 전자적 파일은 복구·재생되지 않도록 기술적 방법으로
              삭제하고, 종이에 출력된 개인정보는 분쇄 또는 소각 등으로
              파기합니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">
              제9조 (개인정보의 안전성 확보 조치)
            </h2>
            <p>
              회사는 개인정보의 안전한 처리와 유출·훼손 방지를 위해
              기술적·관리적 조치를 취합니다. 비밀번호 등은 암호화 저장하고, 접근
              권한 관리, 접속 기록 보관, 보안 프로그램·접근 제한 등 필요한
              조치를 적용합니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">
              제10조 (쿠키 등 사용)
            </h2>
            <p>
              서비스는 이용자 편의와 서비스 운영을 위해 쿠키 및 유사 기술을
              사용할 수 있습니다. 이용자는 브라우저 설정을 통해 쿠키 저장을
              거부할 수 있으며, 일부 기능 이용에 제한이 있을 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">
              제11조 (개인정보 보호책임자 및 문의)
            </h2>
            <p className="mb-2">
              회사는 개인정보 처리에 관한 업무를 총괄하고, 관련 불만 처리 및
              피해 구제를 위해 개인정보 보호책임자를 두고 있습니다.
            </p>
            <ul className="list-none space-y-1">
              <li>
                <strong className="text-foreground">담당:</strong> 개인정보
                보호책임자
              </li>
              <li>
                <strong className="text-foreground">이메일:</strong>{" "}
                support@doai.me
              </li>
            </ul>
            <p className="mt-2">
              개인정보 침해에 대한 신고나 상담이 필요하신 경우 회사 위 담당자로
              연락하시거나, 한국인터넷진흥원(KISA)
              개인정보침해신고센터(privacy.kisa.or.kr),
              개인정보분쟁조정위원회(www.kopico.go.kr) 등에 문의하실 수
              있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">
              제12조 (개인정보 처리방침의 변경)
            </h2>
            <p>
              이 개인정보처리방침은 2026년 2월 26일부터 적용됩니다. 법령·정책
              또는 서비스 변경에 따라 내용이 변경될 수 있으며, 변경 시 서비스
              초기 화면 또는 공지 등을 통해 공지하고, 법령상 동의가 필요한
              변경은 적용일 전에 안내합니다.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-6 border-t border-border flex gap-4">
          <Link href="/login" className="text-sm text-primary hover:underline">
            로그인
          </Link>
          <Link
            href="/agreement"
            className="text-sm text-primary hover:underline"
          >
            이용약관
          </Link>
          <Link
            href="/dashboard"
            className="text-sm text-primary hover:underline"
          >
            대시보드
          </Link>
        </div>
      </div>
    </div>
  );
}
