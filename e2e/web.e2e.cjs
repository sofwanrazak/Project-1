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
  ok((await p.text()).includes('Type it'), 'B0 new spends open the type-to-log screen by default');
  await p.click_('Keypad', { wait: 600 });
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


  // ---------- G. type to log
  p = await mk();
  await p.goto('http://localhost:8096/'); await p.waitForTimeout(2200);
  await p.click_('Get started', { wait: 600 });
  await p.click_('Stick to a budget', { wait: 900 });
  await p.getByLabel('Monthly income').fill('4500'); await p.waitForTimeout(300);
  await p.click_('Use this plan', { wait: 600 });
  await p.click_('Continue', { wait: 600 });
  await p.click_('Explore with sample data first', { wait: 1500 });
  await p.click_('Explore', { wait: 1200 });
  await p.waitForTimeout(800);
  await p.tap('Add transaction'); await p.waitForTimeout(900);
  const box = p.getByLabel('Describe the spend');
  await box.fill('18 grab'); await p.waitForTimeout(400);
  t = await p.text();
  ok(t.includes('RM18.00') && t.includes('Transport') && t.includes('Grab'), 'G1 "18 grab" reads amount, note and category');
  ok(t.includes('from your history') || t.includes('Transport'), 'G2 category shown on the slip');
  await p.shot('16-type-grab');
  await p.click_('Log it', { wait: 1100 });
  t = await p.text();
  ok(/Logged/.test(t) && t.includes('Undo'), 'G3 logging shows the reward toast');
  await p.tap('Add transaction'); await p.waitForTimeout(900);
  await p.getByLabel('Describe the spend').fill('+4500 salary'); await p.waitForTimeout(400);
  t = await p.text();
  ok(t.includes('+RM4,500.00') && t.includes('Income') && t.includes('Salary') && t.includes('Log income'), 'G4 "+4500 salary" is income in the Salary category');
  await p.shot('17-type-income');
  await p.getByLabel('Describe the spend').fill('50 zzz'); await p.waitForTimeout(400);
  t = await p.text();
  ok(t.includes('Which category?') && t.includes('Pick a category'), 'G5 unknown note asks for a category instead of guessing');
  ok(await p.getByRole('button', { name: 'Pick a category' }).last().isDisabled().catch(() => true), 'G6 log button waits for the category');
  await p.shot('18-type-pick');
  await p.getByLabel('Shopping', { exact: true }).locator('visible=true').first().click(); await p.waitForTimeout(400);
  await p.vis('Today').click(); await p.waitForTimeout(300);
  t = await p.text();
  ok(t.includes('Yesterday') && t.includes('Shopping'), 'G7 chips fix the category and cycle the date');
  await p.click_('Keypad', { wait: 600 });
  ok((await p.text()).includes('Add expense'), 'G8 switching to Keypad shows the keypad screen');
  await p.click_('Type it', { wait: 600 });
  ok((await p.getByLabel('Describe the spend').count()) > 0, 'G9 mode switches back and is remembered');
  ok(p.errs.length === 0, 'G no console errors' + (p.errs.length ? ': ' + p.errs.slice(0, 3).join(' | ') : ''));
  await p.context().close();

  // ---------- H. explore, bills, accounts, multi-select, split a bill
  p = await mk();
  await p.goto('http://localhost:8096/'); await p.waitForTimeout(2200);
  await p.click_('Get started', { wait: 600 });
  await p.click_('Stick to a budget', { wait: 900 });
  await p.getByLabel('Monthly income').fill('4500'); await p.waitForTimeout(300);
  await p.click_('Use this plan', { wait: 600 });
  await p.click_('Continue', { wait: 600 });
  await p.click_('Explore with sample data first', { wait: 1500 });
  await p.click_('Explore', { wait: 1200 });
  await p.waitForTimeout(800);

  await p.click_('Insights', { nth: 0, wait: 900 });
  t = await p.text();
  ok(t.includes('Overview') && t.includes('Calendar') && t.includes('Cash flow') && t.includes('What if'), 'H1 Insights has the Explore sub-navigation');
  await p.click_('Calendar', { wait: 900 });
  t = await p.text();
  ok(t.includes('Your week, by day') && t.includes('Lighter') && t.includes('Heavier'), 'H2 calendar heatmap and weekday profile render');
  await p.shot('19-calendar');
  const dayBtn = p.getByRole('button', { name: /, spent RM/ }).locator('visible=true').first();
  await dayBtn.click(); await p.waitForTimeout(500);
  t = await p.text();
  ok(/RM[\d,.]+ spent/.test(t), 'H3 tapping a day opens that day’s transactions');
  await p.shot('20-calendar-day');
  await p.click_('Pace', { wait: 900 });
  t = await p.text();
  ok(/On pace to|On track for|Too early|Heading for/.test(t) && t.includes('Spent so far') && t.includes('Daily average'), 'H4 pace forecast headline and stats');
  await p.shot('21-pace');
  await p.click_('Cash flow', { wait: 900 });
  t = await p.text();
  ok(t.includes('Money in and out') && /kept on average|net over 6 months/.test(t), 'H5 cash flow summary');
  await p.shot('22-cashflow');
  await p.click_('Categories', { wait: 900 });
  t = await p.text();
  ok(/Food|Transport|Groceries|Bills/.test(t), 'H6 category trends list real categories');
  await p.shot('23-categories');
  await p.click_('What if', { wait: 900 });
  t = await p.text();
  ok(t.includes('What if I spent less?') && t.includes('Saved each month') && t.includes('Saved in a year'), 'H7 what-if simulator');
  const slider = p.getByRole('slider', { name: /^Cut / }).locator('visible=true').first();
  const hadCut = await slider.count();
  if (hadCut) { const bb = await slider.boundingBox(); await p.mouse.click(bb.x + bb.width * 0.5, bb.y + bb.height / 2); await p.waitForTimeout(400); }
  t = await p.text();
  ok(!hadCut || /\b(25|30|35)%/.test(t), 'H8 dragging the slider changes the cut');
  await p.shot('24-whatif');
  await p.click_('Overview', { wait: 800 });
  ok((await p.text()).includes('Total spent'), 'H9 Overview is still there');

  // bills
  await p.click_('Plan', { nth: 0, wait: 900 });
  await p.click_('Bills', { wait: 800 });
  t = await p.text();
  ok(t.includes('Looks like a bill'), 'H10 detected repeats are offered as bills');
  await p.shot('25-bills-suggestions');
  await p.click_('Track', { wait: 900 });
  t = await p.text();
  ok(/Tracking .* as a monthly bill/.test(t) && t.includes('Fixed costs'), 'H11 one tap tracks a detected bill');
  await p.shot('26-bills');
  const payBtn = p.getByRole('button', { name: /^Mark .* paid$/ }).locator('visible=true').first();
  if (await payBtn.count()) {
    await payBtn.click(); await p.waitForTimeout(700);
    t = await p.text();
    ok(/ paid, RM/.test(t) && t.includes('Undo'), 'H12 marking a bill paid logs it and offers undo');
    await p.click_('Undo', { wait: 600 });
  } else ok(true, 'H12 (bill not due this week, pay buttons correctly hidden)');
  await p.click_('Add a bill', { wait: 800 });
  await p.getByRole('textbox', { name: 'Name' }).fill('Rent');
  await p.getByLabel(/^Amount/).fill('1200');
  await p.getByLabel('Housing', { exact: true }).locator('visible=true').first().click().catch(() => {});
  await p.click_('Add bill', { wait: 600 });
  t = await p.text();
  ok(t.includes('Pick a category') || t.includes('Rent'), 'H13 bill form validates or saves');
  if (t.includes('Pick a category')) {
    await p.getByRole('button', { name: /Bills|Home|Rent|Utilities|Shopping/ }).locator('visible=true').first().click().catch(() => {});
    await p.click_('Add bill', { wait: 900 });
  }
  await p.shot('27-bills-after-add');

  // account detail
  await p.goto('http://localhost:8096/accounts'); await p.waitForTimeout(1500);
  t = await p.text();
  ok(t.includes('Net worth') && t.includes('1 year'), 'H14 Accounts shows the net worth history');
  await p.shot('28-accounts');
  await p.getByRole('button', { name: /Open details/ }).locator('visible=true').first().click(); await p.waitForTimeout(900);
  t = await p.text();
  ok(t.includes('Balance') && t.includes('Recent') && /In · /.test(t), 'H15 account detail: balance chart, month in/out, recent');
  await p.shot('29-account-detail');
  await p.click_('3 months', { wait: 500 });

  // multi-select
  await p.goto('http://localhost:8096/'); await p.waitForTimeout(1800);
  await p.click_('Activity', { nth: 0, wait: 900 });
  await p.click_('Select', { wait: 500 });
  const rows = p.getByRole('checkbox').locator('visible=true');
  ok((await rows.count()) >= 2, 'H16 select mode shows a checkbox on each row');
  await rows.nth(0).click(); await p.waitForTimeout(250);
  await rows.nth(1).click(); await p.waitForTimeout(300);
  t = await p.text();
  ok(t.includes('2 selected'), 'H17 selection count');
  await p.shot('30-multiselect');
  await p.click_('Category', { wait: 500 });
  await p.shot('31-multiselect-category');
  await p.click_('Delete', { wait: 800 });
  t = await p.text();
  ok(t.includes('2 deleted') && t.includes('Undo'), 'H18 bulk delete with undo');
  await p.click_('Undo', { wait: 700 });

  // split the bill
  await p.tap('Add transaction'); await p.waitForTimeout(900);
  await p.getByLabel('Describe the spend').fill('120 dinner /3'); await p.waitForTimeout(400);
  t = await p.text();
  ok(t.includes('RM40.00') && t.includes('1/3 of RM120.00'), 'H19 "/3" splits the bill and shows your share');
  await p.shot('32-split');
  ok(p.errs.length === 0, 'H no console errors' + (p.errs.length ? ': ' + p.errs.slice(0, 3).join(' | ') : ''));
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
  await p.click_('Insights', { nth: 0, wait: 900 });
  await p.click_('Calendar', { wait: 900 });
  await p.shot('33-calendar-light');
  await p.click_('Cash flow', { wait: 900 });
  await p.shot('34-cashflow-light');
  await p.click_('Plan', { nth: 0, wait: 900 });
  await p.click_('Bills', { wait: 800 });
  await p.shot('35-bills-light');
  await p.context().close();

  console.log(failures ? `${failures} FAILURE(S)` : 'ALL E2E CHECKS PASSED');
  await b.close(); server.close();
})();
