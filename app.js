const CONFIG = window.WEDDING_CONFIG;

const categoryMeta = {
  "Documents & registrations": { icon: "⌁", order: 1 },
  "Visas & travel": { icon: "✦", order: 2 },
  "Flights & stays": { icon: "⌂", order: 3 },
  "Wedding details": { icon: "♡", order: 4 },
  "People & celebrations": { icon: "❋", order: 5 }
};

// Checklist records are fetched only after authenticated database authorization.

let state = { tasks: [] };
let activeProfile = "";
let activeFilter = "all";
let toastTimer;

const accessGate = document.getElementById("accessGate");
const appShell = document.getElementById("appShell");

function enterApp(profile) {
  activeProfile = profile;
  accessGate.hidden = true;
  appShell.hidden = false;
  document.getElementById("profileInitial").textContent = profile.charAt(0);
  document.getElementById("profileName").textContent = profile;
  render();
  startPetals();
  if (profile === "Agnes") showSweetheartWelcome();
  else setTimeout(() => { if (activeProfile === profile) celebrateEntrance(); }, 180);
}

const sweetheartWelcome = document.getElementById("sweetheartWelcome");

function showSweetheartWelcome() {
  document.getElementById("sweetheartTitle").textContent = "Welcome, my sweetheart";
  const copy = document.getElementById("sweetheartCopy");
  copy.replaceChildren();
  "I made this out of so much love for you.".split(" ").forEach((word, index) => {
    const span = document.createElement("span");
    span.textContent = word;
    span.style.setProperty("--word", index);
    copy.append(span, document.createTextNode(" "));
  });
  document.getElementById("sweetheartSignature").textContent = "Always yours, Harmeet";
  sweetheartWelcome.showModal();
  celebrateEntrance(sweetheartWelcome.querySelector(".welcome-confetti"));
}

function clearSweetheartWelcome() {
  sweetheartWelcome.close();
  sweetheartWelcome.querySelector(".welcome-confetti").replaceChildren();
  for (const id of ["sweetheartTitle", "sweetheartCopy", "sweetheartSignature"]) {
    document.getElementById(id).replaceChildren();
  }
}

document.getElementById("closeWelcomeButton").addEventListener("click", () => sweetheartWelcome.close());

function render() {
  renderChecklist();
  renderProgress();
}

function renderChecklist() {
  const grid = document.getElementById("categoryGrid");
  const categories = Object.keys(categoryMeta).sort((a, b) => categoryMeta[a].order - categoryMeta[b].order);
  const visibleByFilter = task => {
    if (activeFilter === "open") return !task.done;
    if (activeFilter === "done") return task.done;
    if (activeFilter === "priority") return task.priority && !task.done;
    if (activeFilter === "mine") return task.owner === activeProfile || task.owner === "Both";
    return true;
  };

  const markup = categories.map(category => {
    const tasks = state.tasks.filter(task => task.category === category && visibleByFilter(task));
    if (!tasks.length) return "";
    const completed = tasks.filter(task => task.done).length;
    return `
      <article class="category-card">
        <div class="category-header">
          <div class="category-title"><span class="category-icon">${categoryMeta[category].icon}</span><h3>${category}</h3></div>
          <span class="category-count">${completed}/${tasks.length} complete</span>
        </div>
        <div class="task-list">
          ${tasks.map(taskTemplate).join("")}
        </div>
      </article>`;
  }).join("");

  grid.innerHTML = markup || `<div class="empty-state">Nothing here right now. That feels rather lovely.</div>`;

  grid.querySelectorAll("[data-task-check]").forEach(input => {
    input.addEventListener("change", event => toggleTask(event.currentTarget.dataset.taskCheck, event.currentTarget.checked, event.currentTarget));
  });
  grid.querySelectorAll("[data-delete-task]").forEach(button => {
    button.addEventListener("click", () => deleteTask(button.dataset.deleteTask));
  });
}

function taskTemplate(task) {
  const due = task.due ? formatDate(task.due) : "Date to confirm";
  const custom = task.id.startsWith("custom-");
  return `
    <div class="task-item ${task.done ? "done" : ""}">
      <label class="task-check" aria-label="Mark ${escapeHTML(task.title)} complete">
        <input type="checkbox" data-task-check="${task.id}" ${task.done ? "checked" : ""} />
        <span></span>
      </label>
      <div>
        <strong class="task-title">${escapeHTML(task.title)}</strong>
        <div class="task-meta">
          <span class="owner-tag">${escapeHTML(task.owner)}</span>
          ${task.priority ? `<span class="priority-tag">Priority</span>` : ""}
          <span class="due-tag">${due}</span>
        </div>
        ${task.note ? `<p class="task-note">${escapeHTML(task.note)}</p>` : ""}
      </div>
      ${custom ? `<button class="delete-task" data-delete-task="${task.id}" aria-label="Delete task">×</button>` : `<span></span>`}
    </div>`;
}

async function toggleTask(id, done, source) {
  const task = state.tasks.find(item => item.id === id);
  if (!task) return;
  source.disabled = true;
  const saved = await writeTask(() => backend.from("wedding_tasks").update({ done }).eq("id", id).select("id").single());
  if (!saved) { source.checked = task.done; source.disabled = false; return; }
  task.done = done;
  if (done) {
    celebrate(source);
    showToast("One step closer to Tbilisi ♡");
  }
  render();
}

