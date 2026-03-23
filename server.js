const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const basicAuth = require('express-basic-auth');

const app = express();
const PORT = 3000;

// Настройка Basic Auth
app.use(basicAuth({
    users: { 'admin': process.env.SITE_PASSWORD || 'default_password' }, // логин admin, пароль из переменной окружения
    challenge: true,           // посылать заголовок WWW-Authenticate
    realm: 'Restricted Area'   // текст в диалоге
}));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

const PROGRESS_FILE = path.join(__dirname, 'progress.json');

app.get('/api/products', (req, res) => {
    const jsonPath = path.join(__dirname, 'products_with_local.json');
    if (!fs.existsSync(jsonPath)) {
        return res.status(404).json({ error: 'Файл products_with_local.json не найден' });
    }
    const data = fs.readFileSync(jsonPath, 'utf8');
    res.json(JSON.parse(data));
});

app.get('/api/progress', (req, res) => {
    if (fs.existsSync(PROGRESS_FILE)) {
        const data = fs.readFileSync(PROGRESS_FILE, 'utf8');
        res.json(JSON.parse(data));
    } else {
        res.json({ selected: [], lastIndex: -1 });
    }
});

app.post('/api/progress', (req, res) => {
    const { selected, lastIndex } = req.body;
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ selected, lastIndex }, null, 2));
    console.log(`Сохранён прогресс: lastIndex=${lastIndex}, selected=${selected.length}`);
    res.json({ success: true });
});

app.delete('/api/progress', (req, res) => {
    if (fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE);
    res.json({ success: true });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Сервер запущен: http://0.0.0.0:${PORT}`);
});