// Infoseiten auf Englisch: Pfade, Oberfläche und Seitentexte (Aufbau und Bausteine: tools/gen-seo.mjs, Liste: tools/seo/langs.mjs)
import L from "../../js/content/i18n/en.js";

export default {
  lang: "en", L, locale: "en_US",
  /** Name im Sprachumschalter der anderen Sprachen, Tooltip dazu */
  name: "English", thisPage: "This page in English",
  /** Aufnahmen (tools/gen-landing-media.mjs): Browser-Sprache, Namen in der Einladungs-Lobby */
  media: { locale: "en-US", host: "Sam", guest: "Alex" },
  ui: { play: "Play now", facts: ["Free", "No download", "No sign-up"], faq: "FAQ",
    legal: ["Legal Notice", "Privacy", "Terms"], main: "Game guide", friends: "Play with friends", langs: "Languages",
    ctaNote: "Starts right in your browser, on phone, tablet and PC.",
    video: "Gameplay from Headstars: two heads play header soccer in the stadium", online: "Online", offline: "Against the computer or two players",
    endTitle: "Ready for kick-off?", action: "Action" },
  /** 404.html (tools/gen-seo.mjs): unbekannte Adresse */
  notFound: { title: "Page not found | Headstars", h1: "Page not found", lead: "This address does not exist (anymore). The game and the guides are just one click away." },
  pages: {
    main: { path: "/en/", src: "seo-en", build: ({ esc, pic, kbd, n, pu, path, modes, headChips, arenaMosaic, controls, PAYMENTS }) => ({
      title: "Header Soccer Online – Free 1v1 Browser Game | Headstars",
      desc: "A 1v1 header soccer game in your browser: play the computer, players from around the world or a friend by link. Free, no download, no sign-up.",
      h1: "Play header soccer online",
      lead: "One-on-one soccer with oversized heads: run, jump, head and shoot. Against the computer, opponents from around the world or your friends, right in your browser.",
      sections: [
        { id: "play", media: pic("scene-head", "scene", "A header in Headstars: a head jumps and heads the ball towards the goal"), h2: "Head it, shoot it, slide in",
          html: `<p>Two players, one ball, two goals. How the ball flies depends on the moment you hit it: a ball at rest goes up in an arc, a ball at head height flies low, and in the air you hit a volley.</p>
<p>On the ground you slide tackle, in the air you come down with a ground pound, and the higher you are, the harder it lands. Get the timing right and you head the ball straight out of the air into the goal.</p>` },
        { id: "heads", media: pic("heads-group", "heads", `All ${n.heads} heads from Headstars side by side`, { cls: "lp-cutout" }), h2: `${n.heads} heads, each with its own special shot`,
          html: `<p>Every head plays differently: faster, jumping higher or shooting harder. Once your super meter is full, you unleash its special shot.</p>`, after: headChips(), wide: true },
        { id: "supers", media: pic("scene-super", "scene", "A special shot flies across the pitch in Headstars"), h2: "Special shots and power-ups",
          html: `<p>Fireball, Ice Shot, Thunderbolt: one special shot can turn a match around. On top of that, ${n.pus} different power-ups appear on the pitch, such as ${pu[0]}, ${pu[1]} or ${pu[2]}.</p>
<p>In quick matches and against friends you decide whether and how often power-ups appear and whether special shots are allowed.</p>` },
        { id: "arenas", wide: true, media: arenaMosaic(), h2: `${n.arenas} arenas with their own physics`,
          html: `<p>You slide around the ${esc(L["arena.eis.name"])}, jump sky-high on the ${esc(L["arena.mond.name"])}, and on the ${esc(L["arena.strand.name"])} the sand slows the ball down. ${n.start} arenas are there from the start, you unlock ${n.byLevel} through your level, and ${n.bySeason} more come with the seasons.</p>` },
        { panel: true, id: "modes", h2: "Game modes", html: modes() },
        { id: "friends", media: pic("scene-goal-en", "scene", "Goal celebration in Headstars after a goal"), h2: "Two players or online with friends",
          html: `<p>Sitting next to each other? Pick “${esc(L["mode.local.name"])}” and play on one device: on one keyboard, with two controllers or on a split touchscreen.</p>
<p>Not in the same place? A link is all it takes: create a room, send the link, kick off. <a href="${path("friends")}">How to play online with friends</a>.</p>` },
        { panel: true, id: "controls", h2: "Controls", html: `${controls()}
<p>Tap jump for half height, hold it to jump fully. When two of you share a keyboard, player 2 uses ${kbd("←")}${kbd("→")} to run, ${kbd("↑")} to jump, ${kbd("↓")} to slide, ${kbd("Enter")} to shoot and ${kbd(".")} for the special shot. On a phone, play in landscape.</p>` },
      ],
      faq: [
        ["Is Headstars free?", `Yes. Headstars costs nothing. You earn coins and gems for new heads, balls and arenas by playing.${PAYMENTS ? " Some content can optionally be bought." : " There are no real-money purchases."}`],
        ["Do I need to install anything or create an account?", "No. Headstars runs in your browser. On first start the game creates a guest account, with no email and no password. If you want to save your progress or keep playing on another device, link the account to your email address. Ranked and the leaderboards require that."],
        ["Does Headstars work on my phone?", "Yes. On phones and tablets you play with touch controls, best in landscape. If your browser offers it, you can install Headstars like an app (Settings → Install app)."],
        ["Can I play with a controller?", "Yes. The button layout is in the table under “Controls”. When two of you play on one device, each player can use their own controller."],
        ["How do I play against friends?", `Create a room, send the link, kick off. Step by step: <a href="${path("friends")}">Play soccer with friends online</a>.`],
      ],
    }) },
    friends: { path: "/en/play-with-friends/", src: "seo-en-friends", build: ({ esc, pic, path, steps, len, lock }) => ({
      title: "Play Soccer with Friends Online via Link | Headstars",
      desc: "Play soccer online with friends via link: create a room, send the link, kick off. 1v1 in the browser on phone, tablet and PC, free and without sign-up.",
      h1: "Play soccer with friends online – just send a link",
      lead: "Send your friend a link, they tap it, and you play. No download, no sign-up, no app, even from your phone against a PC.",
      sections: [
        { panel: true, id: "how", h2: "Three steps to kick-off", html: steps([
          ["Create a room", `Tap “Play now”. Under “${esc(L["html.home.modus"])}” pick “${esc(L["mode.online.name"])}”, tap “${esc(L["html.home.spielen"])}” and then “${esc(L["html.online.raumErstellen"])}”.`],
          ["Send the link", "You get a link, a QR code and a four-character room code. Send the link through your messenger, or let your friend scan the QR code."],
          ["Kick off", "Your friend opens the link and lands right in your lobby. Each of you picks a head, you choose the arena and rules, and you kick off."],
        ], ["Headstars online menu with the “Create room” button", "Lobby with room code, QR code and “Share link” button", "Lobby after the friend joined through the link"]) },
        { id: "need", media: pic("scene-head", "scene", "Online match in Headstars: a header in front of the goal"), h2: "What you need",
          html: `<ul class="lp-list"><li>a current browser on a phone, tablet or PC,</li><li>an internet connection. The game connects your devices directly; if your network does not allow that, the connection runs through a relay server,</li><li>no account, no app and no money.</li></ul>` },
        { id: "rules", media: pic("scene-super", "scene", "A special shot in a match with custom rules"), h2: "Your rules",
          html: `<p>As the host, you decide how you play: arena, obstacles, match length (${len} or first to ${esc(L["rule.len.opt.3"])} or ${esc(L["rule.len.opt.4"])}), speed, shot power, bounce, ball, goal and field size, gravity, power-ups and special shots.</p><p>After the final whistle, go straight into a rematch.</p>` },
        { id: "two", media: pic("scene-goal-en", "scene", "Goal celebration after a goal in Headstars"), h2: "Two players on one device",
          html: `<p>Sitting next to each other? Then you don't need a link: like in classic head soccer games, you can share one device. Pick “${esc(L["mode.local.name"])}” and play on one keyboard, with two controllers or on a split touchscreen.</p><p>All modes, heads and controls: <a href="${path("main")}">Play header soccer online</a>.</p>` },
      ],
      faq: [
        ["Does my friend need to sign up or install anything?", "No. They open the link in their browser and they are in your lobby."],
        ["Can I play from my phone against someone on a PC?", "Yes. Headstars runs in the browser on every device, and you meet in the same lobby."],
        ["What if the link doesn't arrive?", `Your friend also picks “${esc(L["mode.online.name"])}” in the game and enters the four-character room code under “${esc(L["html.online.codeVonDeinemKumpel"])}”.`],
        ["What happens if the connection drops?", "The game pauses and waits briefly for the other side. If it comes back, you continue right where you left off."],
        ["Can I play against strangers too?", `Yes, in ${esc(L["mode.casual.name"])} (${esc(lock("casual"))}) and ${esc(L["mode.ranked.name"])} (${esc(lock("ranked"))}). More under <a href="${path("main")}">game modes</a>.`],
        ["Does playing online cost anything?", "No. Headstars is free, online too."],
      ],
    }) },
  },
};
