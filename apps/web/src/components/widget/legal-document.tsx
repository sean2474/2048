import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";

const policies = {
  privacy: {
    ko: {
      title: "개인정보처리방침",
      intro:
        "2048 Duo 운영팀은 아래와 같이 계정, 게임 및 문의 정보를 처리합니다. 시행일: 2026년 10월 19일.",
      sections: [
        [
          "처리 목적과 수집 항목",
          "회원가입 시 이메일, 비밀번호, 표시 이름을 입력받습니다. 인증은 Supabase Auth가 처리하며 비밀번호 원문을 게임 DB에 저장하지 않습니다. 계정 식별자, 언어·키 설정, 장착 항목, 친구 관계와 직접 메시지, 출석·업적·퀘스트, 코인 지급·사용 내역, 경기 결과·점수·레이팅·게임 조작 통계와 솔로 진행상황을 서비스 제공과 부정이용 대응을 위해 처리합니다. 피드백을 보내면 입력한 내용과 로그인한 경우 계정 식별자를 함께 저장합니다.",
        ],
        [
          "공개되는 정보",
          "표시 이름, 아이콘, 순위·점수·경기 결과 일부는 순위표나 대전 상대에게 표시됩니다. 친구에게는 접속·게임 상태가 표시되며, 허용된 친구는 경기를 관전할 수 있습니다. 직접 메시지는 대화 상대에게 전달됩니다. 이메일과 인증 정보는 공개 프로필에 표시하지 않습니다. 이름이나 메시지에 공개하고 싶지 않은 개인정보를 넣지 마세요.",
        ],
        [
          "브라우저 저장소와 이용 통계",
          "로그인 쿠키와 브라우저 저장소를 인증, 언어·소리·키 설정, 게스트 세션과 솔로 이어하기에 사용합니다. 브라우저에서 삭제하거나 차단할 수 있으나 로그인과 게스트 이어하기가 제한될 수 있습니다. 운영 사이트는 Vercel Web Analytics와 Speed Insights로 페이지 경로, 기능 이용 이벤트, 기기·접속 환경과 성능 지표를 처리합니다. 앱은 이메일·계정 ID·방 코드·메시지·비밀번호를 분석 이벤트에 넣지 않습니다. 호스팅 사업자는 연결·보안 처리 과정에서 IP 주소 등 접속 정보를 처리할 수 있습니다.",
        ],
        [
          "보관과 삭제",
          "계정에 연결된 프로필·설정·친구 관계·메시지·보상·구매·솔로 진행 정보는 계정 유지 중 보관하며 탈퇴 시 삭제합니다. 다른 참가자의 기록과 통계를 유지하기 위해 완료 경기 결과는 남고, 탈퇴한 참가자의 이름은 ‘Deleted player’로 바뀌며 계정 연결은 제거됩니다. 피드백과 운영 감사 기록은 탈퇴 시 자동 삭제되지 않습니다. 피드백은 작성자 계정 연결을 제거하며, 감사 기록에는 작업 대상 계정 식별자가 남을 수 있습니다. 관련 기록의 삭제·정정은 아래 문의 이메일로 요청할 수 있습니다. 공급자의 로그·백업에는 각 공급자의 보관 정책이 적용됩니다.",
        ],
        [
          "처리 위탁과 국외 처리",
          "Supabase는 인증·DB·파일 저장을, Fly.io는 실시간 게임 서버를, Vercel은 웹 호스팅·이용 통계·성능 측정을 제공합니다. 운영 DB와 이전 완료 후 게임 서버의 주 리전은 일본 도쿄입니다. Vercel의 글로벌 전달망, 공급자의 지원·보안·로그 및 이메일 전달 과정에서는 미국 등 국외에서 정보가 처리될 수 있습니다. 서비스 이용 중 암호화된 네트워크를 통해 필요한 정보가 전달됩니다. 각 공급자의 개인정보 문서와 하위 처리자 목록은 아래 링크에서 확인할 수 있습니다. 국외 처리를 원하지 않으면 계정 이용을 중단하고 삭제 또는 처리정지를 요청할 수 있으며 일부 서비스는 제공하기 어렵습니다.",
        ],
        [
          "이용자의 권리와 보호 조치",
          "설정에서 표시 이름을 수정하거나 계정을 삭제할 수 있습니다. 이메일로 열람·정정·삭제·처리정지 또는 대리인을 통한 요청을 할 수 있으며, 필요한 최소한의 본인 확인 후 처리합니다. 법령상 제한이 있으면 이유를 안내합니다. 접근 권한을 제한하고 암호화된 전송, DB 접근 정책과 관리자 2단계 인증을 사용합니다. 개인정보 문의와 권리 행사 담당은 2048 Duo 운영팀입니다.",
        ],
        [
          "변경 안내",
          "수집 목적·항목·공급자 등 중요한 변경이 있으면 이 페이지의 시행일과 내용을 갱신하고 필요한 경우 서비스 화면에서 별도로 안내합니다.",
        ],
      ],
    },
    en: {
      title: "Privacy policy",
      intro:
        "The 2048 Duo team handles account, game and support information as described below. Effective October 19, 2026.",
      sections: [
        [
          "Information and purposes",
          "Registration asks for your email, password and display name. Supabase Auth handles authentication; the game database does not store plaintext passwords. We process account identifiers, preferences, equipped items, friendships and direct messages, attendance, achievements, quests, coin transactions, match results, scores, ratings, gameplay statistics and solo progress to provide the service and address abuse. Feedback stores the text you submit and your account identifier when signed in.",
        ],
        [
          "Information visible to others",
          "Your display name, icon, standings, scores and some match results are visible on leaderboards or to opponents. Friends can see your online/game status and spectate when permitted. Direct messages are delivered to the other participant. Email and authentication information are not shown on public profiles. Do not put private information in display names or messages.",
        ],
        [
          "Browser storage and analytics",
          "Cookies and browser storage support authentication, language, sound, controls, guest sessions and solo continuation. You can remove or block them, which may prevent login and guest continuation. The production site uses Vercel Web Analytics and Speed Insights for page paths, feature events, device/connection context and performance. The app does not include email, account IDs, room codes, messages or passwords in analytics events. Hosting providers may process IP addresses and connection information for delivery and security.",
        ],
        [
          "Retention and deletion",
          "Account-linked profiles, preferences, friendships, messages, rewards, purchases and solo progress are kept while the account exists and removed on deletion. Completed match results remain for opponents and statistics, with the deleted player's name replaced by ‘Deleted player’ and account linkage removed. Feedback and administrative audit records are not automatically deleted with an account. Feedback is detached from its author account; audit records may retain the identifier of an affected account. Contact the email below to request deletion or correction of these records. Provider retention policies apply to their logs and backups.",
        ],
        [
          "Providers and international processing",
          "Supabase provides authentication, database and file storage; Fly.io hosts real-time game servers; Vercel provides web hosting, analytics and performance measurement. The production database and, after the migration, the game server use Tokyo, Japan as their primary region. Global delivery, support, security logs and email services may process information in the United States and other countries. Required information is transmitted over encrypted connections as you use the service. Provider privacy notices and subprocessor lists are linked below. If you do not want this processing, you can stop account use and request deletion or restriction; some services cannot then be provided.",
        ],
        [
          "Your choices and safeguards",
          "You can edit your display name or delete your account in Settings. Contact us to request access, correction, deletion or restriction, including through an authorized representative. We verify identity using the minimum information needed and explain any legal restriction. We use restricted access, encrypted transport, database access policies and administrator two-factor authentication. The 2048 Duo team handles privacy requests.",
        ],
        [
          "Changes",
          "We update this page and its effective date when practices change, and provide an additional in-service notice for material changes when necessary.",
        ],
      ],
    },
  },
  terms: {
    ko: {
      title: "이용약관",
      intro:
        "이 약관은 2048 Duo 운영팀이 제공하는 게임과 계정 기능의 이용 조건을 안내합니다. 시행일: 2026년 10월 19일.",
      sections: [
        [
          "서비스와 계정",
          "2048 Duo는 게스트 대전, 계정 기반 랭크, 솔로, 친구·메시지와 꾸미기 기능을 제공합니다. 본인이 사용할 권한이 있는 이메일로 가입하고 계정과 비밀번호를 안전하게 관리해 주세요. 타인의 계정을 사용하거나 허위 신원으로 다른 사람을 사칭할 수 없습니다.",
        ],
        [
          "공정한 이용",
          "자동화된 부정 플레이, 게임 결과 조작, 취약점 악용, 과도한 요청, 다른 이용자의 개인정보 수집·공개, 괴롭힘·위협·불법 콘텐츠 전송을 금지합니다. 서비스 보호를 위해 해당 행위에 대한 조사, 콘텐츠 제한 또는 계정 정지를 할 수 있습니다. 정지에 이의가 있으면 아래 연락처로 문의할 수 있습니다.",
        ],
        [
          "코인과 꾸미기",
          "현재 코인은 출석·퀘스트·운영 지급으로 얻는 게임 내 재화이며 현금 충전, 현금 환전이나 이용자 간 거래를 제공하지 않습니다. 구매 전에 표시되는 가격과 잔액을 확인해 주세요. 스킨과 아이콘은 외형을 바꾸며 승리를 보장하지 않습니다. 오류로 잘못 지급·차감된 내역은 기록을 확인한 뒤 정정할 수 있습니다. 유료 결제를 도입할 때는 가격·환불 조건을 별도로 안내합니다.",
        ],
        [
          "게임 기록과 업데이트",
          "서버가 이동·점수·승패·보상을 판정합니다. 일반적인 연결 끊김은 30초 재접속 대기 규칙을 따릅니다. 계획된 소켓 업데이트는 진행 중 경기 종료와 저장 완료를 기다리는 절차를 사용합니다. 네트워크 장애, 기기 종료 또는 예기치 않은 서버 장애까지 무중단으로 보장하는 것은 아니며 필요한 점검·변경은 가능한 범위에서 안내합니다. 기능·밸런스는 변경될 수 있고 중요한 변경은 공지합니다.",
        ],
        [
          "콘텐츠와 개인정보",
          "메시지와 피드백에는 본인이 공유할 권한이 있는 내용만 작성해 주세요. 게임 화면과 콘텐츠를 무단 재판매하거나 서비스 운영을 방해할 수 없습니다. 개인정보의 처리와 삭제는 개인정보처리방침을 따릅니다.",
        ],
        [
          "탈퇴와 문의",
          "설정에서 언제든 계정 삭제를 요청할 수 있습니다. 진행 중 경기나 저장 대기가 있으면 먼저 완료해야 합니다. 탈퇴로 계정에 연결된 코인·꾸미기·개인 기록을 잃을 수 있으므로 삭제 안내를 확인해 주세요. 서비스 문제, 이용 제한 이의 제기와 기타 문의는 2048 Duo 운영팀에 연락해 주세요.",
        ],
        [
          "약관 변경과 책임",
          "중요한 조건 변경은 시행 전에 서비스에서 안내합니다. 변경된 조건에 동의하지 않으면 이용을 중단하고 탈퇴할 수 있습니다. 이 약관은 적용되는 법령에 따른 이용자의 권리나 운영자의 법적 책임을 배제하지 않습니다. 분쟁이 생기면 먼저 문의를 통해 해결을 시도하며, 해결되지 않으면 적용 법령과 관할 규정에 따릅니다.",
        ],
      ],
    },
    en: {
      title: "Terms of use",
      intro:
        "These terms describe use of the game and account features provided by the 2048 Duo team. Effective October 19, 2026.",
      sections: [
        [
          "Service and accounts",
          "2048 Duo offers guest matches, account-based ranked play, solo games, friends, messages and cosmetics. Register with an email you are authorized to use and protect your credentials. Do not access another person's account or impersonate others.",
        ],
        [
          "Fair play",
          "Cheating through automation, manipulating results, exploiting vulnerabilities, excessive requests, collecting or exposing others' private information, harassment, threats and illegal content are prohibited. We may investigate, restrict content or suspend accounts to protect the service. Contact us to appeal a restriction.",
        ],
        [
          "Coins and cosmetics",
          "Coins are currently earned through attendance, quests or operator grants. We do not offer cash top-ups, cash redemption or transfers between users. Check the displayed price and balance before buying. Skins and icons change appearance and do not guarantee wins. Incorrect grants or deductions may be corrected after checking the records. Any future paid purchases will have separately disclosed prices and refund conditions.",
        ],
        [
          "Game records and updates",
          "The server determines moves, scores, outcomes and rewards. Ordinary disconnects use a 30-second reconnect window. Planned socket updates follow a procedure that waits for ongoing games and pending saves to finish. This does not guarantee uninterrupted play during network failures, device shutdowns or unexpected server faults. We communicate maintenance and material gameplay changes where practicable.",
        ],
        [
          "Content and privacy",
          "Only submit messages and feedback you have the right to share. Do not resell game content without permission or interfere with the service. Personal information and deletion are described in the Privacy policy.",
        ],
        [
          "Leaving and support",
          "You may request account deletion in Settings. Finish active games and pending saves first. Deletion can remove account-linked coins, cosmetics and personal records; read the deletion notice before proceeding. Contact the 2048 Duo team for service problems, appeals or questions.",
        ],
        [
          "Changes and responsibility",
          "Material changes to these terms will be announced in the service before they take effect. You may stop using the service and delete your account if you disagree. These terms do not exclude rights or responsibilities imposed by applicable law. Please contact us first about disputes; unresolved matters remain subject to applicable law and jurisdiction rules.",
        ],
      ],
    },
  },
};

