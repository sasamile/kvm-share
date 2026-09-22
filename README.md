# kvm-share

Mouse + teclado + portapapeles (texto) compartidos entre Mac y Windows en la misma red
local. Electron + WebSocket (`ws`) + `@nut-tree-fork/nut-js`.

## Cómo funciona

- Una máquina en `listen` (servidor) y la otra en `connect` (cliente a la IP del servidor).
- **Paso por borde:** mueve el mouse al borde configurado (`peerEdge`). Al cruzarlo, el
  control pasa al otro PC y el cursor se ve **allá**.
- Para volver: empuja el mouse al borde de salida en el otro PC, o **Esc** /
  `Control+Alt+K`.
- El portapapeles de texto se sincroniza en ambos sentidos.

## Requisitos

- Node.js 18+ o Bun en ambas máquinas.
- Misma red local; puerto `42420` (por defecto) abierto entre ellas.

## Instalación

```bash
bun install
# o: npm install
```

## Configuración

Se crea `config.json` al primer arranque (está en `.gitignore`).

**Mac (listen)** — si Windows está a su derecha, el borde de vuelta es `left`:

```json
{
  "networkMode": "listen",
  "host": "0.0.0.0",
  "port": 42420,
  "peerHost": "192.168.101.10",
  "peerEdge": "left",
  "controlHotkey": "Control+Alt+K"
}
```

**Windows (connect → IP de la Mac)** — si la Mac está a la derecha de tus monitores:

```json
{
  "networkMode": "connect",
  "host": "0.0.0.0",
  "port": 42420,
  "peerHost": "192.168.101.10",
  "peerEdge": "right",
  "controlHotkey": "Control+Alt+K"
}
```

Ajusta `peerHost` a la IP real de la máquina en `listen`, y `peerEdge` al lado donde
está el otro equipo.

## Ejecutar

```bash
bun run start
```

En la bandeja debe decir **Peer conectado** / **Conectado a…** antes de probar el borde.

## Permisos

- **macOS:** Accesibilidad para Electron (*Privacidad y Seguridad → Accesibilidad*).
  Si XProtect bloquea Electron, vuelve a correr `bun install` / `npm install` (firma ad-hoc
  en `scripts/postinstall.sh`).
- **Windows:** aceptar el Firewall en redes privadas.

## Limitaciones

- Al controlar el otro PC hay un overlay semitransparente local; el cursor “útil” se ve
  en la otra pantalla.
- Portapapeles solo texto; sin cifrado (solo LAN de confianza).
