import Link from "next/link";

export const metadata = {
  title: "이용약관 | DoAi.Me",
  description: "DoAi.Me 스마트폰 팜 관제 서비스 이용약관",
};

export default function AgreementPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold mb-2">DoAi.Me 이용약관</h1>
        <p className="text-sm text-muted-foreground mb-8">
          시행일자: 2026년 2월 26일
        </p>

        <div className="space-y-6 text-sm text-muted-foreground leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">
              제1조 (목적)
            </h2>
            <p>
              이 약관은 DoAi.Me(이하 &quot;회사&quot;)가 제공하는 스마트폰 팜
              관제 콘솔 서비스(이하 &quot;서비스&quot;)의 이용 조건 및 절차,
              회원과 회사 간의 권리·의무 및 책임사항, 기타 필요한 사항을
              규정함을 목적으로 합니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">
              제2조 (정의)
            </h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                &quot;서비스&quot;란 회사가 제공하는 디바이스
                관리·모니터링·자동화 플랫폼 및 관련 웹·앱을 말합니다.
              </li>
              <li>
                &quot;회원&quot;이란 회사와 서비스 이용계약을 체결하고 회사가
                부여한 계정으로 서비스를 이용하는 자를 말합니다.
              </li>
              <li>
                &quot;이용자&quot;란 서비스에 접속하여 이 약관에 따라 회사를
                이용하는 회원 및 비회원을 말합니다.
              </li>
              <li>
                &quot;계정&quot;이란 회원의 식별과 서비스 이용을 위해 회원이
                등록한 이메일 등 회사가 정한 정보를 말합니다.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">
              제3조 (약관의 명시·효력 및 변경)
            </h2>
            <p className="mb-2">
              ① 이 약관은 서비스 초기 화면, 회원가입 절차 또는 연결 화면에
              게시하거나 기타의 방법으로 회원에게 공지함으로써 효력이
              발생합니다.
            </p>
            <p className="mb-2">
              ② 회사는 필요한 경우 관련 법령을 위반하지 않는 범위에서 이 약관을
              변경할 수 있습니다. 약관을 변경할 경우에는 적용일자 및 변경사유를
              명시하여 현행약관과 함께 서비스 초기화면에 그 적용일자
              7일(회원에게 불리한 내용인 경우 30일) 이전부터 적용일자 전일까지
              공지합니다.
            </p>
            <p>
              ③ 회원은 변경된 약관에 동의하지 않을 경우 이용계약을 해지할 수
              있으며, 변경 적용일 이후에도 서비스를 계속 이용한 경우 약관 변경에
              동의한 것으로 봅니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">
              제4조 (서비스의 제공)
            </h2>
            <p className="mb-2">회사는 다음과 같은 서비스를 제공합니다.</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>스마트폰 팜(디바이스) 원격 관리 및 모니터링</li>
              <li>작업 자동화, 스케줄링 및 큐 관리</li>
              <li>실시간 상태 대시보드 및 통계</li>
              <li>회원 인증·계정 관리</li>
              <li>기타 회사가 정하는 서비스</li>
            </ul>
            <p className="mt-2">
              서비스의 구체적 내용은 회사의 서비스 안내에 따르며, 회사는 사전
              공지 후 서비스 내용을 변경할 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">
              제5조 (이용계약의 성립)
            </h2>
            <p className="mb-2">
              ① 이용계약은 이용자가 약관의 내용에 동의하고 회사가 정한 가입
              양식에 따라 회원정보를 기입한 후 회사가 이를 승낙함으로써
              성립합니다.
            </p>
            <p className="mb-2">
              ② 회사는 다음 각 호에 해당하는 경우 이용신청을 승낙하지 않거나
              사후에 이용계약을 해지할 수 있습니다.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>허위 정보를 기재하거나 필수 항목을 누락한 경우</li>
              <li>타인의 명의·계정을 도용한 경우</li>
              <li>관련 법령 또는 약관을 위반한 경우</li>
              <li>회사의 서비스 운영에 현저한 지장을 초래하는 경우</li>
              <li>기타 회사가 합리적으로 승낙할 수 없는 사유가 있는 경우</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">
              제6조 (계정 관리)
            </h2>
            <p className="mb-2">
              ① 회원은 자신의 계정에 대한 관리 책임이 있으며, 계정을 타인에게
              이용하게 해서는 안 됩니다.
            </p>
            <p>
              ② 회원은 계정 및 비밀번호가 도용되거나 제3자가 사용하고 있음을
              인지한 경우 즉시 회사에 통보하고 회사의 안내에 따라야 합니다. 해당
              사항을 통보하지 않아 발생한 불이익에 대해 회사는 책임지지
              않습니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">
              제7조 (회원의 의무 및 금지행위)
            </h2>
            <p className="mb-2">회원은 다음 행위를 하여서는 안 됩니다.</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                회사·타인·제3자의 지식재산권, 명예권, 프라이버시권 등 권리를
                침해하는 행위
              </li>
              <li>관련 법령 또는 약관, 이용안내를 위반하는 행위</li>
              <li>
                서비스 이용권한, 계정, 기타 이용계약상 지위를 타인에게
                양도·증여·대여하는 행위
              </li>
              <li>
                서비스를 역설계, 디컴파일, 분해하거나 상업적 이용·재판매
                목적으로 이용하는 행위
              </li>
              <li>서비스 운영을 방해하거나 시스템·네트워크를 침해하는 행위</li>
              <li>허위 정보 유포, 스팸, 악성코드 유포 등 부정한 목적의 이용</li>
              <li>기타 회사가 부적절하다고 판단하는 행위</li>
            </ul>
            <p className="mt-2">
              회사는 위 반복행위에 대해 사전 통지 후 서비스 이용을 제한하거나
              이용계약을 해지할 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">
              제8조 (서비스의 변경·중단)
            </h2>
            <p className="mb-2">
              ① 회사는 시스템 점검, 증설·교체, 고장, 통신 두절, 정책 변경 등
              필요한 경우 서비스의 전부 또는 일부를 일시적으로 변경·중단할 수
              있으며, 가능한 경우 사전에 공지합니다.
            </p>
            <p>
              ② 천재지변, 전쟁, 테러, 랜섬웨어 등 불가항력적 사유로 인한 서비스
              중단에 대해서는 회사가 책임을 지지 않습니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">
              제9조 (저작권 등)
            </h2>
            <p>
              서비스에 게시된 콘텐츠, UI, 로고, 소프트웨어 등에 대한
              저작권·지식재산권은 회사 또는 권리자에게 귀속됩니다. 회원은 회사의
              사전 서면 동의 없이 이를 복제, 배포, 수정, 2차적 저작물 작성
              등으로 이용할 수 없습니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">
              제10조 (이용계약의 해지)
            </h2>
            <p className="mb-2">
              ① 회원은 언제든지 서비스 내 계정 설정 등에서 탈퇴를 요청할 수
              있으며, 회사는 관련 법령이 정하는 바에 따라 처리합니다.
            </p>
            <p>
              ② 회사는 회원이 약관 또는 법령을 위반한 경우, 또는 제5조·제7조
              등에 따른 사유가 있는 경우 이용계약을 해지할 수 있습니다. 이 경우
              회사는 회원에게 사전 통지할 수 있으며, 긴급한 경우 사후 통지할 수
              있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">
              제11조 (면책)
            </h2>
            <p className="mb-2">
              ① 회사는 천재지변, 불가항력, 회원의 귀책사유, 제3자의 행위 등으로
              인한 서비스 이용 장애·손해에 대해 책임을 지지 않습니다.
            </p>
            <p>
              ② 회사는 회원이 서비스를 이용하여 취득한 정보·결과에 대해
              정확성·적법성을 보장하지 않으며, 회원 간 또는 회원과 제3자 간
              분쟁에 개입할 의무가 없습니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">
              제12조 (준거법 및 관할)
            </h2>
            <p>
              이 약관과 서비스 이용으로 발생한 분쟁에 대하여는 대한민국 법률을
              적용합니다. 회사와 회원 간 제기된 소송은 회사의 본사 소재지를
              관할하는 법원을 관할 법원으로 합니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">
              부칙
            </h2>
            <p>이 약관은 2026년 2월 26일부터 시행합니다.</p>
          </section>
        </div>

        <div className="mt-12 pt-6 border-t border-border flex gap-4">
          <Link href="/login" className="text-sm text-primary hover:underline">
            로그인
          </Link>
          <Link
            href="/privacy"
            className="text-sm text-primary hover:underline"
          >
            개인정보처리방침
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
