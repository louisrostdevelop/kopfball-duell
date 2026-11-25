// Infoseiten auf Spanisch (Lateinamerika, tú/ustedes): Pfade, Oberfläche und Seitentexte (Aufbau und Bausteine: tools/gen-seo.mjs,
// Liste: tools/seo/langs.mjs). Wortwahl wie im Spiel (balón, portería, cancha, celular); „cabezones“ nur beschreibend.
import L from "../../js/content/i18n/es.js";

export default {
  lang: "es", L, locale: "es_419",
  /** Name im Sprachumschalter der anderen Sprachen, Tooltip dazu */
  name: "Español", thisPage: "Esta página en español",
  /** Aufnahmen (tools/gen-landing-media.mjs): Browser-Sprache, Namen in der Einladungs-Lobby */
  media: { locale: "es-MX", host: "Sofi", guest: "Mateo" },
  ui: { play: "Jugar ahora", facts: ["Gratis", "Sin descargas", "Sin registro"], faq: "Preguntas frecuentes",
    legal: ["Aviso legal", "Privacidad", "Términos"], main: "Sobre el juego", friends: "Jugar con amigos", langs: "Idiomas",
    ctaNote: "Arranca directo en el navegador, en celular, tablet y PC.",
    video: "Partido de Headstars: dos cabezones juegan fútbol de cabeza en el estadio", online: "Online", offline: "Contra la máquina o de a dos",
    endTitle: "¿Listo para el pitazo inicial?", action: "Acción" },
  pages: {
    main: { path: "/es/", src: "seo-es", build: ({ esc, pic, kbd, n, pu, path, modes, headChips, arenaMosaic, controls, PAYMENTS }) => ({
      title: "Fútbol de cabezones online – juego gratis 1 vs 1 | Headstars",
      desc: "Juego de cabezones en el navegador: 1 vs 1 contra la máquina, rivales de todo el mundo o tus amigos con un link. Gratis, sin descargas y sin registro.",
      h1: "Fútbol de cabezones online",
      lead: "Partidos uno contra uno con cabezas gigantes: corre, salta, cabecea y dispara. Contra la máquina, contra gente de todo el mundo o contra tus amigos, directo en el navegador.",
      sections: [
        { id: "jugar", media: pic("scene-head", "scene", "Cabezazo en Headstars: un cabezón salta y cabecea el balón hacia la portería"), h2: "Cabecea, dispara y bárrete",
          html: `<p>Un juego de cabezones como tiene que ser: dos jugadores, un balón y dos porterías. Cómo sale el tiro depende del momento en que le pegas: con el balón quieto sale bombeado, a la altura de la cabeza va raso, y en el aire le pegas de volea.</p>
<p>En el piso te barres, en el aire caes en bomba, y cuanto más alto saltas, más fuerte es el golpe. Si calculas bien el salto, cabeceas el balón en pleno vuelo y directo a la portería.</p>` },
        { id: "cabezones", media: pic("heads-group", "heads", `Los ${n.heads} cabezones de Headstars uno al lado del otro`, { cls: "lp-cutout" }), h2: `${n.heads} cabezones, cada uno con su tiro especial`,
          html: `<p>Cada cabeza juega distinto: una es más rápida, otra salta más alto, otra le pega con más fuerza. Cuando se llena tu barra de súper, sueltas su tiro especial.</p>`, after: headChips(), wide: true },
        { id: "tiros-especiales", media: pic("scene-super", "scene", "Un tiro especial cruza la cancha en Headstars"), h2: "Tiros especiales y power-ups",
          html: `<p>${esc(L["super.fire.name"])}, ${esc(L["super.ice.name"])}, ${esc(L["super.thunder.name"])}: un tiro especial puede cambiar todo el partido. Además aparecen en la cancha ${n.pus} power-ups distintos, como ${pu[0]}, ${pu[1]} o ${pu[2]}.</p>
<p>En ${esc(L["mode.quick.name"])} y contra amigos decides tú si salen power-ups, cada cuánto, y si se permiten los tiros especiales.</p>` },
        { id: "arenas", wide: true, media: arenaMosaic(), h2: `${n.arenas} arenas con su propia física`,
          html: `<p>En la ${esc(L["arena.eis.name"])} te resbalas, en la ${esc(L["arena.mond.name"])} saltas altísimo y en la ${esc(L["arena.strand.name"])} la arena frena el balón. ${n.start} arenas vienen desbloqueadas, ${n.byLevel} las desbloqueas subiendo de nivel y ${n.bySeason} más llegan con las temporadas.</p>` },
        { panel: true, id: "modos", h2: "Modos de juego", html: modes() },
        { id: "dos-jugadores", media: pic("scene-goal-es", "scene", "Festejo de gol en Headstars"), h2: "Para 2 jugadores o con amigos online",
          html: `<p>¿Están juntos? Elijan “${esc(L["mode.local.name"])}” y jueguen en un solo dispositivo: en el mismo teclado, con dos controles o en la pantalla táctil dividida a la mitad. El clásico juego de fútbol para dos, sin instalar nada.</p>
<p>¿Cada uno en su casa? Basta con un link: crea una sala, manda el link y a jugar. <a href="${path("friends")}">Cómo jugar con amigos online</a>.</p>` },
        { panel: true, id: "controles", h2: "Controles", html: `${controls()}
<p>Un toque corto en salto: medio salto; mantenlo presionado: salto completo. Si juegan dos en un teclado, el jugador 2 usa ${kbd("←")}${kbd("→")} para correr, ${kbd("↑")} para saltar, ${kbd("↓")} para barrerse, ${kbd("Enter")} para disparar y ${kbd(".")} para el tiro especial. En el celular, juega con la pantalla en horizontal.</p>` },
      ],
      faq: [
        ["¿Headstars es gratis?", `Sí. Headstars no cuesta nada. Las monedas y gemas para nuevas cabezas, balones y arenas las ganas jugando.${PAYMENTS ? " Algunos contenidos se pueden comprar, si quieres." : " No hay compras con dinero real."}`],
        ["¿Tengo que descargar algo o crear una cuenta?", `No. Headstars funciona en el navegador. La primera vez, el juego te crea una cuenta de invitado, sin correo y sin contraseña. Si quieres guardar tu progreso o seguir jugando en otro dispositivo, vincula la cuenta con tu correo. Para ${esc(L["mode.ranked.name"])} y las clasificaciones es obligatorio.`],
        ["¿Se puede jugar en el celular?", `Sí. En celular y tablet juegas con controles táctiles, mejor con la pantalla en horizontal. Si tu navegador lo ofrece, puedes instalar Headstars como app (${esc(L["html.settings.einstellungen"])} → ${esc(L["install.title"])}).`],
        ["¿Puedo jugar con control?", "Sí. Los botones están en la tabla de “Controles”. Si juegan dos en un mismo dispositivo, cada uno puede usar su propio control."],
        ["¿Es un juego de fútbol para 2 jugadores?", `Sí. En “${esc(L["mode.local.name"])}” juegan dos personas en el mismo dispositivo. Online juegas contra un amigo o contra rivales de todo el mundo, cada uno desde su dispositivo.`],
        ["¿Cómo juego con mis amigos?", `Crea una sala, manda el link y a jugar. Paso a paso: <a href="${path("friends")}">Jugar fútbol online con amigos</a>.`],
      ],
    }) },
    friends: { path: "/es/jugar-con-amigos/", src: "seo-es-amigos", build: ({ esc, pic, path, steps, len, lock }) => ({
      title: "Fútbol online con amigos: juega por link, sin registro | Headstars",
      desc: "Fútbol de cabezones online con tus amigos: crea una sala, manda el link y a jugar. 1 vs 1 en el navegador del celular o la PC, gratis y sin registro.",
      h1: "Juega fútbol online con tus amigos, solo con un link",
      lead: "Le mandas un link a tu amigo, lo abre y ya están jugando. Sin descargas, sin registro y sin app, incluso del celular contra la PC.",
      sections: [
        { panel: true, id: "como-se-juega", h2: "Tres pasos y a jugar", html: steps([
          ["Crea una sala", `Toca “Jugar ahora”. En “${esc(L["html.home.modus"])}” elige “${esc(L["mode.online.name"])}”, toca “${esc(L["html.home.spielen"])}” y después “${esc(L["html.online.raumErstellen"])}”.`],
          ["Manda el link", "Te aparecen un link, un código QR y un código de sala de cuatro caracteres. Manda el link por WhatsApp o por cualquier app de mensajes, o deja que tu amigo escanee el QR."],
          ["A jugar", "Tu amigo abre el link y entra directo a tu sala. Cada uno elige su cabeza, tú eliges la arena y las reglas, y arranca el partido."],
        ], [`Menú online de Headstars con el botón “${L["html.online.raumErstellen"]}”`, "Sala con código, código QR y botón para compartir el link", "Sala después de que el amigo entró con el link"]) },
        { id: "que-necesitas", media: pic("scene-head", "scene", "Partido online en Headstars: cabezazo frente a la portería"), h2: "Qué necesitan",
          html: `<ul class="lp-list"><li>un navegador actualizado en celular, tablet o PC,</li><li>conexión a internet. El juego conecta sus dispositivos directamente; si la red no lo permite, la conexión pasa por un servidor intermedio (relay),</li><li>nada de cuenta, nada de app y nada de dinero.</li></ul>` },
        { id: "reglas", media: pic("scene-super", "scene", "Un tiro especial en un partido con reglas propias"), h2: "Ustedes ponen las reglas",
          html: `<p>Quien crea la sala decide cómo se juega: arena, obstáculos, duración (${len} o a ${esc(L["rule.len.opt.3"])} o ${esc(L["rule.len.opt.4"])}), velocidad, fuerza del tiro, rebote, tamaño del balón, de la portería y de la cancha, gravedad, power-ups y tiros especiales.</p><p>Al terminar el partido, la revancha arranca ahí mismo.</p>` },
        { id: "dos-jugadores", media: pic("scene-goal-es", "scene", "Festejo de gol en Headstars"), h2: "Dos jugadores en un mismo dispositivo",
          html: `<p>¿Están uno al lado del otro? Entonces no necesitan link: elijan “${esc(L["mode.local.name"])}” y jueguen en el mismo teclado, con dos controles o en la pantalla táctil dividida.</p><p>Todos los modos, cabezas y controles: <a href="${path("main")}">Fútbol de cabezones online</a>.</p>` },
      ],
      faq: [
        ["¿Mi amigo tiene que registrarse o instalar algo?", "No. Abre el link en su navegador y ya está en tu sala."],
        ["¿Puedo jugar desde el celular contra alguien en la PC?", "Sí. Headstars funciona en el navegador de cualquier dispositivo, y se encuentran en la misma sala."],
        ["¿Y si el link no le llega?", `Tu amigo también elige “${esc(L["mode.online.name"])}” en el juego y escribe el código de sala de cuatro caracteres en “${esc(L["html.online.codeVonDeinemKumpel"])}”.`],
        ["¿Qué pasa si se corta la conexión?", "El partido se pausa y espera un momento al otro jugador. Si vuelve, siguen justo donde se quedaron."],
        ["¿También puedo jugar contra desconocidos?", `Sí, en ${esc(L["mode.casual.name"])} (${esc(lock("casual"))}) y ${esc(L["mode.ranked.name"])} (${esc(lock("ranked"))}). Más en <a href="${path("main")}">modos de juego</a>.`],
        ["¿Jugar online cuesta algo?", "No. Headstars es gratis, también online."],
      ],
    }) },
  },
};
