
import puppeteer from 'puppeteer';

(async () => {
    try {
        const browser = await puppeteer.launch({
            channel: 'chrome',
            headless: true,
            args: ['--no-sandbox']
        });
        console.log('Successfully launched Chrome!');
        await browser.close();
    } catch(err) {
        console.error('Failed to launch chrome:', err);
    }
})();
