// Infoseite auf Vietnamesisch („bạn“): Pfad, Oberfläche und Seitentexte (Aufbau und Bausteine: tools/gen-seo.mjs, Liste:
// tools/seo/langs.mjs). Nur die Hauptseite; „đá bóng đầu to“ als Gattung, „2 người“ und „với bạn bè“ sind Abschnitte.
import L from "../../js/content/i18n/vi.js";

export default {
  lang: "vi", L, locale: "vi_VN",
  /** Name im Sprachumschalter der anderen Sprachen, Tooltip dazu */
  name: "Tiếng Việt", thisPage: "Trang này bằng tiếng Việt",
  /** Aufnahmen (tools/gen-landing-media.mjs): Browser-Sprache, Namen in der Einladungs-Lobby */
  media: { locale: "vi-VN", host: "Linh", guest: "Minh" },
  ui: { play: "Chơi ngay", facts: ["Miễn phí", "Không cần tải", "Không cần đăng ký"], faq: "Câu hỏi thường gặp",
    legal: [L["legal.imprint"], L["legal.privacy"], L["legal.terms"]], main: "Về trò chơi", friends: "Chơi với bạn bè", langs: "Ngôn ngữ",
    ctaNote: "Mở là chơi ngay trên trình duyệt, trên điện thoại, máy tính bảng và máy tính.",
    video: "Một trận Headstars: hai cái đầu to đá bóng trong sân vận động", online: "Online", offline: "Đấu với máy hoặc 2 người",
    endTitle: "Sẵn sàng giao bóng chưa?", action: "Thao tác" },
  pages: {
    /** covers: Seitenarten, die hier nur ein Abschnitt sind (Anker), für die Einstellungs-Links im Spiel */
    main: { path: "/vi/", src: "seo-vi", covers: { friends: "choi-voi-ban-be" }, build: ({ esc, pic, kbd, n, pu, modes, headChips, arenaMosaic, controls, PAYMENTS }) => ({
      title: "Game đá bóng đầu to online miễn phí, chơi 2 người | Headstars",
      desc: "Đá bóng đầu to ngay trên trình duyệt: 1 đấu 1 với máy, với người chơi online hoặc 2 người trên một máy. Miễn phí, không cần tải, không cần đăng ký.",
      h1: "Game đá bóng đầu to online",
      lead: "Hai cái đầu to, một quả bóng, hai khung thành. Chạy, nhảy, đánh đầu và sút: đấu với máy, với người chơi online hoặc rủ bạn chơi 2 người, ngay trên trình duyệt.",
      sections: [
        { id: "cach-choi", media: pic("scene-head", "scene", "Đánh đầu trong Headstars: một cái đầu nhảy lên đưa bóng về phía khung thành"), h2: "Đánh đầu, sút bóng, xoạc",
          html: `<p>Mỗi bên một cái đầu, ai ghi nhiều bàn hơn thì thắng. Bóng bay ra sao tùy lúc bạn chạm vào: bóng nằm yên thì thành cú vồng, bóng ngang đầu thì đi thẳng, bóng còn trên không thì thành cú vô lê.</p>
<p>Dưới đất bạn xoạc bóng, trên không bạn dậm xuống: nhảy càng cao, cú dậm càng mạnh. Canh đúng lúc nhảy là bạn đánh đầu bóng thẳng vào lưới.</p>` },
        { id: "hai-nguoi", media: pic("scene-goal-vi", "scene", "Ăn mừng bàn thắng trong Headstars"), h2: "Game đá bóng 2 người trên cùng một máy",
          html: `<p>Hai người ngồi cạnh nhau thì không cần link: chọn “${esc(L["mode.local.name"])}” rồi chơi chung một máy: chung bàn phím, mỗi người một tay cầm hoặc chia đôi màn hình cảm ứng.</p>
<p>Không phải cài đặt, không cần tài khoản, mở trang là đá. Thua một ván? Bắt đầu ván mới ngay để gỡ lại.</p>` },
        { id: "cac-dau", media: pic("heads-group", "heads", `${n.heads} cái đầu của Headstars đứng cạnh nhau`, { cls: "lp-cutout" }), h2: `${n.heads} cái đầu, mỗi đầu một cú sút đặc biệt`,
          html: `<p>Mỗi cái đầu có lối chơi riêng: đầu này chạy nhanh hơn, đầu kia nhảy cao hơn, đầu khác sút mạnh hơn. Khi thanh Super đầy, bạn tung ra cú sút đặc biệt của đầu mình.</p>`, after: headChips(), wide: true },
        { id: "sut-dac-biet", media: pic("scene-super", "scene", "Một cú sút đặc biệt bay ngang sân trong Headstars"), h2: "Cú sút đặc biệt và power-up",
          html: `<p>${esc(L["super.fire.name"])}, ${esc(L["super.ice.name"])}, ${esc(L["super.thunder.name"])}: một cú sút đặc biệt có thể lật ngược thế trận. Trên sân còn xuất hiện ${n.pus} loại power-up khác nhau, ví dụ ${pu[0]}, ${pu[1]} hay ${pu[2]}.</p>
<p>Ở chế độ ${esc(L["mode.quick.name"])} và khi chơi với bạn bè, bạn tự chọn có power-up hay không, xuất hiện dày hay thưa, và có dùng cú sút đặc biệt không.</p>` },
        { id: "san-dau", wide: true, media: arenaMosaic(), h2: `${n.arenas} sân đấu, mỗi sân một kiểu vật lý`,
          html: `<p>Trên ${esc(L["arena.eis.name"])} bạn trượt đi, trên ${esc(L["arena.mond.name"])} bạn nhảy cực cao, còn ở ${esc(L["arena.strand.name"])} cát làm bóng chậm lại. ${n.start} sân có sẵn từ đầu, ${n.byLevel} sân mở khóa khi bạn lên cấp, thêm ${n.bySeason} sân nữa ra mắt theo từng mùa giải.</p>` },
        { panel: true, id: "che-do", h2: "Chế độ chơi", html: modes() },
        { id: "choi-voi-ban-be", media: pic("mode-online", "mode", `Chế độ “${L["mode.online.name"]}” trong Headstars`, { sizes: "(min-width: 960px) 40vw, 100vw" }), h2: "Đá bóng online với bạn bè",
          html: `<p>Bạn của bạn không cần tải gì, cũng không cần tạo tài khoản. Ở mục “${esc(L["html.home.modus"])}”, chọn “${esc(L["mode.online.name"])}”, bấm “${esc(L["html.home.spielen"])}” rồi “${esc(L["html.online.raumErstellen"])}”. Bạn nhận được một link, một mã QR và một mã phòng gồm bốn ký tự.</p>
<p>Gửi link qua Zalo, Messenger hay bất kỳ ứng dụng nhắn tin nào. Bạn bè mở link là vào thẳng phòng của bạn: mỗi người chọn đầu của mình, bạn chỉnh sân và luật, rồi bắt đầu đá. Một người dùng điện thoại, người kia dùng máy tính vẫn đấu được với nhau, hết trận thì đá lại ngay.</p>` },
        { panel: true, id: "dieu-khien", h2: "Điều khiển", html: `${controls()}
<p>Chạm nhanh nút nhảy: nhảy thấp; giữ lâu: nhảy hết cỡ. Khi 2 người chơi chung một bàn phím, người thứ hai dùng ${kbd("←")}${kbd("→")} để chạy, ${kbd("↑")} để nhảy, ${kbd("↓")} để xoạc, ${kbd("Enter")} để sút và ${kbd(".")} cho cú sút đặc biệt. Trên điện thoại, hãy xoay ngang màn hình.</p>` },
      ],
      faq: [
        ["Headstars có miễn phí không?", `Có. Headstars hoàn toàn miễn phí. Xu và ngọc để mở khóa đầu, bóng và sân mới đều kiếm được khi chơi.${PAYMENTS ? " Nếu muốn, bạn có thể mua thêm một số nội dung." : " Không có giao dịch bằng tiền thật."}`],
        ["Có cần tải về hay tạo tài khoản không?", `Không. Headstars chạy trên trình duyệt. Lần đầu vào, trò chơi tạo cho bạn một tài khoản khách, không cần email hay mật khẩu. Muốn lưu tiến trình hoặc chơi tiếp trên máy khác, hãy liên kết tài khoản với email. Với ${esc(L["mode.ranked.name"])} và bảng xếp hạng thì bắt buộc phải liên kết.`],
        ["Chơi 2 người trên cùng một máy được không?", `Được. Ở chế độ “${esc(L["mode.local.name"])}”, hai người dùng chung bàn phím hoặc mỗi người một tay cầm. Còn khi chơi online, mỗi người dùng máy của mình.`],
        ["Chơi trên điện thoại được không?", `Được. Trên điện thoại và máy tính bảng bạn điều khiển bằng cảm ứng, tốt nhất là xoay ngang màn hình. Nếu trình duyệt hỗ trợ, bạn có thể cài Headstars như một ứng dụng (${esc(L["html.settings.einstellungen"])} → ${esc(L["install.title"])}).`],
        ["Chơi bằng tay cầm được không?", "Được. Các nút có trong bảng ở mục “Điều khiển”. Khi 2 người chơi trên cùng một máy, mỗi người có thể dùng tay cầm riêng."],
        ["Làm sao để đá bóng online với bạn bè?", `Tạo phòng, gửi link là xong. Hướng dẫn từng bước ở <a href="#choi-voi-ban-be">Đá bóng online với bạn bè</a>.`],
        ["Bạn bè không nhận được link thì sao?", `Bạn của bạn cũng chọn “${esc(L["mode.online.name"])}” trong game rồi nhập mã phòng bốn ký tự vào ô “${esc(L["html.online.codeVonDeinemKumpel"])}”.`],
      ],
    }) },
  },
};
