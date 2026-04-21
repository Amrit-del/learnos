const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode'); // Updated package for Web QR
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// Status variables web page par dikhane ke liye
let qrCodeDataUrl = ''; 
let systemStatus = 'System is starting... Please wait.';

// Memory Optimization args lagaye gaye hain taaki server crash na ho
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', 
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--blink-settings=imagesEnabled=false' // 👈 YEH NAYI LINE ADD KARO (RAM BACHANE KE LIYE)
        ] 
    }
});

// --- WHATSAPP CLIENT EVENTS ---

client.on('qr', async (qr) => { 
    try {
        // QR Code ko image (Data URL) mein convert kar rahe hain web ke liye
        qrCodeDataUrl = await qrcode.toDataURL(qr);
        systemStatus = 'Waiting for QR Scan...';
        console.log('📌 Naya QR Code generate hua hai! Website par check karein.');
    } catch (err) {
        console.error('❌ QR Code generate karne mein error:', err);
    }
});

client.on('loading_screen', (percent, message) => {
    systemStatus = `Chats Loading... ${percent}%`;
    console.log(`⏳ Chat Loading... ${percent}% - ${message}`);
});

client.on('authenticated', () => {
    systemStatus = 'Authenticated! Linking data...';
    console.log('✅ Authentication Successful! Session save ho raha hai...');
});

client.on('ready', () => { 
    systemStatus = '✅ WhatsApp System Fully Ready & Online!';
    qrCodeDataUrl = ''; // Link hone ke baad QR hide kar do
    console.log('🚀 WhatsApp System Fully Ready!'); 
});

client.on('disconnected', (reason) => {
    systemStatus = 'Disconnected. Please restart the server.';
    console.log('❌ Client was logged out or disconnected:', reason);
});

// --- EXPRESS ROUTES ---

// 1. Root Route: QR Code aur Status dekhne ke liye (Auto-refresh every 5 seconds)
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>WhatsApp Bot Status</title>
                <meta http-equiv="refresh" content="5"> <style>
                    body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; background-color: #f4f4f9; }
                    .status { font-size: 24px; font-weight: bold; margin-bottom: 20px; color: #333; }
                    .qr-container { margin-top: 20px; padding: 20px; background: white; display: inline-block; border-radius: 10px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
                </style>
            </head>
            <body>
                <h1>Falcon Express WhatsApp Server</h1>
                <div class="status">${systemStatus}</div>
                ${qrCodeDataUrl ? `<div class="qr-container"><img src="${qrCodeDataUrl}" alt="QR Code" /><p>Scan this QR with your WhatsApp</p></div>` : ''}
            </body>
        </html>
    `);
});

// 2. Send Message API
app.all('/send-message', async (req, res) => {
    const phone = req.body?.phone || req.query.number || req.query.phone || req.body?.number;
    const message = req.body?.message || req.query.message;

    console.log(`📩 Request Received! Phone: ${phone}, Message: ${message}`);

    if (!phone || !message) {
        console.log("⚠️ Missing Phone or Message");
        return res.status(400).json({ error: 'Data missing' });
    }

    let cleanPhone = phone.toString().replace(/\D/g, '');
    const chatId = (cleanPhone.startsWith('91') ? cleanPhone : '91' + cleanPhone) + '@c.us'; 

    try {
        if (client.info && client.info.wid) {
            await client.sendMessage(chatId, message);
            console.log(`🚀 Message sent successfully to ${chatId}`);
            res.status(200).json({ success: true, status: 'Sent' });
        } else {
            console.log("❌ Client not ready yet!");
            res.status(500).json({ error: 'WhatsApp is not connected or still loading.' });
        }
    } catch (error) {
        console.log("❌ Error sending message:", error.message);
        res.status(500).json({ error: error.message });
    }
});

// 3. Payment Hook API
app.post('/api/payment-hook', (req, res) => {
    const { raw_sms } = req.body;
    console.log("📩 SMS Hook Received:", raw_sms);
    const match = raw_sms.match(/(?:rs\.?|inr)\s*([0-9,]+(?:\.[0-9]+)?)/i);
    if (match) {
        let amount = parseFloat(match[1].replace(/,/g, ''));
        io.emit('payment_success_live', { amount: amount, message: 'Payment Received' });
    }
    res.status(200).json({ success: true });
});

// WhatsApp Initialize Start
client.initialize();

// Server Listen Start (Updated for Cloud Hosting)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { 
    console.log(`🌐 Server running online on port ${PORT}`); 
});
