// Android / iOS: the desktop layer does not exist. Metro picks this file instead of DesktopLayer.tsx, so
// none of the desktop code (input adapter, glyphs, overlay) is part of the Android bundle.
export function DesktopLayer() {
  return null;
}
