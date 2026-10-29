# Kopfball Duell

Head Soccer im Browser: 1 gegen 1, große Köpfe, 90 Sekunden.

- **Online gegen Kumpel:** „Spiel erstellen“ klicken, Link schicken, fertig. Läuft Peer-to-Peer über WebRTC ([PeerJS](https://peerjs.com/)), ohne Account und ohne eigenen Server.
- **Zu zweit an einem Gerät:** Jeder bekommt seine eigenen Touch-Buttons an einer Seite.
- **Gegen den Computer.**

## Steuerung

| | Laufen | Springen | Schießen |
|---|---|---|---|
| Touch | ◀ ▶ | ▲ | ● |
| Spieler 1 | A / D | W | S oder Leertaste |
| Spieler 2 (lokal) | ← / → | ↑ | ↓ oder Enter |

## Online stellen (GitHub Pages)

Settings → Pages → Source: „Deploy from a branch“, Branch `main`, Ordner `/ (root)` → Save.
Nach ein bis zwei Minuten läuft das Spiel unter `https://<user>.github.io/kopfball-duell/`.

## Wenn die Verbindung nicht klappt

Manche Netze (Schule, Firma, manche Handynetze) blockieren direkte Verbindungen zwischen Browsern. Dann hilft meist ein anderes WLAN oder mobile Daten.

## Technik

Eine einzige `index.html`. Der Gastgeber rechnet die Physik und schickt 30× pro Sekunde den Spielstand, der Gast schickt nur seine Tasten.
