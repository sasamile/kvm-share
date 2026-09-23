const { screen: electronScreen } = require('electron');

/**
 * Cursor nativo rápido (SetCursorPos / CGWarp).
 * nut-js tarda ~15ms por setPosition → se atasca el control remoto.
 */

let impl = null;

function createWin32() {
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  const POINT = koffi.struct('POINT', { x: 'long', y: 'long' });
  const SetCursorPos = user32.func('bool SetCursorPos(int x, int y)');
  const GetCursorPos = user32.func('bool GetCursorPos(_Out_ POINT *lpPoint)');
  const GetSystemMetrics = user32.func('int GetSystemMetrics(int nIndex)');

  const SM_XVIRTUALSCREEN = 76;
  const SM_YVIRTUALSCREEN = 77;
  const SM_CXVIRTUALSCREEN = 78;
  const SM_CYVIRTUALSCREEN = 79;

  return {
    getPosition() {
      const pt = {};
      GetCursorPos(pt);
      return { x: pt.x, y: pt.y };
    },
    setPosition(x, y) {
      SetCursorPos(Math.round(x), Math.round(y));
    },
    virtualBounds() {
      const minX = GetSystemMetrics(SM_XVIRTUALSCREEN);
      const minY = GetSystemMetrics(SM_YVIRTUALSCREEN);
      const width = GetSystemMetrics(SM_CXVIRTUALSCREEN);
      const height = GetSystemMetrics(SM_CYVIRTUALSCREEN);
      return {
        minX,
        minY,
        maxX: minX + width,
        maxY: minY + height,
        width,
        height,
      };
    },
  };
}

function createDarwin() {
  const koffi = require('koffi');
  const cg = koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics');
  const CGPoint = koffi.struct('CGPoint', { x: 'double', y: 'double' });
  const CGWarpMouseCursorPosition = cg.func('int CGWarpMouseCursorPosition(CGPoint point)');
  const CGEventCreate = cg.func('void *CGEventCreate(void *source)');
  const CGEventGetLocation = cg.func('CGPoint CGEventGetLocation(void *event)');
  const CFRelease = koffi.load('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation')
    .func('void CFRelease(void *cf)');

  // Bounds en puntos (misma unidad que Electron / CGWarp).
  function electronVirtualBounds() {
    const displays = electronScreen.getAllDisplays();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const d of displays) {
      const b = d.bounds;
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    }
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  return {
    getPosition() {
      const event = CGEventCreate(null);
      if (!event) return { x: 0, y: 0 };
      const loc = CGEventGetLocation(event);
      CFRelease(event);
      return { x: loc.x, y: loc.y };
    },
    setPosition(x, y) {
      // Solo warp. NO llamar CGAssociate en cada frame: pelea con el cursor y lo “bloquea”.
      CGWarpMouseCursorPosition({ x: Number(x), y: Number(y) });
    },
    virtualBounds: electronVirtualBounds,
  };
}

function createElectronFallback() {
  const { mouse, Point } = require('@nut-tree-fork/nut-js');
  mouse.config.autoDelayMs = 0;

  function electronVirtualBounds() {
    const displays = electronScreen.getAllDisplays();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const d of displays) {
      const b = d.bounds;
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    }
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  return {
    getPosition() {
      // Sync-ish via deasync not available; return last known — edge uses async wrapper.
      return null;
    },
    setPosition(x, y) {
      mouse.setPosition(new Point(Math.round(x), Math.round(y))).catch(() => {});
    },
    virtualBounds: electronVirtualBounds,
    asyncGetPosition: () => mouse.getPosition(),
  };
}

function getImpl() {
  if (impl) return impl;
  try {
    if (process.platform === 'win32') impl = createWin32();
    else if (process.platform === 'darwin') impl = createDarwin();
    else impl = createElectronFallback();
  } catch (err) {
    console.error('[native-mouse] fallback a nut-js:', err.message);
    impl = createElectronFallback();
  }
  return impl;
}

function getPosition() {
  return getImpl().getPosition();
}

function setPosition(x, y) {
  getImpl().setPosition(x, y);
}

function virtualBounds() {
  return getImpl().virtualBounds();
}

/** Bounds del overlay de Electron (DIP), para posicionar BrowserWindow. */
function electronOverlayBounds() {
  const displays = electronScreen.getAllDisplays();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const d of displays) {
    const b = d.bounds;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: Math.round((minX + maxX) / 2),
    centerY: Math.round((minY + maxY) / 2),
  };
}

module.exports = {
  getPosition,
  setPosition,
  virtualBounds,
  electronOverlayBounds,
};
