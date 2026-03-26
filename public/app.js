// public/app.js
let allProducts = [];
let selectedProducts = [];
let lastProcessedIndex = -1;
let currentIndex = 0;
let eventSource = null;
let currentPartNumber = null;

// Для галереи в модалке
let currentImageUrls = [];
let currentImageIndex = 0;

const cardContainer = document.getElementById("cardContainer");
const statsSpan = document.getElementById("stats");
const progressInfo = document.getElementById("progressInfo");
const resetBtn = document.getElementById("resetBtn");
const actionButtonsDiv = document.getElementById("actionButtons");

const modal = document.getElementById("imageModal");
const modalImg = document.getElementById("modalImage");
const closeModal = document.querySelector(".close-modal");
const modalPrev = document.getElementById("modalPrev");
const modalNext = document.getElementById("modalNext");

function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fixImagePath(p) {
  if (!p) return "";
  return "/" + p.replace(/\\/g, "/");
}

async function loadData() {
  try {
    const [productsRes, progressRes] = await Promise.all([
      fetch("/api/products"),
      fetch("/api/progress"),
    ]);
    if (!productsRes.ok) throw new Error("Ошибка загрузки товаров");
    allProducts = await productsRes.json();
    const progress = await progressRes.json();
    selectedProducts = progress.selected || [];
    lastProcessedIndex =
      progress.lastIndex !== undefined ? progress.lastIndex : -1;
    currentPartNumber = progress.partNumber;

    if (lastProcessedIndex + 1 < allProducts.length) {
      currentIndex = lastProcessedIndex + 1;
    } else {
      currentIndex = allProducts.length;
    }

    console.log(
      `Загружено: всего=${allProducts.length}, выбрано=${selectedProducts.length}, lastProcessed=${lastProcessedIndex}, current=${currentIndex}`,
    );
    updateStats();
    renderCurrentCard();
    updateActionButtonsVisibility();
  } catch (err) {
    cardContainer.innerHTML = `<div class="loading">Ошибка: ${err.message}</div>`;
    console.error(err);
  }
}

function connectEvents() {
  if (eventSource) eventSource.close();
  eventSource = new EventSource("/api/events");
  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "progress-updated") {
      console.log("Получено обновление прогресса");
      loadData();
    }
  };
  eventSource.onerror = (err) => {
    console.error("SSE ошибка, переподключение через 5 сек", err);
    eventSource.close();
    setTimeout(connectEvents, 5000);
  };
}

function updateStats() {
  statsSpan.innerText = `Выбрано: ${selectedProducts.length} из ${allProducts.length}`;
  if (currentIndex >= allProducts.length) {
    progressInfo.innerText = "Все товары обработаны!";
  } else {
    progressInfo.innerText = `Товар ${currentIndex + 1} из ${allProducts.length}`;
  }
}

function updateActionButtonsVisibility() {
  if (currentIndex < allProducts.length) {
    actionButtonsDiv.style.display = "flex";
  } else {
    actionButtonsDiv.style.display = "none";
  }
}

// Добавить товар
async function addProduct() {
  if (currentIndex >= allProducts.length) return;
  try {
    const response = await fetch("/api/actions/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index: currentIndex }),
    });
    if (response.status === 409) {
      await loadData();
      if (currentIndex < allProducts.length) {
        return addProduct();
      }
      return;
    }
    if (!response.ok) throw new Error("Ошибка добавления");
    const data = await response.json();
    selectedProducts = data.progress.selected;
    lastProcessedIndex = data.progress.lastIndex;
    currentIndex = lastProcessedIndex + 1;
    updateStats();
    renderCurrentCard();
  } catch (err) {
    console.error("Ошибка добавления:", err);
    alert("Не удалось добавить товар. Попробуйте ещё раз.");
  }
}

// Пропустить товар
async function skipProduct() {
  if (currentIndex >= allProducts.length) return;
  try {
    const response = await fetch("/api/actions/skip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index: currentIndex }),
    });
    if (response.status === 409) {
      await loadData();
      if (currentIndex < allProducts.length) {
        return skipProduct();
      }
      return;
    }
    if (!response.ok) throw new Error("Ошибка пропуска");
    const data = await response.json();
    selectedProducts = data.progress.selected;
    lastProcessedIndex = data.progress.lastIndex;
    currentIndex = lastProcessedIndex + 1;
    updateStats();
    renderCurrentCard();
  } catch (err) {
    console.error("Ошибка пропуска:", err);
    alert("Не удалось пропустить товар. Попробуйте ещё раз.");
  }
}

