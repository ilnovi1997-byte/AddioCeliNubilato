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

// Helper per generare l'HTML dell'avatar
function getAvatarHtml(avatarUrl, extraClass = "") {
  if (avatarUrl) {
    return `<img src="${avatarUrl}" class="avatar-img ${extraClass}" alt="Avatar">`;
  }
  return `<div class="avatar-fallback ${extraClass}">😎</div>`;
}

function updateHeaderUI() {
  document.getElementById("userName").textContent = currentUser.name;
  document.getElementById("myPoints").textContent = currentUser.points || 0;

  const badge = document.getElementById("userTeamBadge");
  badge.textContent = `${currentUser.team} ${currentUser.role === "groom" ? "👑" : ""}`;
  badge.className = `user-badge badge-${currentUser.team.toLowerCase()}`;

  const avatarContainer = document.getElementById("avatarContainer");
  avatarContainer.innerHTML = `
        ${getAvatarHtml(currentUser.avatar)}
        <span class="avatar-edit-badge">📷</span>
    `;

  if (currentUser.role === "admin") {
    document.getElementById("adminTabBtn").style.display = "flex";
  }
}

updateHeaderUI();

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
    currentUser = me;
    localStorage.setItem("party_user", JSON.stringify(currentUser));
    updateHeaderUI();
  }
});

socket.on("broadcast_post", (post) => {
  currentFeed.unshift(post);
  renderFeed();
});

socket.on("feed_updated", (updatedFeed) => {
  currentFeed = updatedFeed;
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
                <div class="rank-left">
                    <span class="rank-position">#${idx + 1}</span>
                    ${getAvatarHtml(u.avatar, "avatar-small")}
                    <div class="rank-details">
                        <span class="rank-name">${u.name} ${isMe ? "(Tu)" : ""}</span>
                        <small class="rank-team">${u.team || "N/D"}</small>
                    </div>
                </div>
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
      const deleteBtn =
        currentUser.role === "admin"
          ? `<button class="btn-delete-post" onclick="deletePost(${p.id})">🗑️</button>`
          : "";

      let mediaHtml = "";
      if (p.media && p.media.url) {
        if (p.media.type === "video") {
          mediaHtml = `
                    <div class="feed-media-wrapper">
                        <video controls playsinline preload="metadata" class="feed-media">
                            <source src="${p.media.url}">
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
                    <div class="feed-user-box">
                        ${getAvatarHtml(p.avatar, "avatar-tiny")}
                        <span class="feed-user">${teamTag} ${p.user}</span>
                    </div>
                    <div class="header-right">
                        <span>${p.time}</span>
                        ${deleteBtn}
                    </div>
                </div>
                <div class="feed-text">${p.text}</div>
                ${mediaHtml}
            </div>
        `;
    })
    .join("");
}

// Modal Task
window.openTaskModal = (taskId) => {
  const task = currentTasks.find((t) => t.id === taskId);
  if (!task) return;

  selectedTaskId = taskId;
  document.getElementById("modalTaskTitle").textContent = task.title;
  document.getElementById("modalTaskPoints").textContent =
    `+${task.points} Punti per i ${currentUser.team}`;

  const mediaInput = document.getElementById("mediaInput");
  mediaInput.value = "";
  document.getElementById("mediaPreviewContainer").innerHTML = "";
  document.getElementById("taskModal").style.display = "flex";
};

window.closeTaskModal = () => {
  document.getElementById("taskModal").style.display = "none";
  selectedTaskId = null;
};

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

window.submitTaskCompletion = async () => {
  if (!selectedTaskId) return;

  const confirmBtn = document.getElementById("confirmTaskBtn");
  const fileInput = document.getElementById("mediaInput");
  const file = fileInput.files[0];

  const formData = new FormData();
  formData.append("userId", currentUser.id);
  formData.append("taskId", selectedTaskId);
  if (file) formData.append("media", file);

  confirmBtn.disabled = true;
  confirmBtn.textContent = "Caricamento...";

  try {
    const res = await fetch("/api/complete-task", {
      method: "POST",
      body: formData,
    });
    if (res.ok) {
      closeTaskModal();
    } else {
      alert("Errore durante l'invio della prova.");
    }
  } catch (err) {
    alert("Errore di rete durante il caricamento.");
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = "Conferma e Invia 🚀";
  }
};

// Modal Avatar
window.openAvatarModal = () => {
  const previewBox = document.getElementById("avatarPreviewBox");
  if (currentUser.avatar) {
    previewBox.innerHTML = `<img src="${currentUser.avatar}" class="avatar-img avatar-large" alt="Profilo">`;
  } else {
    previewBox.innerHTML = `<span style="font-size: 3.5rem;">😎</span>`;
  }
  document.getElementById("avatarFileInput").value = "";
  document.getElementById("avatarModal").style.display = "flex";
};

window.closeAvatarModal = () => {
  document.getElementById("avatarModal").style.display = "none";
};

document
  .getElementById("avatarFileInput")
  .addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const fileUrl = URL.createObjectURL(file);
    document.getElementById("avatarPreviewBox").innerHTML =
      `<img src="${fileUrl}" class="avatar-img avatar-large" alt="Anteprima">`;
  });

window.submitAvatar = async () => {
  const fileInput = document.getElementById("avatarFileInput");
  const file = fileInput.files[0];
  if (!file) return closeAvatarModal();

  const saveBtn = document.getElementById("saveAvatarBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Salvataggio...";

  const formData = new FormData();
  formData.append("userId", currentUser.id);
  formData.append("avatar", file);

  try {
    const res = await fetch("/api/upload-avatar", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (res.ok) {
      currentUser.avatar = data.avatarUrl;
      localStorage.setItem("party_user", JSON.stringify(currentUser));
      updateHeaderUI();
      closeAvatarModal();
    } else {
      alert(data.error || "Errore salvataggio foto profilo.");
    }
  } catch (err) {
    alert("Errore di connessione durante l'upload.");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Salva Profilo 💾";
  }
};

// Feed text message
document.getElementById("feedSendBtn").addEventListener("click", () => {
  const input = document.getElementById("feedInput");
  if (!input.value.trim()) return;
  socket.emit("new_post", {
    userId: currentUser.id,
    user: currentUser.name,
    text: input.value,
    team: currentUser.team,
  });
  input.value = "";
});

// Admin Actions
window.deletePost = (postId) => {
  if (confirm("Vuoi eliminare questo post dal feed?")) {
    socket.emit("admin_delete_post", { postId, adminId: currentUser.id });
  }
};

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