export async function LegalDocument({ kind }: { kind: keyof typeof policies }) {
  const { locale, t } = await getI18n();
  const content = policies[kind][locale === "ko" ? "ko" : "en"];
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-3xl font-bold tracking-tight">{content.title}</h1>
      <p className="text-sm leading-7 text-muted-foreground">{content.intro}</p>
      {content.sections.map(([title, body]) => (
        <section key={title} className="space-y-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="text-sm leading-7 text-muted-foreground">{body}</p>
        </section>
      ))}
      <section className="space-y-3 border-t pt-6">
        <h2 className="text-lg font-bold">
          {locale === "ko" ? "연락처와 관련 문서" : "Contact and related documents"}
        </h2>
        <a
          className="inline-flex min-h-11 items-center break-all text-sm underline underline-offset-4"
          href="mailto:sean24740@gmail.com"
        >
          sean24740@gmail.com
        </a>
        <nav
          aria-label={locale === "ko" ? "관련 문서" : "Related documents"}
          className="flex flex-wrap gap-x-5 gap-y-1 text-sm underline underline-offset-4"
        >
          <Link
            className="inline-flex min-h-11 items-center"
            href={kind === "privacy" ? "/terms" : "/privacy"}
          >
            {t(kind === "privacy" ? "Terms of use" : "Privacy policy")}
          </Link>
          <Link className="inline-flex min-h-11 items-center" href="/settings">
            {t("Settings")}
          </Link>
          <Link className="inline-flex min-h-11 items-center" href="/feedback">
            {t("Feedback")}
          </Link>
          {kind === "privacy" && (
            <>
              <a className="inline-flex min-h-11 items-center" href="https://supabase.com/privacy">
                Supabase
              </a>
              <a
                className="inline-flex min-h-11 items-center"
                href="https://fly.io/legal/privacy-policy/"
              >
                Fly.io
              </a>
              <a
                className="inline-flex min-h-11 items-center"
                href="https://vercel.com/legal/privacy-policy"
              >
                Vercel
              </a>
            </>
          )}
        </nav>
      </section>
    </main>
  );
}
