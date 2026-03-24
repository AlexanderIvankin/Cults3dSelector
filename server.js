const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const basicAuth = require("express-basic-auth");

const app = express();
const PORT = 3000;

// Настройка Basic Auth
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

// Определение текущей части
const splitRoot = path.join(__dirname, "SplitProducts");
let partNumber = process.env.PART_NUMBER || null;
let partDir = null;

if (!partNumber) {
  // Если PART_NUMBER не задан, ищем единственную папку part* в SplitProducts
  try {
    const items = fs.readdirSync(splitRoot, { withFileTypes: true });
    const partDirs = items.filter(
      (dirent) => dirent.isDirectory() && /^part\d+$/.test(dirent.name),
    );
    if (partDirs.length === 1) {
      partNumber = partDirs[0].name.slice(4); // из "part1" получаем "1"
      console.log(
        `Найдена единственная папка: part${partNumber}, используем её.`,
      );
    } else if (partDirs.length > 1) {
      console.warn(
        `Найдено несколько папок part: ${partDirs.map((d) => d.name).join(", ")}. Используйте переменную окружения PART_NUMBER.`,
      );
      // По умолчанию возьмём первую
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

partDir = path.join(splitRoot, `part${partNumber}`);
const jsonFile = path.join(
  partDir,
  `products_with_local_part${partNumber}.json`,
);
const downloadsDir = path.join(partDir, "downloads");

// Проверка наличия файлов
if (!fs.existsSync(jsonFile)) {
  console.error(`Файл JSON не найден: ${jsonFile}`);
  process.exit(1);
}
if (!fs.existsSync(downloadsDir)) {
  console.warn(`Папка downloads не найдена: ${downloadsDir}`);
  // Не выходим, может быть нет изображений
}

console.log(`Используется часть ${partNumber}`);
console.log(`JSON: ${jsonFile}`);
console.log(`Downloads: ${downloadsDir}`);

// Статика для downloads: обслуживаем папку downloads текущей части по пути /downloads
app.use("/downloads", express.static(downloadsDir));

const PROGRESS_FILE = path.join(__dirname, `progress_part${partNumber}.json`);

app.get("/api/products", (req, res) => {
  if (!fs.existsSync(jsonFile)) {
    return res
      .status(404)
      .json({
        error: `Файл products_with_local_part${partNumber}.json не найден`,
      });
  }
  const data = fs.readFileSync(jsonFile, "utf8");
  res.json(JSON.parse(data));
});

app.get("/api/progress", (req, res) => {
  if (fs.existsSync(PROGRESS_FILE)) {
    const data = fs.readFileSync(PROGRESS_FILE, "utf8");
    res.json(JSON.parse(data));
  } else {
    res.json({ selected: [], lastIndex: -1 });
  }
});

app.post("/api/progress", (req, res) => {
  const { selected, lastIndex } = req.body;
  fs.writeFileSync(
    PROGRESS_FILE,
    JSON.stringify({ selected, lastIndex }, null, 2),
  );
  console.log(
    `Сохранён прогресс для part${partNumber}: lastIndex=${lastIndex}, selected=${selected.length}`,
  );
  res.json({ success: true });
});

app.delete("/api/progress", (req, res) => {
  if (fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE);
  res.json({ success: true });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Сервер запущен: http://0.0.0.0:${PORT}`);
  console.log(`Работает с частью part${partNumber}`);
});
