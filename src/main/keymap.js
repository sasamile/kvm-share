const { Key } = require('@nut-tree-fork/nut-js');

// Mapea el `code` físico de un KeyboardEvent del DOM a nut-js.
const CODE_TO_KEY = {
  KeyA: Key.A, KeyB: Key.B, KeyC: Key.C, KeyD: Key.D, KeyE: Key.E,
  KeyF: Key.F, KeyG: Key.G, KeyH: Key.H, KeyI: Key.I, KeyJ: Key.J,
  KeyK: Key.K, KeyL: Key.L, KeyM: Key.M, KeyN: Key.N, KeyO: Key.O,
  KeyP: Key.P, KeyQ: Key.Q, KeyR: Key.R, KeyS: Key.S, KeyT: Key.T,
  KeyU: Key.U, KeyV: Key.V, KeyW: Key.W, KeyX: Key.X, KeyY: Key.Y,
  KeyZ: Key.Z,

  Digit0: Key.Num0, Digit1: Key.Num1, Digit2: Key.Num2, Digit3: Key.Num3,
  Digit4: Key.Num4, Digit5: Key.Num5, Digit6: Key.Num6, Digit7: Key.Num7,
  Digit8: Key.Num8, Digit9: Key.Num9,

  F1: Key.F1, F2: Key.F2, F3: Key.F3, F4: Key.F4, F5: Key.F5, F6: Key.F6,
  F7: Key.F7, F8: Key.F8, F9: Key.F9, F10: Key.F10, F11: Key.F11, F12: Key.F12,

  Escape: Key.Escape,
  Tab: Key.Tab,
  CapsLock: Key.CapsLock,
  Space: Key.Space,
  Enter: Key.Return,
  NumpadEnter: Key.Enter,
  Backspace: Key.Backspace,
  Delete: Key.Delete,
  Insert: Key.Insert,
  Home: Key.Home,
  End: Key.End,
  PageUp: Key.PageUp,
  PageDown: Key.PageDown,
  ArrowUp: Key.Up,
  ArrowDown: Key.Down,
  ArrowLeft: Key.Left,
  ArrowRight: Key.Right,
  ContextMenu: Key.Menu,
  PrintScreen: Key.Print,
  ScrollLock: Key.ScrollLock,
  Pause: Key.Pause,
  NumLock: Key.NumLock,

  ShiftLeft: Key.LeftShift, ShiftRight: Key.RightShift,
  ControlLeft: Key.LeftControl, ControlRight: Key.RightControl,
  AltLeft: Key.LeftAlt, AltRight: Key.RightAlt,
  // Cmd (Mac) / tecla Windows
  MetaLeft: Key.LeftSuper, MetaRight: Key.RightSuper,

  Backquote: Key.Grave,
  Minus: Key.Minus,
  Equal: Key.Equal,
  BracketLeft: Key.LeftBracket,
  BracketRight: Key.RightBracket,
  Backslash: Key.Backslash,
  Semicolon: Key.Semicolon,
  Quote: Key.Quote,
  Comma: Key.Comma,
  Period: Key.Period,
  Slash: Key.Slash,

  Numpad0: Key.NumPad0, Numpad1: Key.NumPad1, Numpad2: Key.NumPad2,
  Numpad3: Key.NumPad3, Numpad4: Key.NumPad4, Numpad5: Key.NumPad5,
  Numpad6: Key.NumPad6, Numpad7: Key.NumPad7, Numpad8: Key.NumPad8,
  Numpad9: Key.NumPad9,
  NumpadAdd: Key.Add,
  NumpadSubtract: Key.Subtract,
  NumpadMultiply: Key.Multiply,
  NumpadDivide: Key.Divide,
  NumpadDecimal: Key.Decimal,
  NumpadEqual: Key.NumPadEqual,
};

/**
 * @param {string} code
 * @param {{ ctrlAsMeta?: boolean }} [opts]
 *   ctrlAsMeta: en Mac, Ctrl del teclado Windows → Cmd (copiar/pegar/etc.).
 */
function mapCodeToKey(code, opts = {}) {
  if (opts.ctrlAsMeta) {
    if (code === 'ControlLeft') return Key.LeftSuper;
    if (code === 'ControlRight') return Key.RightSuper;
  }
  return CODE_TO_KEY[code] ?? null;
}

module.exports = { mapCodeToKey };
