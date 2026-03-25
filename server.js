const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const basicAuth = require("express-basic-auth");
const { Mutex } = require("async-mutex");
const progressMutex = new Mutex();

const app = express();
const PORT = 3000;

app.use(
  basicAuth({
    users: { admin: process.env.SITE_PASSWORD || "default_password" },
    challenge: true,
    realm: "Restricted Area",
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const clients = [];
// Endpoint для SSE
app.get("/api/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write("retry: 10000\n\n");

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  clients.push(newClient);
  console.log(`SSE client connected, total: ${clients.length}`);

  req.on("close", () => {
    const index = clients.findIndex((c) => c.id === clientId);
    if (index !== -1) clients.splice(index, 1);
    console.log(`SSE client disconnected, total: ${clients.length}`);
  });
});

function broadcastUpdate() {
  const data = `data: ${JSON.stringify({ type: "progress-updated" })}\n\n`;
  clients.forEach((client) => client.res.write(data));
  console.log(`Broadcasted progress update to ${clients.length} clients`);
}

// Определение части
const splitRoot = path.join(__dirname, "SplitProducts");
let partNumber = process.env.PART_NUMBER || null;

if (!partNumber) {
  try {
    const items = fs.readdirSync(splitRoot, { withFileTypes: true });
    const partDirs = items.filter(
      (dirent) => dirent.isDirectory() && /^part\d+$/.test(dirent.name),
    );
    if (partDirs.length === 1) {
      partNumber = partDirs[0].name.slice(4);
      console.log(
        `Найдена единственная папка: part${partNumber}, используем её.`,
      );
    } else if (partDirs.length > 1) {
      console.warn(
        `Найдено несколько папок part: ${partDirs.map((d) => d.name).join(", ")}. Используйте переменную окружения PART_NUMBER.`,
      );
      partNumber = partDirs[0].name.slice(4);
      console.log(`Используем часть part${partNumber}`);
    } else {
      console.error("В папке SplitProducts не найдено ни одной папки partN");
      process.exit(1);
    }
  } catch (err) {
    console.error("Не удалось прочитать папку SplitProducts:", err.message);
    process.exit(1);
  }
}

const partDir = path.join(splitRoot, `part${partNumber}`);
const jsonFile = path.join(
  partDir,
  `products_with_local_part${partNumber}.json`,
);
const downloadsDir = path.join(partDir, "downloads");

if (!fs.existsSync(jsonFile)) {
  console.error(`Файл JSON не найден: ${jsonFile}`);
  process.exit(1);
}
if (!fs.existsSync(downloadsDir)) {
  console.warn(`Папка downloads не найдена: ${downloadsDir}`);
}

console.log(`Используется часть ${partNumber}`);
console.log(`JSON: ${jsonFile}`);
console.log(`Downloads: ${downloadsDir}`);

// Статика для downloads
app.use("/downloads", express.static(downloadsDir));

// Путь для прогресса
const splitProgressRoot = path.join(__dirname, "SplitProgress");
const progressDir = path.join(splitProgressRoot, `part${partNumber}`);
if (!fs.existsSync(progressDir)) {
  fs.mkdirSync(progressDir, { recursive: true });
}
const PROGRESS_FILE = path.join(progressDir, "progress.json");

app.get("/api/products", (req, res) => {
  if (!fs.existsSync(jsonFile)) {
    return res.status(404).json({
      error: `Файл products_with_local_part${partNumber}.json не найден`,
    });
  }
  const data = fs.readFileSync(jsonFile, "utf8");
  res.json(JSON.parse(data));
});

app.get("/api/progress", (req, res) => {
  let progress = { selected: [], lastIndex: -1 };
  if (fs.existsSync(PROGRESS_FILE)) {
    progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
  }
  // Добавляем номер части в ответ
  progress.partNumber = partNumber;
  res.json(progress);
});

app.post("/api/actions/add", async (req, res) => {
  const { index } = req.body;
  const release = await progressMutex.acquire();
  try {
    let progress = { selected: [], lastIndex: -1 };
    if (fs.existsSync(PROGRESS_FILE)) {
      progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
    }
    if (progress.lastIndex >= index) {
      return res.status(409).json({ error: "Товар уже обработан" });
    }
    const products = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
    if (index >= products.length) {
      return res.status(400).json({ error: "Неверный индекс" });
    }
    const product = products[index];
    const alreadySelected = progress.selected.some(
      (p) => p.productUrl === product.productUrl,
    );
    if (!alreadySelected) {
      progress.selected.push(product);
    }
    progress.lastIndex = index;
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
    res.json({ success: true, progress });
    broadcastUpdate();
  } finally {
    release();
  }
});

app.post("/api/actions/skip", async (req, res) => {
  const { index } = req.body;
  const release = await progressMutex.acquire();
  try {
    let progress = { selected: [], lastIndex: -1 };
    if (fs.existsSync(PROGRESS_FILE)) {
      progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
    }
    if (progress.lastIndex >= index) {
      return res.status(409).json({ error: "Товар уже обработан" });
    }
    progress.lastIndex = index;
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
    res.json({ success: true, progress });
    broadcastUpdate();
  } finally {
    release();
  }
});

app.delete("/api/progress", (req, res) => {
  if (fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE);
  res.json({ success: true });
  broadcastUpdate();
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Сервер запущен: http://0.0.0.0:${PORT}`);
  console.log(`Работает с частью part${partNumber}`);
});
