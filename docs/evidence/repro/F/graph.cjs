const ts=require('/home/user/Endless-Escaspe/node_modules/typescript');const path=require('path');const fs=require('fs');
const root='/home/user/Endless-Escaspe';
const cfg=ts.getParsedCommandLineOfConfigFile(root+'/tsconfig.json',{},{...ts.sys,onUnRecoverableConfigFileDiagnostic(){}});
const prog=ts.createProgram(cfg.fileNames,cfg.options);const chk=prog.getTypeChecker();
const files=prog.getSourceFiles().filter(f=>!f.fileName.includes('node_modules'));
const rel=f=>path.relative(root,f);
const edges={};const importedBy={};
for(const sf of files){edges[rel(sf.fileName)]=[];
 ts.forEachChild(sf,function v(n){ if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier){const m=n.moduleSpecifier.text;const r=ts.resolveModuleName(m,sf.fileName,cfg.options,ts.sys).resolvedModule;if(r&&!r.resolvedFileName.includes('node_modules')){const t=rel(r.resolvedFileName);edges[rel(sf.fileName)].push(t);(importedBy[t]=importedBy[t]||[]).push(rel(sf.fileName));}}
 if(ts.isCallExpression(n)&&n.expression.kind===ts.SyntaxKind.ImportKeyword&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0])){const m=n.arguments[0].text;const r=ts.resolveModuleName(m,sf.fileName,cfg.options,ts.sys).resolvedModule;if(r&&!r.resolvedFileName.includes('node_modules')){const t=rel(r.resolvedFileName);edges[rel(sf.fileName)].push(t);(importedBy[t]=importedBy[t]||[]).push(rel(sf.fileName));}} ts.forEachChild(n,v)});}
// reachability from App/index
const reach=(starts)=>{const s=new Set();const st=[...starts];while(st.length){const x=st.pop();if(s.has(x))continue;s.add(x);(edges[x]||[]).forEach(y=>st.push(y));}return s;};
const app=reach(['index.ts','App.tsx']);
const srcFiles=Object.keys(edges).filter(f=>f.startsWith('src/'));
console.log('src files:',srcFiles.length,' reachable from index.ts:',[...app].filter(f=>f.startsWith('src/')).length);
console.log('ORPHANS (src not reachable from app):');srcFiles.filter(f=>!app.has(f)).forEach(f=>console.log('  ',f,' importedBy:',(importedBy[f]||[]).join(',')));
// test coverage: src reachable from tests (direct import)
const testFiles=Object.keys(edges).filter(f=>f.startsWith('tests/'));
const direct=new Set();testFiles.forEach(t=>edges[t].forEach(x=>direct.add(x)));
const trans=reach(testFiles);
console.log('\nsrc files directly imported by tests:',[...direct].filter(f=>f.startsWith('src/')).length,' transitively:',[...trans].filter(f=>f.startsWith('src/')).length);
console.log('NOT loaded by any test (even transitively):');srcFiles.filter(f=>!trans.has(f)).forEach(f=>console.log('  ',f));
console.log('Loaded only transitively (no direct test import):');srcFiles.filter(f=>trans.has(f)&&!direct.has(f)).forEach(f=>console.log('  ',f));
// unused exports: exported symbol in src never referenced in other files
console.log('\nUNUSED EXPORTS (no reference outside own file; tests counted separately):');
for(const sf of files.filter(f=>rel(f.fileName).startsWith('src/'))){const sym=chk.getSymbolAtLocation(sf);if(!sym)continue;
 for(const ex of chk.getExportsOfModule(sym)){let usedApp=false,usedTest=false;
  for(const o of files){if(o===sf)continue;const txt=o.text;if(!txt.includes(ex.name))continue;
   // crude: check identifier refs resolving to ex
   o.forEachChild(function v(n){if(ts.isIdentifier(n)&&n.text===ex.name){let s=chk.getSymbolAtLocation(n);if(s&&s.flags&ts.SymbolFlags.Alias)s=chk.getAliasedSymbol(s);if(s===ex||(s&&s.declarations&&ex.declarations&&s.declarations[0]===ex.declarations[0])){if(rel(o.fileName).startsWith('tests/'))usedTest=true;else usedApp=true;}}ts.forEachChild(n,v)});}
  if(!usedApp){ // used internally?
   let internal=0;sf.forEachChild(function v(n){if(ts.isIdentifier(n)&&n.text===ex.name)internal++;ts.forEachChild(n,v)});
   console.log('  ',rel(sf.fileName),ex.name,usedTest?'(tests only)':'',internal>1?'(used inside file)':'(DEAD)');}
 }}
