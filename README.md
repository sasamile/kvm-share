# kvm-share

Prototipo de mouse + teclado + portapapeles (solo texto) compartidos entre una Mac y un
PC con Windows en la misma red local. Es la v1 "sencilla" descrita en la conversación:
usa Electron + WebSocket (`ws`) + `@nut-tree-fork/nut-js` para inyectar el input en la
máquina remota.

## Cómo funciona

- Cada máquina corre la misma app. Una se configura en modo `listen` (abre un servidor
  WebSocket y espera) y la otra en modo `connect` (se conecta a la IP de la primera).
- En la máquina que tiene físicamente el mouse/teclado, presionas el atajo configurado
  (por defecto `Control+Alt+K`). Aparece una ventana overlay transparente de pantalla
  completa; haces **clic una vez** para activar el "Pointer Lock" del navegador, y desde
  ahí el mouse y el teclado se capturan y se reenvían por WebSocket a la otra máquina,
  que los inyecta con `nut-js`.
- Para devolver el control presionas **Esc** (el propio navegador libera el Pointer Lock
  y la app lo detecta).
- El portapapeles de texto se sincroniza automáticamente en ambos sentidos (sondeo cada
  700ms).

No usa hooks nativos de bajo nivel (`CGEventTap` / `SetWindowsHookEx`) para "tragarse" el
evento local, así que es más simple de mantener, pero tiene las limitaciones que se listan
más abajo.

## Requisitos

- Node.js 18+ (o Bun, que es lo que se usó para armar este scaffold) en **ambas**
  máquinas.
- Mac y Windows en la misma red local, con el puerto configurado (por defecto `42420`)
  accesible entre ellas.

## Instalación

En cada máquina, dentro de esta carpeta:

```bash
npm install
```

(o `bun install` si tienes Bun instalado).

## Configuración

Al ejecutar la app por primera vez se genera automáticamente `config.json` en la raíz del
proyecto (está en `.gitignore` porque es específico de cada máquina). Edítalo antes de
correr la app, o desde el menú de la bandeja del sistema ("Abrir config.json").

**Máquina A (por ejemplo la Mac, hace de servidor):**

```json
{
  "networkMode": "listen",
  "host": "0.0.0.0",
  "port": 42420,
  "peerHost": "192.168.1.50",
  "controlHotkey": "Control+Alt+K"
}
```

**Máquina B (por ejemplo el PC con Windows, se conecta a la Mac):**

```json
{
  "networkMode": "connect",
  "host": "0.0.0.0",
  "port": 42420,
  "peerHost": "192.168.1.20",
  "controlHotkey": "Control+Alt+K"
}
```

`peerHost` en la máquina que hace `connect` debe ser la IP local de la máquina que hace
`listen`. El campo `controlHotkey` solo importa en la máquina desde la que sueles
controlar; puedes dejarlo igual en ambas.

## Ejecutar

```bash
npm run start
```

Deberías ver un icono nuevo en la bandeja del sistema (menu bar en Mac / system tray en
Windows) con el estado de la conexión.

## Permisos que hay que dar manualmente

- **macOS:** para que `nut-js` pueda mover el mouse e inyectar teclas, la app (o la
  Terminal/Electron desde la que la ejecutes) necesita permiso de **Accesibilidad**:
  *Ajustes del Sistema → Privacidad y Seguridad → Accesibilidad*. La primera vez macOS
  debería pedirlo automáticamente; si no, agrégalo tú a mano.
- **Windows:** la primera vez que corras la app, el Firewall de Windows puede preguntar
  si permites conexiones entrantes — acepta para redes privadas/domésticas.

### macOS: "Software malicioso bloqueado y eliminado" al correr `npm run start`

Esto puede pasar la primera vez, con `Electron.app`. **No es por nuestro código** — es el
binario oficial de Electron (el mismo que usan Slack, VS Code, Discord, etc.), pero la
copia sin firmar que trae la dependencia de desarrollo coincide con la heurística que usa
macOS (XProtect) para detectar malware tipo *Adload*, que suele clonar exactamente esa
plantilla genérica sin firmar para disfrazarse.

Ya está resuelto en este repo: `npm install` corre automáticamente
[`scripts/postinstall.sh`](scripts/postinstall.sh), que:

1. Descarga Electron con su instalador oficial.
2. Si la extracción queda incompleta (`extract-zip`, la librería que usa el paquete
   `electron` por dentro, a veces deja el bundle a medias en este entorno), la rehace con
   el `unzip` del sistema.
3. Firma el `Electron.app` resultante con una **firma ad-hoc** (`codesign --sign -`, sin
   necesitar cuenta de Apple Developer), que es lo que evita el falso positivo de
   XProtect.

Si igual te aparece el aviso la primera vez: vuelve a correr `npm install` (por si la
extracción quedó a medias) y luego `npm run start`. Este paso solo aplica en macOS; en
Windows el script no hace nada.

## Limitaciones conocidas (v1)

- Solo sincroniza **texto** del portapapeles, no imágenes ni archivos.
- No hay cambio automático "al llegar al borde de la pantalla" como Synergy/Barrier: el
  cambio de control es manual, con el atajo + un clic.
- Atajos que el sistema operativo intercepta antes de que lleguen al navegador (p. ej.
  `Cmd+Tab`, `Alt+Tab`, `Ctrl+Alt+Supr`) **no** se pueden capturar ni reenviar con este
  enfoque — para eso haría falta el hook nativo de bajo nivel (`CGEventTap` en Mac,
  `SetWindowsHookEx` en Windows), que es un paso más avanzado.
- La comunicación por WebSocket no está cifrada — pensado para red local de confianza,
  no para exponerlo a internet.
- Solo se probó a nivel de sintaxis/bundling en este entorno (no hay una segunda máquina
  disponible aquí); falta que lo corras en tus dos equipos reales para validar el
  comportamiento end-to-end.

## Próximos pasos posibles

- Cambiar el modelo manual (atajo + clic) por detección de borde de pantalla, usando un
  módulo nativo que sí pueda "tragarse" el evento local (haría falta código nativo
  específico por SO).
- Soporte de múltiples monitores / múltiples máquinas.
- Sincronizar imágenes y archivos del portapapeles.
- Cifrar la conexión (WSS) y agregar un token compartido simple para evitar que cualquier
  dispositivo de la red se conecte.
# kvm-share