async function deleteTask(id) {
  if (!await writeTask(() => backend.from("wedding_tasks").delete().eq("id", id).select("id").single())) return;
  state.tasks = state.tasks.filter(task => task.id !== id);
  render();
  showToast("Task removed");
}

function renderProgress() {
  const total = state.tasks.length;
  const done = state.tasks.filter(task => task.done).length;
  const priorities = state.tasks.filter(task => task.priority && !task.done).length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  document.getElementById("progressRing").style.setProperty("--progress", percent);
  document.getElementById("progressPercent").textContent = `${percent}%`;
  document.getElementById("progressDetail").textContent = `${done} of ${total} tasks completed`;
  document.getElementById("doneCount").textContent = done;
  document.getElementById("priorityCount").textContent = priorities;
  document.getElementById("progressMessage").textContent = percent >= 90 ? "Almost ready to say ‘I do’." : percent >= 60 ? "The big pieces are falling into place." : percent >= 30 ? "Look how far we’ve already come." : "The journey begins here.";
}

document.querySelectorAll(".filter").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".filter").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    activeFilter = button.dataset.filter;
    renderChecklist();
  });
});

const taskDialog = document.getElementById("taskDialog");
document.getElementById("addTaskButton").addEventListener("click", () => taskDialog.showModal());
document.getElementById("cancelTaskButton").addEventListener("click", () => taskDialog.close());
document.getElementById("closeTaskButton").addEventListener("click", () => taskDialog.close());
document.getElementById("taskForm").addEventListener("submit", async event => {
  event.preventDefault();
  const taskForm = event.currentTarget;
  const submitButton = taskForm.querySelector('[type="submit"]');
  if (submitButton.disabled) return;
  submitButton.disabled = true;
  const form = new FormData(event.currentTarget);
  const task = {
    id: `custom-${crypto.randomUUID()}`,
    title: form.get("title").trim(),
    category: form.get("category"),
    owner: form.get("owner"),
    due: form.get("due"),
    priority: form.get("priority") === "on",
    note: form.get("note").trim(),
    done: false
  };
  const saved = await writeTask(() => backend.from("wedding_tasks").insert(task).select("id").single());
  submitButton.disabled = false;
  if (!saved) return;
  state.tasks.push(task);
  render();
  taskForm.reset();
  taskDialog.close();
  showToast("New task added to our journey");
});

function updateCountdown() {
  const target = new Date(CONFIG.weddingDate).getTime();
  const difference = Math.max(0, target - Date.now());
  const days = Math.floor(difference / 86400000);
  const hours = Math.floor((difference / 3600000) % 24);
  const minutes = Math.floor((difference / 60000) % 60);
  const seconds = Math.floor((difference / 1000) % 60);
  document.getElementById("daysLeft").textContent = days;
  document.getElementById("hoursLeft").textContent = String(hours).padStart(2, "0");
  document.getElementById("minutesLeft").textContent = String(minutes).padStart(2, "0");
  document.getElementById("secondsLeft").textContent = String(seconds).padStart(2, "0");
}
updateCountdown();
setInterval(updateCountdown, 1000);

function startPetals() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const container = document.querySelector(".petals");
  if (container.dataset.started) return;
  container.dataset.started = "true";
  setInterval(() => {
    if (document.hidden || accessGate.hidden === false) return;
    const petal = document.createElement("span");
    petal.className = "petal";
    petal.style.left = `${Math.random() * 100}%`;
    petal.style.setProperty("--drift", `${-100 + Math.random() * 200}px`);
    petal.style.animationDuration = `${8 + Math.random() * 7}s`;
    petal.style.transform = `scale(${.55 + Math.random() * .8})`;
    container.appendChild(petal);
    setTimeout(() => petal.remove(), 16000);
  }, 1000);
}

function celebrate(source) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const rect = source.getBoundingClientRect();
  const colors = ["#6e2d43", "#c59a59", "#e3a9ad", "#fff0d9"];
  for (let index = 0; index < 24; index += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti";
    piece.style.left = `${rect.left + rect.width / 2}px`;
    piece.style.top = `${rect.top + rect.height / 2}px`;
    piece.style.background = colors[index % colors.length];
    piece.style.setProperty("--x", `${-90 + Math.random() * 180}px`);
    piece.style.setProperty("--y", `${-110 + Math.random() * 165}px`);
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), 900);
  }
}

function celebrateEntrance(container = document.body) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const colors = ["#6e2d43", "#c59a59", "#e3a9ad", "#fff0d9", "#f5d8a7", "#ffffff"];
  const origins = [18, 50, 82];

  origins.forEach((origin, originIndex) => {
    for (let index = 0; index < 24; index += 1) {
      const piece = document.createElement("span");
      piece.className = `confetti entrance-confetti shape-${index % 3}`;
      piece.style.left = `${origin + (Math.random() * 7 - 3.5)}vw`;
      piece.style.top = `${originIndex === 1 ? 8 : 18}%`;
      piece.style.background = colors[(index + originIndex) % colors.length];
      piece.style.setProperty("--x", `${-130 + Math.random() * 260}px`);
      piece.style.setProperty("--y", `${190 + Math.random() * 420}px`);
      piece.style.setProperty("--spin", `${360 + Math.random() * 900}deg`);
      piece.style.animationDelay = `${Math.random() * 180}ms`;
      container.appendChild(piece);
      setTimeout(() => piece.remove(), 2200);
    }
  });
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function escapeHTML(value) {
  const element = document.createElement("div");
  element.textContent = value;
  return element.innerHTML;
}

