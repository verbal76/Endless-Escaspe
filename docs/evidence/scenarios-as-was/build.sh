#!/bin/bash
# Sync repo sources into the scratch web copy, inject a debug hook, export.
set -e
SP=/tmp/claude-0/-home-user-Endless-Escaspe/d935e693-20a2-579b-b7e9-e8d120e5906c/scratchpad
REPO=/home/user/Endless-Escaspe
cd $SP/web
rm -rf src assets App.tsx index.ts app.json
cp -r $REPO/src $REPO/assets $REPO/App.tsx $REPO/index.ts $REPO/app.json .
python3 - <<'PY'
p='src/game/Game.tsx'
s=open(p).read()
anchor='    loopRef.current = startLoop({'
assert anchor in s
hook='''    (globalThis as any).__ee = {
      input, useStore, player, THREE,
      get scene() { return scene; },
      handleCatch, handleWin, noiseRing, crowbarMarker, projectiles, update, render,
      get renderer() { return r; },
    };
'''
s=s.replace(anchor, hook+anchor)
open(p,'w').write(s)
PY
rm -rf dist
CI=1 npx expo export --platform web --output-dir dist >/tmp/export.log 2>&1 || { tail -30 /tmp/export.log; exit 1; }
echo built
