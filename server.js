const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
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

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', (qr) => { qrcode.generate(qr, { small: true }); });
client.on('ready', () => { console.log('✅ WhatsApp System Ready!'); });

// FIXED API: Handles GET and POST without crashing
app.all('/send-message', async (req, res) => {
    // Optional Chaining (?.) ka use kiya hai taaki req.body undefined hone par code crash na ho
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
            console.log(`🚀 Message sent to ${chatId}`);
            res.status(200).json({ success: true });
        } else {
            console.log("❌ Client not ready yet!");
            res.status(500).json({ error: 'WhatsApp not logged in' });
        }
    } catch (error) {
        console.log("❌ Error sending message:", error.message);
        res.status(500).json({ error: error.message });
    }
});

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

client.initialize();
const PORT = 3000;
server.listen(PORT, () => { console.log(`🚀 Server running on port ${PORT}`); });