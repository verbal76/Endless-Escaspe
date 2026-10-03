s=open('s3.mjs').read()
s=s.replace("const click = async (t, opts={}) => { await p.getByText(t, { exact: true }).first().click(opts); await wait(350); };",
"const click = async (t, opts={}) => { try { await p.getByText(t, { exact: true }).first().click({timeout:4000, ...opts}); } catch(e) { console.log('CLICK FAIL', t); } await wait(350); };\nconst key = async (c) => { await p.getByText(c,{exact:true}).last().click({timeout:3000}); };")
s=s.replace("for (const c of 'WWWWWWWWWWWWWWWWWWWWWW') await p.getByText(c,{exact:true}).first().click();","for (const c of 'WWWWWWWWWWWWWWWWWWWWWW') await key(c);")
s=s.replace("for (let i=0;i<22;i++) await p.getByText('⌫',{exact:true}).click();","for (let i=0;i<22;i++) await key('⌫');")
s=s.replace("for (const c of 'KEV') await p.getByText(c,{exact:true}).first().click();","for (const c of 'KEV') await key(c);")
s=s.replace("await p.getByText('×',{exact:true}).first().click();","await click('×');")
s=s.replace("await p.getByText('OUTFITS',{exact:true}).first().click();","await click('OUTFITS');")
open('s3.mjs','w').write(s)
