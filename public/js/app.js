const socket = io();
const localUser = JSON.parse(localStorage.getItem("party_user") || "null");

if (!localUser || !localUser.team) {
  window.location.href = "/index.html";
}

let currentUser = localUser;
let currentTasks = [];
let currentUsers = [];
let currentFeed = [];
let currentTeams = { Nubilers: { points: 0 }, Celibers: { points: 0 } };
let selectedTaskId = null;

// Setup Header
document.getElementById("userName").textContent = currentUser.name;
document.getElementById("myPoints").textContent = currentUser.points || 0;

const badge = document.getElementById("userTeamBadge");
badge.textContent = `${currentUser.team} ${currentUser.role === "groom" ? "👑" : ""}`;
badge.className = `user-badge badge-${currentUser.team.toLowerCase()}`;

if (currentUser.role === "admin") {
  document.getElementById("adminTabBtn").style.display = "flex";
}

// Socket Events
socket.on("init_data", (data) => {
  currentTasks = data.tasks;
  currentUsers = data.users;
  currentFeed = data.feed;
  currentTeams = data.teams;

  renderTeams();
  renderTasks();
  renderRanking();
  renderFeed();
});

socket.on("update_tasks", (tasks) => {
  currentTasks = tasks;
  renderTasks();
});

socket.on("update_scoreboard", ({ teams, users }) => {
  currentTeams = teams;
  currentUsers = users;

  renderTeams();
  renderRanking();

  const me = users.find((u) => u.id === currentUser.id);
  if (me) {
    currentUser.points = me.points;
    localStorage.setItem("party_user", JSON.stringify(currentUser));
    document.getElementById("myPoints").textContent = me.points;
  }
});

socket.on("broadcast_post", (post) => {
  currentFeed.unshift(post);
  renderFeed();
});

function renderTeams() {
  document.getElementById("nubilersPoints").textContent =
    `${currentTeams.Nubilers.points} pt`;
  document.getElementById("celibersPoints").textContent =
    `${currentTeams.Celibers.points} pt`;
}

function renderTasks() {
  const container = document.getElementById("taskList");
  container.innerHTML = currentTasks
    .map(
      (t) => `
        <div class="task-card">
            <div class="task-content">
                <h4>${t.title}</h4>
                <span class="task-points">+${t.points} PT PER ${currentUser.team.toUpperCase()}</span>
            </div>
            <button class="btn-task" onclick="openTaskModal(${t.id})">
                Completa 📷
            </button>
        </div>
    `,
    )
    .join("");
}

function renderRanking() {
  const container = document.getElementById("rankingList");
  const sorted = [...currentUsers].sort((a, b) => b.points - a.points);

  container.innerHTML = sorted
    .map((u, idx) => {
      const isMe = u.id === currentUser.id;
      const teamClass = u.team ? u.team.toLowerCase() : "neutral";

      return `
            <div class="ranking-card team-border-${teamClass}" style="${isMe ? "outline: 2px solid #fff;" : ""}">
                <span class="rank-position">#${idx + 1}</span>
                <span class="rank-name">${u.name} <small>(${u.team || "N/D"})</small></span>
                <span class="rank-points">${u.points} pt</span>
            </div>
        `;
    })
    .join("");
}

function renderFeed() {
  const container = document.getElementById("feedList");
  if (!container) return;

  container.innerHTML = currentFeed
    .map((p) => {
      const teamTag = p.team
        ? `<span class="tag-${p.team.toLowerCase()}">[${p.team}]</span>`
        : "";

      let mediaHtml = "";
      if (p.media && p.media.url) {
        if (p.media.type === "video") {
          mediaHtml = `
                    <div class="feed-media-wrapper">
                        <video controls playsinline preload="metadata" class="feed-media">
                            <source src="${p.media.url}">
                            Il tuo browser non supporta la riproduzione video.
                        </video>
                    </div>`;
        } else {
          mediaHtml = `
                    <div class="feed-media-wrapper">
                        <img src="${p.media.url}" alt="Prova completata" class="feed-media" loading="lazy">
                    </div>`;
        }
      }

      return `
            <div class="feed-card ${p.team ? "feed-" + p.team.toLowerCase() : ""}">
                <div class="feed-card-header">
                    <span class="feed-user">${teamTag} ${p.user}</span>
                    <span>${p.time}</span>
                </div>
                <div class="feed-text">${p.text}</div>
                ${mediaHtml}
            </div>
        `;
    })
    .join("");
}

