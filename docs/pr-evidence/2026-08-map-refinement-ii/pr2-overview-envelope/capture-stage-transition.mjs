/** stage -> full route must land on the SAME solver result as mount / Fit route. */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const BASE = process.env.APP_URL, OUT = process.env.OUT_DIR;
mkdirSync(OUT, { recursive: true });
const dir = '/tmp/fk-stage'; rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
const proc = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
 ['--remote-debugging-port=9810', `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check',
  '--headless=new', '--force-device-scale-factor=2', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
let b; for (let i=0;i<80&&!b;i++){await new Promise(r=>setTimeout(r,500));try{b=await chromium.connectOverCDP('http://127.0.0.1:9810');}catch{}}
const page = b.contexts()[0].pages()[0];
const errs = []; page.on('console', m=>m.type()==='error'&&errs.push(m.text())); page.on('pageerror', e=>errs.push(String(e)));
const cam = () => page.evaluate(() => {
  const m = window.__fjallkompisMap, c = m.getCenter(), vb = m.getBounds(), mb = m.getMaxBounds();
  return { lng:+c.lng.toFixed(6), lat:+c.lat.toFixed(6), zoom:+m.getZoom().toFixed(4),
           moves: window.__fjallkompisCameraMoves,
           visible: [[+vb.getWest().toFixed(6),+vb.getSouth().toFixed(6)],[+vb.getEast().toFixed(6),+vb.getNorth().toFixed(6)]],
           maxBounds: mb ? [[+mb.getWest().toFixed(6),+mb.getSouth().toFixed(6)],[+mb.getEast().toFixed(6),+mb.getNorth().toFixed(6)]] : null };
});
const out = {};
for (const [W,H] of [[1512,860],[1920,1080]]) {
  await page.goto('about:blank'); await page.setViewportSize({width:W,height:H});
  await page.goto(`${BASE}#/map`, {waitUntil:'domcontentloaded'}); await page.waitForTimeout(1500);
  // The install toast overlays the cockpit and would swallow clicks.
  for (const n of ['Later','Close installation prompt']) {
    const el = page.getByRole('button',{name:n}); if (await el.count()) await el.first().click().catch(()=>{});
  }
  await page.waitForTimeout(600);
  await page.waitForFunction(()=>!!window.__fjallkompisMap,null,{timeout:30000}); await page.waitForTimeout(5000);
  const mount = await cam();

  // Enter stage mode through the app's own scope control, then come back.
  const openScope = async () => {
    await page.locator('.map-scope').first().click();
    await page.waitForTimeout(800);
  };
  await openScope();
  const stageOpts = page.locator('[role="dialog"] button, .sheet button, .map-scope-sheet button');
  const labels = await stageOpts.allTextContents();
  // Pick the first entry that is a stage, not "Full route".
  let picked = null;
  for (let i = 0; i < labels.length; i++) {
    const t = (labels[i] || '').trim();
    if (t && !/full route/i.test(t) && !/close|cancel/i.test(t)) { picked = t; await stageOpts.nth(i).click(); break; }
  }
  await page.waitForTimeout(4000);
  const inStage = await cam();

  await openScope();
  const backOpts = page.locator('[role="dialog"] button, .sheet button, .map-scope-sheet button');
  const bl = await backOpts.allTextContents();
  for (let i = 0; i < bl.length; i++) {
    if (/full route/i.test((bl[i] || '').trim())) { await backOpts.nth(i).click(); break; }
  }
  await page.waitForTimeout(4500);
  const backToRoute = await cam();

  const fitBtn = page.getByRole('button', { name: 'Fit route' });
  if (await fitBtn.count()) await fitBtn.first().click();
  await page.waitForTimeout(3500);
  const afterFit = await cam();

  const same = (a,c) => Math.abs(a.lng-c.lng)<1e-4 && Math.abs(a.lat-c.lat)<1e-4 && Math.abs(a.zoom-c.zoom)<0.01;
  out[`${W}x${H}`] = { mount, inStage, backToRoute, afterFit,
    stageChangedCamera: !same(mount, inStage), pickedStage: picked,
    backMatchesMount: same(mount, backToRoute),
    fitMatchesMount: same(mount, afterFit),
    movesForReturn: backToRoute.moves - inStage.moves,
    consoleErrors: [...errs] };
  errs.length = 0;
}
writeFileSync(join(OUT,'stage-transition.json'), JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out,null,2).slice(0,2600));
await b.close(); proc.kill();
