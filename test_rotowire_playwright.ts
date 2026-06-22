import { chromium } from 'playwright';

async function testRotowire() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Spoof user agent to avoid basic blocks
  await page.setExtraHTTPHeaders({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
  });

  console.log('Navigating to Rotowire...');
  await page.goto('https://www.rotowire.com/betting/mlb/player-props.php', { waitUntil: 'networkidle' });

  // Wait for the main props table or rows to load
  console.log('Waiting for table to render...');
  try {
    await page.waitForSelector('.prop-table', { timeout: 10000 });
  } catch (e) {
    console.log('Timeout waiting for .prop-table, maybe different class?');
  }

  // Dump some outer HTML to see the structure
  const bodyHtml = await page.content();
  console.log('Body length:', bodyHtml.length);
  
  // Try to find table rows
  const rows = await page.$$('div[class*="prop-row"]');
  console.log(`Found ${rows.length} prop rows with class prop-row`);
  
  if (rows.length === 0) {
      const tableRows = await page.$$('tr');
      console.log(`Found ${tableRows.length} table rows <tr>`);
  }
  
  await browser.close();
}

testRotowire().catch(console.error);
