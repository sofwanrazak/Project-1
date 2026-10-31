const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
// Drives the web build in headless Chromium: onboarding, logging, goals, recap, sample data.
// Run: npx expo export --platform web && npm run e2e
const DIST = path.join(__dirname, '..', 'dist');
const server = http.createServer((req, res) => { let f = path.join(DIST, decodeURIComponent(req.url.split('?')[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, 'index.html'); res.writeHead(200, { 'content-type': ({ '.html': 'text/html', '.js': 'application/javascript', '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon' })[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); }).listen(8096);
let failures = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) failures++; };
const OUT = path.join(__dirname, 'output');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch();
  const mk = async (scheme = 'dark') => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme });
    const p = await ctx.newPage();
    p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && p.errs.push(m.text()));
    p.text = () => p.evaluate(() => document.body.innerText);
    p.vis = (t, nth = 0) => p.getByText(t, { exact: true }).locator('visible=true').nth(nth);
    p.click_ = async (t, o = {}) => { await p.vis(t, o.nth ?? 0).click(); await p.waitForTimeout(o.wait ?? 500); };
    p.tap = async (label, w = 350) => { await p.getByLabel(label, { exact: true }).locator('visible=true').first().click(); await p.waitForTimeout(w); };
    p.shot = (n) => p.screenshot({ path: path.join(OUT, `${n}.png`) });
    return p;
  };

  // ---------- A. onboarding with a real first expense
  let p = await mk();
  await p.goto('http://localhost:8096/'); await p.waitForTimeout(2200);
  let t = await p.text();
  ok(t.includes('Spend with a plan, not a guess.'), 'A1 welcome step');
  await p.shot('01-welcome');
  await p.click_('Get started', { wait: 700 });
  await p.shot('02-goal');
  await p.click_('Stick to a budget', { wait: 900 });
  t = await p.text();
  ok(t.includes('What comes in each month?'), 'A2 goal tap auto-advances to income');
  await p.getByLabel('Monthly income').fill('4500'); await p.waitForTimeout(500);
  t = await p.text();
  ok(t.includes('Your plan') && /RM3\.6k/.test(t) && /RM900/.test(t), 'A3 plan = 80% of RM4,500 -> spend RM3.6k, keep RM900');
  await p.shot('03-income-plan');
  await p.click_('+RM100'); 
  t = await p.text();
  ok(/RM3\.7k/.test(t), 'A4 stepper raises the plan to RM3.7k');
  await p.click_('Use this plan', { wait: 700 });
  await p.getByPlaceholder('Your name').fill('Aiman');
  await p.shot('04-details');
  await p.click_('Continue', { wait: 700 });
  t = await p.text();
  ok(t.includes('Log your first spend'), 'A5 reached first-win step');
  await p.shot('05-first-win');
  await p.getByLabel(/^Log Coffee/).click(); await p.waitForTimeout(1200);
  t = await p.text();
  ok(t.includes('First mark on the tally'), 'A6 celebration after first log');
  await p.shot('06-celebration');
  await p.click_('Show me', { wait: 900 });
  t = await p.text();
  ok(t.includes('Safe to spend today'), 'A7 home shows the daily allowance');
  ok(/RM[\d,]+\.\d\d/.test(t) && t.includes('left this month'), 'A8 allowance and month-left lines render');
  ok(t.includes('day streak') && /\b1\b/.test(t), 'A9 streak is 1');
  ok(t.includes('Get set up') && t.includes('3 of 5') === false && t.includes('2 of 5'), 'A10 checklist shows 2 of 5 (log + budget done)');
  await p.waitForTimeout(800);
  await p.shot('07-home');

  // ---------- B. add with calculator keypad + reward toast
  await p.tap('Add transaction'); await p.waitForTimeout(700);
  for (const k of ['8', '.', '5']) await p.tap(k === '.' ? 'Decimal point' : k, 200);
  await p.tap('Add another amount', 200);
  await p.tap('3', 200);
  ok((await p.getByLabel('Amount 8.5+3').count()) > 0, 'B1 keypad builds 8.5+3');
  await p.tap('Total', 300);
  ok((await p.getByLabel('Amount 11.5').count()) > 0, 'B2 = collapses to 11.5');
  await p.tap('Food & Drink');
  await p.click_('Add expense', { wait: 1000 });
  t = await p.text();
  ok(/Logged\. RM[\d,]+\.\d\d left today/.test(t), 'B3 instant reward toast shows what is left today');
  ok(t.includes('Undo'), 'B4 toast offers undo');
  await p.shot('08-reward-toast');
  await p.click_('Undo', { wait: 700 });

  // ---------- C. goals
  await p.click_('Plan', { nth: 0, wait: 900 });
  await p.click_('Goals', { wait: 700 });
  t = await p.text();
  ok(t.includes('What are you saving for?'), 'C1 goals empty state offers ideas');
  await p.shot('09-goals-empty');
  await p.click_('Umrah', { wait: 800 });
  ok((await p.getByRole('textbox', { name: 'Goal' }).inputValue()) === 'Umrah', 'C2 idea prefills the goal name');
  await p.getByLabel(/How much do you need/).fill('5000');
  await p.click_('Create goal', { wait: 900 });
  t = await p.text();
  ok(t.includes('Umrah') && t.includes('0% · RM5,000.00 to go'), 'C3 goal card appears at 0%');
  await p.click_('Add money', { wait: 800 });
  await p.getByLabel(/Amount/).fill('1300');
  await p.click_('Add to goal', { wait: 900 });
  t = await p.text();
  ok(t.includes('A quarter of the way there for Umrah'), 'C4 crossing 25% shows a milestone toast');
  ok(t.includes('26% · RM3,700.00 to go'), 'C5 jar shows 26%');
  await p.shot('10-goal-card');

  // ---------- D. recap opens and walks all five slides
  await p.goto('http://localhost:8096/recap'); await p.waitForTimeout(1500);
  t = await p.text();
  ok(/You spent|A quiet week/.test(t), 'D1 recap slide 1');
  await p.shot('11-recap-1');
  for (let i = 0; i < 4; i++) { await p.getByLabel('Next').locator('visible=true').first().click(); await p.waitForTimeout(500); }
  t = await p.text();
  ok(t.includes('This week you were') && t.includes('Share my week'), 'D2 final slide shows persona and share');
  await p.shot('12-recap-last');
  ok(p.errs.length === 0, 'A-D no console errors' + (p.errs.length ? ': ' + p.errs.slice(0, 3).join(' | ') : ''));
  await p.context().close();

  // ---------- E. sample-data path
  p = await mk();
  await p.goto('http://localhost:8096/'); await p.waitForTimeout(2200);
  await p.click_('Get started', { wait: 600 });
  await p.click_('Save more', { wait: 900 });
  await p.click_('Skip, I’ll set a budget later', { wait: 700 });
  await p.click_('Continue', { wait: 700 });
  await p.click_('Explore with sample data first', { wait: 1500 });
  t = await p.text();
  ok(t.includes('Sample data loaded'), 'E1 sample celebration');
  await p.click_('Explore', { wait: 1000 });
  await p.waitForTimeout(1500);
  t = await p.text();
  ok(t.includes('You are exploring with sample data.'), 'E2 sample banner');
  ok(t.includes('Tally noticed'), 'E3 insights appear from sample data');
  ok(t.includes('Log again, one tap'), 'E4 one-tap repeat chips appear');
  ok(t.includes('Coming up') && t.includes('Netflix'), 'E5 recurring bills detected');
  ok(t.includes('Spent nothing'), 'E6 no-spend button shown (sample data does not fake a streak)');
  await p.shot('13-home-sample');
  await p.click_('Spent nothing', { wait: 900 });
  t = await p.text();
  ok(t.includes('No spend today, logged on the tally'), 'E7 no-spend confirmed');
  await p.shot('14-home-after-nospend');
  // one-tap log
  const before = (await p.text()).match(/Recent/) ? 1 : 0;
  await p.getByLabel(/^Log .* again$/).first().click(); await p.waitForTimeout(900);
  t = await p.text();
  ok(/Logged/.test(t) && t.includes('Undo'), 'E8 one-tap log shows reward with undo');
  await p.click_('Start fresh', { wait: 900 });
  t = await p.text();
  ok(!t.includes('You are exploring with sample data.'), 'E9 start fresh clears the sample banner');
  void before;
  ok(p.errs.length === 0, 'E no console errors' + (p.errs.length ? ': ' + p.errs.slice(0, 3).join(' | ') : ''));
  await p.context().close();

  // ---------- F. light theme home
  p = await mk('light');
  await p.goto('http://localhost:8096/'); await p.waitForTimeout(2000);
  await p.click_('Get started', { wait: 600 });
  await p.click_('Stick to a budget', { wait: 900 });
  await p.getByLabel('Monthly income').fill('3000'); await p.waitForTimeout(300);
  await p.click_('Use this plan', { wait: 600 });
  await p.click_('Continue', { wait: 600 });
  await p.click_('Explore with sample data first', { wait: 1500 });
  await p.click_('Explore', { wait: 1200 });
  await p.waitForTimeout(1200);
  await p.shot('15-home-light');
  await p.context().close();

  console.log(failures ? `${failures} FAILURE(S)` : 'ALL E2E CHECKS PASSED');
  await b.close(); server.close();
})();
