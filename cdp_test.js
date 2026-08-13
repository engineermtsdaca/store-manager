const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchDebuggerUrl() {
    return new Promise((resolve, reject) => {
        const req = http.get('http://127.0.0.1:9222/json/version', (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json.webSocketDebuggerUrl);
                } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
    });
}

class CDPClient {
    constructor(url) {
        this.ws = new WebSocket(url);
        this.msgId = 0;
        this.callbacks = new Map();
        this.events = new Map();

        this.ws.on('message', (data) => {
            const msg = JSON.parse(data);
            if (msg.id !== undefined && this.callbacks.has(msg.id)) {
                this.callbacks.get(msg.id)(msg.result);
                this.callbacks.delete(msg.id);
            }
            if (msg.method && this.events.has(msg.method)) {
                this.events.get(msg.method).forEach(cb => cb(msg.params));
            }
        });
    }

    on(method, cb) {
        if (!this.events.has(method)) this.events.set(method, []);
        this.events.get(method).push(cb);
    }

    async waitReady() {
        return new Promise(resolve => {
            if (this.ws.readyState === WebSocket.OPEN) resolve();
            else this.ws.on('open', resolve);
        });
    }

    async send(method, params = {}) {
        const id = ++this.msgId;
        return new Promise((resolve, reject) => {
            this.callbacks.set(id, resolve);
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    async evaluate(expression) {
        const res = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        return res;
    }

    async takeScreenshot(filename) {
        const res = await this.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(filename, Buffer.from(res.data, 'base64'));
    }
}

async function run() {
    console.log('Launching Edge...');
    const browser = spawn(edgePath, [
        '--remote-debugging-port=9222',
        '--headless=new',
        '--window-size=1280,800',
        '--disable-gpu'
    ]);

    // Give it a second to start
    await sleep(2000);

    let wsUrl;
    try {
        wsUrl = await fetchDebuggerUrl();
    } catch (e) {
        console.log('Error fetching debugger URL. Is Edge running?', e);
        browser.kill();
        return;
    }

    console.log('Connected to Edge. Debugger URL:', wsUrl);
    const client = new CDPClient(wsUrl);
    await client.waitReady();

    // Create a new target/page
    const target = await client.send('Target.createTarget', { url: 'about:blank' });
    const targetWsUrl = wsUrl.replace('browser', 'page') + target.targetId;
    
    // We actually need the websocket URL for the specific page. Let's get /json/list
    const pages = await new Promise(resolve => {
        http.get('http://127.0.0.1:9222/json/list', res => {
            let d = '';
            res.on('data', c => d+=c);
            res.on('end', () => resolve(JSON.parse(d)));
        });
    });
    
    const pageTarget = pages.find(p => p.type === 'page');
    const pageClient = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await pageClient.waitReady();

    await pageClient.send('Page.enable');
    await pageClient.send('Runtime.enable');

    console.log('Navigating to login...');
    await pageClient.send('Page.navigate', { url: 'http://localhost:3000' });
    
    // wait for load
    await new Promise(r => pageClient.on('Page.loadEventFired', r));
    await sleep(2000);

    console.log('Logging in...');
    await pageClient.evaluate(`
        (function() {
            const user = document.querySelector('input[name="username"]') || document.querySelector('input[type="text"]');
            const pass = document.querySelector('input[name="password"]') || document.querySelector('input[type="password"]');
            if (user && pass) {
                user.value = 'sm1';
                user.dispatchEvent(new Event('input', { bubbles: true }));
                pass.value = '123456';
                pass.dispatchEvent(new Event('input', { bubbles: true }));
                const btn = document.querySelector('button[type="submit"]');
                if (btn) btn.click();
            }
        })();
    `);

    // wait for login redirect
    await sleep(3000);
    console.log('Navigating to Purchase Orders...');
    await pageClient.send('Page.navigate', { url: 'http://localhost:3000/purchase-orders' }); // fallback
    await sleep(3000); // wait for data load

    // If purchase-orders wasn't the right URL, let's try to click a link on the dashboard
    await pageClient.evaluate(`
        (function() {
            const links = Array.from(document.querySelectorAll('a'));
            const poLink = links.find(a => a.textContent.toLowerCase().includes('purchase order'));
            if (poLink) poLink.click();
        })();
    `);
    await sleep(3000);

    console.log('Taking before screenshot...');
    await pageClient.takeScreenshot('before_approval.png');

    console.log('Clicking approve...');
    const result = await pageClient.evaluate(`
        (async function() {
            const buttons = Array.from(document.querySelectorAll('button'));
            const approveBtn = buttons.find(b => b.textContent.trim().toLowerCase() === 'approve');
            if (approveBtn) {
                approveBtn.click();
                return 'Clicked';
            }
            return 'Not found';
        })();
    `);
    console.log('Approval click result:', result?.result?.value);

    console.log('Waiting for network update...');
    await sleep(2000);

    console.log('Taking after screenshot...');
    await pageClient.takeScreenshot('after_approval.png');

    console.log('Done!');
    browser.kill();
    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
