// Read-only visual proof of the installed forum, using a fresh browser session.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),puppeteer=require('puppeteer-core');
const origin=process.env.PROOF_ORIGIN||'http://127.0.0.1:3013',out=process.env.PROOF_DIR||'/tmp/arena-forum-proof';
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,pipe:true});
  try {
    const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setViewport({width:1440,height:1050});await page.goto(origin+'/#/community',{waitUntil:'networkidle0'});
    await page.waitForFunction(()=>document.querySelector('.af-feed-cover img')?.naturalWidth>0);
    await page.screenshot({path:path.join(out,'forum-live.png')});
    await page.setViewport({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:path.join(out,'forum-live-mobile.png')});
    await page.setViewport({width:1440,height:1050});await page.goto(origin+'/#/topic/demo-topic-thrones-0',{waitUntil:'networkidle0'});await page.waitForSelector('.af-forum-comment');
    await page.waitForFunction(()=>!document.querySelector('.af-forum-world-card img')||document.querySelector('.af-forum-world-card img').naturalWidth>0);
    await page.screenshot({path:path.join(out,'thread-live.png')});
    await page.setViewport({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:path.join(out,'thread-live-mobile.png')});assert.deepEqual(errors,[]);
    console.log('Desktop and mobile forum screenshots saved. No browser errors.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