// Gestione Modal Completamento Sfida & Upload
window.openTaskModal = (taskId) => {
  const task = currentTasks.find((t) => t.id === taskId);
  if (!task) return;

  selectedTaskId = taskId;
  document.getElementById("modalTaskTitle").textContent = task.title;
  document.getElementById("modalTaskPoints").textContent =
    `+${task.points} Punti per i ${currentUser.team}`;

  // Reset input file e anteprima
  const mediaInput = document.getElementById("mediaInput");
  mediaInput.value = "";
  document.getElementById("mediaPreviewContainer").innerHTML = "";

  document.getElementById("taskModal").style.display = "flex";
};

window.closeTaskModal = () => {
  document.getElementById("taskModal").style.display = "none";
  selectedTaskId = null;
};

// Anteprima media caricato
document.getElementById("mediaInput").addEventListener("change", function (e) {
  const file = e.target.files[0];
  const previewContainer = document.getElementById("mediaPreviewContainer");
  previewContainer.innerHTML = "";

  if (!file) return;

  const fileUrl = URL.createObjectURL(file);
  if (file.type.startsWith("video/")) {
    previewContainer.innerHTML = `<video src="${fileUrl}" controls class="preview-element"></video>`;
  } else {
    previewContainer.innerHTML = `<img src="${fileUrl}" class="preview-element" alt="Anteprima">`;
  }
});

// Invio prova con upload
window.submitTaskCompletion = async () => {
  if (!selectedTaskId) return;

  const confirmBtn = document.getElementById("confirmTaskBtn");
  const fileInput = document.getElementById("mediaInput");
  const file = fileInput.files[0];

  const formData = new FormData();
  formData.append("userId", currentUser.id);
  formData.append("taskId", selectedTaskId);
  if (file) {
    formData.append("media", file);
  }

  confirmBtn.disabled = true;
  confirmBtn.textContent = "Caricamento in corso...";

  try {
    const res = await fetch("/api/complete-task", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();

    if (res.ok) {
      closeTaskModal();
    } else {
      alert(data.error || "Errore durante l'invio della prova.");
    }
  } catch (err) {
    alert("Errore di connessione durante l'upload.");
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = "Conferma e Invia 🚀";
  }
};

// Admin Actions
window.adminCreateTask = () => {
  const title = document.getElementById("newTaskTitle").value;
  const points = document.getElementById("newTaskPoints").value;
  if (!title.trim()) return;

  socket.emit("admin_add_task", { title, points, adminId: currentUser.id });
  document.getElementById("newTaskTitle").value = "";
};

window.adminGiveTeamPoints = () => {
  const team = document.getElementById("adminTeamSelect").value;
  const amount = document.getElementById("adminTeamPoints").value;
  if (!amount) return;

  socket.emit("admin_give_team_points", {
    team,
    amount,
    adminId: currentUser.id,
  });
  document.getElementById("adminTeamPoints").value = "";
};

// Feed text message
document.getElementById("feedSendBtn").addEventListener("click", () => {
  const input = document.getElementById("feedInput");
  if (!input.value.trim()) return;
  socket.emit("new_post", {
    user: currentUser.name,
    text: input.value,
    team: currentUser.team,
  });
  input.value = "";
});

window.switchTab = (tabName) => {
  document
    .querySelectorAll(".tab-panel")
    .forEach((p) => p.classList.remove("active"));
  document
    .querySelectorAll(".nav-item")
    .forEach((btn) => btn.classList.remove("active"));

  document.getElementById(`tab-${tabName}`).classList.add("active");
  event.currentTarget.classList.add("active");
};

window.logout = () => {
  localStorage.removeItem("party_user");
  window.location.href = "/index.html";
};
