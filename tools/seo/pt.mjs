// Infoseite auf Portugiesisch (Brasilien, „você“; deckt Portugal mit ab): Pfad, Oberfläche und Seitentexte (Aufbau und
// Bausteine: tools/gen-seo.mjs, Liste: tools/seo/langs.mjs). Nur die Hauptseite; „com amigos“ und „2 jogadores“ sind Abschnitte.
import L from "../../js/content/i18n/pt.js";

export default {
  lang: "pt", L, locale: "pt_BR",
  /** Name im Sprachumschalter der anderen Sprachen, Tooltip dazu */
  name: "Português", thisPage: "Esta página em português",
  /** Aufnahmen (tools/gen-landing-media.mjs): Browser-Sprache, Namen in der Einladungs-Lobby */
  media: { locale: "pt-BR", host: "Bia", guest: "Lucas" },
  ui: { play: "Jogar agora", facts: ["Grátis", "Sem download", "Sem cadastro"], faq: "Perguntas frequentes",
    legal: ["Aviso legal", "Privacidade", "Termos"], main: "Sobre o jogo", friends: "Jogar com amigos", langs: "Idiomas",
    ctaNote: "Começa direto no navegador, no celular, no tablet e no PC.",
    video: "Partida de Headstars: duas cabeças jogam futebol de cabeça no estádio", online: "Online", offline: "Contra o computador ou a dois",
    endTitle: "Pronto para o apito inicial?", action: "Ação" },
  pages: {
    /** covers: Seitenarten, die hier nur ein Abschnitt sind (Anker), für die Einstellungs-Links im Spiel */
    main: { path: "/pt/", src: "seo-pt", covers: { friends: "com-amigos" }, build: ({ esc, pic, kbd, n, pu, modes, headChips, arenaMosaic, controls, PAYMENTS }) => ({
      title: "Jogo de futebol de cabeça online e grátis | Headstars",
      desc: "Futebol de cabeça no navegador: 1 contra 1 contra o computador, jogadores do mundo todo ou seus amigos por link. Grátis, sem download e sem cadastro.",
      h1: "Futebol de cabeça online",
      lead: "Partidas de um contra um com cabeças gigantes: corra, pule, cabeceie e chute. Contra o computador, contra gente do mundo todo ou com seus amigos, direto no navegador.",
      sections: [
        { id: "jogar", media: pic("scene-head", "scene", "Cabeçada no Headstars: uma cabeça pula e cabeceia a bola em direção ao gol"), h2: "Cabeceie, chute e dê carrinho",
          html: `<p>Dois jogadores, uma bola e dois gols. O jeito que a bola sai depende do momento do toque: com a bola parada ela sai de cobertura, na altura da cabeça ela vai reta, e no ar vira voleio.</p>
<p>No chão você dá carrinho, no ar desce com um pisão: quanto mais alto, mais forte. Acertou o tempo do pulo? Aí você cabeceia a bola no ar direto pro gol.</p>` },
        { id: "cabecas", media: pic("heads-group", "heads", `As ${n.heads} cabeças do Headstars lado a lado`, { cls: "lp-cutout" }), h2: `${n.heads} cabeças, cada uma com seu chute especial`,
          html: `<p>Cada cabeça joga de um jeito: uma é mais rápida, outra pula mais alto, outra chuta mais forte. Quando a sua barra de super enche, você solta o chute especial dela.</p>`, after: headChips(), wide: true },
        { id: "chutes-especiais", media: pic("scene-super", "scene", "Um chute especial atravessa o campo no Headstars"), h2: "Chutes especiais e power-ups",
          html: `<p>${esc(L["super.fire.name"])}, ${esc(L["super.ice.name"])}, ${esc(L["super.thunder.name"])}: um chute especial pode virar o jogo. Além disso, aparecem no campo ${n.pus} power-ups diferentes, como ${pu[0]}, ${pu[1]} ou ${pu[2]}.</p>
<p>Na ${esc(L["mode.quick.name"])} e com amigos, você decide se aparecem power-ups, com que frequência, e se os chutes especiais valem.</p>` },
        { id: "arenas", wide: true, media: arenaMosaic(), h2: `${n.arenas} arenas com física própria`,
          html: `<p>Na ${esc(L["arena.eis.name"])} você escorrega, na ${esc(L["arena.mond.name"])} pula altíssimo e na ${esc(L["arena.strand.name"])} a areia segura a bola. ${n.start} arenas já vêm liberadas, ${n.byLevel} você desbloqueia subindo de nível e mais ${n.bySeason} chegam com as temporadas.</p>` },
        { panel: true, id: "modos", h2: "Modos de jogo", html: modes() },
        { id: "com-amigos", media: pic("mode-online", "mode", `Modo “${L["mode.online.name"]}” do Headstars`, { sizes: "(min-width: 960px) 40vw, 100vw" }), h2: "Jogar com amigos online",
          html: `<p>Seu amigo não precisa baixar nada nem criar conta. Em “${esc(L["html.home.modus"])}”, escolha “${esc(L["mode.online.name"])}”, toque em “${esc(L["html.home.spielen"])}” e depois em “${esc(L["html.online.raumErstellen"])}”. Você recebe um link, um QR code e um código de sala de quatro caracteres.</p>
<p>Mande o link pelo WhatsApp ou por qualquer app de mensagens. Seu amigo abre e cai direto na sua sala: cada um escolhe sua cabeça, você ajusta a arena e as regras, e a partida começa. Funciona até do celular contra o PC, e no fim a revanche começa na hora.</p>` },
        { id: "dois-jogadores", media: pic("scene-goal-pt", "scene", "Comemoração de gol no Headstars"), h2: "Futebol para 2 jogadores no mesmo aparelho",
          html: `<p>Estão lado a lado? Então nem precisa de link: escolham “${esc(L["mode.local.name"])}” e joguem no mesmo aparelho, no mesmo teclado, com dois controles ou na tela de toque dividida ao meio.</p>
<p>É o clássico jogo de futebol de cabeça para 2 jogadores, sem instalar nada.</p>` },
        { panel: true, id: "controles", h2: "Controles", html: `${controls()}
<p>Toque rápido no pulo: meia altura; segurando: pulo completo. Jogando a dois no mesmo teclado, o jogador 2 usa ${kbd("←")}${kbd("→")} para correr, ${kbd("↑")} para pular, ${kbd("↓")} para o carrinho, ${kbd("Enter")} para chutar e ${kbd(".")} para o chute especial. No celular, jogue com a tela na horizontal.</p>` },
      ],
      faq: [
        ["O Headstars é grátis?", `Sim. O Headstars não custa nada. Moedas e joias para novas cabeças, bolas e arenas você ganha jogando.${PAYMENTS ? " Alguns conteúdos podem ser comprados, se você quiser." : " Não há compras com dinheiro real."}`],
        ["Preciso baixar alguma coisa ou criar conta?", `Não. O Headstars roda no navegador. Na primeira vez, o jogo cria uma conta de convidado, sem e-mail e sem senha. Se quiser salvar seu progresso ou continuar em outro aparelho, vincule a conta ao seu e-mail. Para a ${esc(L["mode.ranked.name"])} e os rankings, isso é obrigatório.`],
        ["Dá para jogar no celular?", `Sim. No celular e no tablet você joga pelo toque, de preferência com a tela na horizontal. Se o seu navegador oferecer, dá para instalar o Headstars como app (${esc(L["html.settings.einstellungen"])} → ${esc(L["install.title"])}).`],
        ["Dá para jogar com controle?", "Sim. Os botões estão na tabela em “Controles”. Jogando a dois no mesmo aparelho, cada um pode usar seu próprio controle."],
        ["Como jogar com amigos online?", `Crie uma sala, mande o link e pronto. Passo a passo em <a href="#com-amigos">Jogar com amigos online</a>.`],
        ["Dá para jogar em 2 jogadores no mesmo computador?", `Sim. No modo “${esc(L["mode.local.name"])}”, vocês dividem o teclado ou usam dois controles. Online, cada um joga do seu aparelho.`],
        ["E se o link não chegar?", `Seu amigo também escolhe “${esc(L["mode.online.name"])}” no jogo e digita o código de sala de quatro caracteres em “${esc(L["html.online.codeVonDeinemKumpel"])}”.`],
      ],
    }) },
  },
};