function renderCurrentCard() {
  if (currentIndex >= allProducts.length) {
    cardContainer.innerHTML = `
            <div class="card">
                <div class="card-content" style="text-align: center;">
                    <h3>✅ Все товары обработаны!</h3>
                    <button id="exportBtn" style="background: #007bff; color: white; margin-top: 20px;">Скачать Excel с выбранными товарами</button>
                </div>
            </div>
        `;
    const exportBtn = document.getElementById("exportBtn");
    if (exportBtn) exportBtn.addEventListener("click", exportToExcel);
    return;
  }

  const p = allProducts[currentIndex];
  let imagesHtml = "";
  currentImageUrls = [];
  if (p.localPaths && p.localPaths.length) {
    p.localPaths.forEach((imgPath) => {
      if (imgPath) {
        const url = fixImagePath(imgPath);
        currentImageUrls.push(url);
        imagesHtml += `<img src="${url}" alt="photo" data-full="${url}" loading="lazy" onerror="this.style.display='none'">`;
      }
    });
  } else {
    imagesHtml = '<div style="color: #999;">Нет локальных изображений</div>';
  }

  const tagsHtml =
    p.tags && p.tags.length
      ? p.tags
          .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
          .join("")
      : "";

  const cardHtml = `
        <div class="card">
            <div class="card-content">
                <div class="title">${escapeHtml(p.title)}</div>
                <div class="price">${escapeHtml(p.price)}</div>
                <div class="categories">Категории: ${escapeHtml(p.categories || "—")}</div>
                <div class="images">${imagesHtml}</div>
                <div class="description">${escapeHtml(p.description || "").replace(/\n/g, "<br>")}</div>
                <div class="tags">${tagsHtml}</div>
            </div>
        </div>
    `;
  cardContainer.innerHTML = cardHtml;

  // Навесить обработчики клика на изображения
  const images = document.querySelectorAll(".images img");
  images.forEach((img, idx) => {
    img.addEventListener("click", () => {
      currentImageIndex = idx;
      modalImg.src = currentImageUrls[idx];
      modal.style.display = "block";
    });
  });
}

function exportToExcel() {
  if (selectedProducts.length === 0) {
    alert("Нет выбранных товаров.");
    return;
  }
  const excelData = selectedProducts.map((p, idx) => ({
    "№": idx + 1,
    Название: p.title || "",
    "Ссылка на товар": p.productUrl || "",
    Цена: p.price || "",
    "Локальные пути к фото": (p.localPaths || []).join("; "),
    Описание: p.description || "",
    "Настройки печати": p.printSettings || "",
    Категории: p.categories || "",
    Теги: (p.tags || []).join(", "),
  }));

  const ws = XLSX.utils.json_to_sheet(excelData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Выбранные товары");
  const fileName = `added_products_part${currentPartNumber || "unknown"}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

async function resetProgress() {
  if (
    confirm(
      "Сбросить прогресс? Все выбранные товары будут удалены, и вы начнёте с начала.",
    )
  ) {
    await fetch("/api/progress", { method: "DELETE" });
    await loadData();
  }
}

// Навигация в модальном окне
function showPrevImage() {
  if (currentImageUrls.length === 0) return;
  currentImageIndex =
    (currentImageIndex - 1 + currentImageUrls.length) % currentImageUrls.length;
  modalImg.src = currentImageUrls[currentImageIndex];
}

function showNextImage() {
  if (currentImageUrls.length === 0) return;
  currentImageIndex = (currentImageIndex + 1) % currentImageUrls.length;
  modalImg.src = currentImageUrls[currentImageIndex];
}

// Закрытие модального окна
closeModal.onclick = () => {
  modal.style.display = "none";
};
window.onclick = (event) => {
  if (event.target === modal) {
    modal.style.display = "none";
  }
};
modalPrev.addEventListener("click", showPrevImage);
modalNext.addEventListener("click", showNextImage);

// Инициализация
document.getElementById("addBtn").addEventListener("click", addProduct);
document.getElementById("skipBtn").addEventListener("click", skipProduct);
resetBtn.addEventListener("click", resetProgress);
loadData();
connectEvents();
