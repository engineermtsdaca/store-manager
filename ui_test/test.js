const puppeteer = require('puppeteer-core');
const fs = require('fs');

async function run() {
  const browser = await puppeteer.launch({ 
    headless: 'new',
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  });
  const page = await browser.newPage();
  
  // Set viewport for good screenshots
  await page.setViewport({ width: 1280, height: 800 });
  
  console.log('Navigating to localhost:3000...');
  await page.goto('http://localhost:3000');
  
  console.log('Logging in as sm1...');
  await page.type('input[name="username"]', 'sm1'); // Assuming username input has name="username"
  await page.type('input[name="password"]', '123456');
  // Need to find the submit button, assuming it's a button of type submit
  await page.click('button[type="submit"]');
  
  // Wait for navigation after login
  await page.waitForNavigation({ waitUntil: 'networkidle0' });
  console.log('Logged in.');
  
  console.log('Taking screenshot of Dashboard...');
  await page.screenshot({ path: '1_dashboard.png' });
  
  console.log('Navigating to Purchase Orders...');
  // Find the Purchase Orders link and click it. Wait for the PO table.
  // We can just go directly to the URL if we know it, or find the link text.
  // Assuming the URL might be /purchase-orders or similar, let's just go there.
  // Looking at Next.js structure, maybe it's /purchase-orders.
  // But let's try to find a link with text "Purchase Orders"
  const links = await page.$$('a');
  let poLink = null;
  for (const link of links) {
    const text = await page.evaluate(el => el.textContent, link);
    if (text && text.toLowerCase().includes('purchase order')) {
      poLink = link;
      break;
    }
  }
  
  if (poLink) {
     await poLink.click();
     await page.waitForNavigation({ waitUntil: 'networkidle0' });
  } else {
     // fallback URL
     await page.goto('http://localhost:3000/purchase-orders');
     await page.waitForNavigation({ waitUntil: 'networkidle0' });
  }
  
  console.log('Taking screenshot of Purchase Orders list...');
  await page.screenshot({ path: '2_purchase_orders_before.png' });
  
  console.log('Finding an Approve button...');
  // Look for buttons that say "Approve"
  const buttons = await page.$$('button');
  let approveBtn = null;
  for (const btn of buttons) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.trim() === 'Approve') {
      approveBtn = btn;
      break;
    }
  }
  
  if (approveBtn) {
    console.log('Found Approve button! Clicking it...');
    await approveBtn.click();
    
    // Wait a bit for the UI to update and network request to finish
    await new Promise(r => setTimeout(r, 2000));
    
    console.log('Taking screenshot after Approval...');
    await page.screenshot({ path: '3_purchase_orders_after.png' });
  } else {
    console.log('No Approve buttons found. Maybe there are no pending orders, or the text is different.');
  }

  await browser.close();
  console.log('Done!');
}
run();
