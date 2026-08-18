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
let currentItinerary = [];
let currentCondemned = [];
let selectedDayFilter = "Tutti";
let selectedTaskId = null;
let editingTaskId = null;

// Parsing semplice per testo sicuro con a capo e formattazione
function formatRichText(raw) {
  if (!raw) return "";
  let text = raw.replace(/\n/g, "<br>");
  return text;
}

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

// Socket Listeners
socket.on("init_data", (data) => {
  currentTasks = data.tasks;
  currentUsers = data.users;
  currentFeed = data.feed;
  currentTeams = data.teams;
  currentItinerary = data.itinerary || [];
  currentCondemned = data.condemned || [];

  renderTeams();
  renderCondemned();
  renderTasks();
  renderRanking();
  renderFeed();
  renderItinerary();
  renderAdminTaskList();
});

socket.on("update_condemned", (condemned) => {
  currentCondemned = condemned;
  renderCondemned();
});

socket.on("update_tasks", (tasks) => {
  currentTasks = tasks;
  renderTasks();
  renderAdminTaskList();
});

socket.on("update_itinerary", (itinerary) => {
  currentItinerary = itinerary;
  renderItinerary();
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

// Render Functions
function renderTeams() {
  document.getElementById("nubilersPoints").textContent =
    `${currentTeams.Nubilers.points} pt`;
  document.getElementById("celibersPoints").textContent =
    `${currentTeams.Celibers.points} pt`;
}

function renderCondemned() {
  const container = document.getElementById("condemnedList");
  if (!container) return;

  if (currentCondemned.length === 0) {
    container.innerHTML = `<div class="empty-state">Nessun condannato registrato 👰🤵</div>`;
    return;
  }

  container.innerHTML = currentCondemned
    .map((c) => {
      const teamBorder = c.team ? `team-border-${c.team.toLowerCase()}` : "";
      const fitClass = c.fitMode ? `fit-${c.fitMode}` : "fit-cover-center";
      const heightStyle = c.imgHeight
        ? `height: ${c.imgHeight};`
        : "height: 260px;";

      const adminControls =
        currentUser.role === "admin"
          ? `
            <div class="condemned-admin-actions">
                <button class="btn-action-small btn-edit" onclick="editCondemnedProfile(${c.id})">✏️ Modifica</button>
                <button class="btn-action-small btn-delete" onclick="adminDeleteCondemned(${c.id})">🗑️</button>
            </div>
        `
          : "";

      return `
            <div class="condemned-card ${teamBorder}">
                ${adminControls}
                <div class="condemned-photo-wrapper" style="${heightStyle}">
                    <img src="${c.photo}" alt="${c.name}" class="condemned-photo ${fitClass}">
                    <span class="condemned-role-badge badge-${c.team ? c.team.toLowerCase() : "neutral"}">${c.role} (${c.team})</span>
                </div>
                <div class="condemned-body">
                    <h3 class="condemned-name">${c.name}</h3>
                    ${c.nickname ? `<div class="condemned-nickname">"${c.nickname}"</div>` : ""}
                    
                    <div class="condemned-desc">${formatRichText(c.description)}</div>
                    
                    ${
                      c.weakness
                        ? `
                        <div class="condemned-info-pill">
                            <strong>⚠️ Punto Debole:</strong> ${formatRichText(c.weakness)}
                        </div>`
                        : ""
                    }

                    ${
                      c.quote
                        ? `
                        <div class="condemned-quote">${formatRichText(c.quote)}</div>`
                        : ""
                    }
                </div>
            </div>
        `;
    })
    .join("");
}

function renderTasks() {
  const container = document.getElementById("taskList");
  if (!container) return;

  container.innerHTML = currentTasks
    .map((t) => {
      const adminControls =
        currentUser.role === "admin"
          ? `
            <div class="task-admin-btns">
                <button class="btn-action-small btn-edit" onclick="openEditTaskModal(${t.id})" title="Modifica Sfida">✏️</button>
                <button class="btn-action-small btn-delete" onclick="adminDeleteTask(${t.id})" title="Elimina Sfida">🗑️</button>
            </div>
        `
          : "";

      return `
            <div class="task-card">
                <div class="task-content">
                    <div class="task-title-row">
                        <h4>${t.title}</h4>
                        ${adminControls}
                    </div>
                    <span class="task-points">+${t.points} PT PER ${currentUser.team.toUpperCase()}</span>
                </div>
                <button class="btn-task" onclick="openTaskModal(${t.id})">
                    Completa 📷
                </button>
            </div>
        `;
    })
    .join("");
}

function renderAdminTaskList() {
  const container = document.getElementById("adminTaskManagementList");
  if (!container || currentUser.role !== "admin") return;

  if (currentTasks.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted); font-size: 0.8rem;">Nessuna sfida presente.</p>`;
    return;
  }

  container.innerHTML = currentTasks
    .map(
      (t) => `
        <div class="admin-task-row">
            <div class="admin-task-row-info">
                <strong>${t.title}</strong>
                <small>${t.points} pt</small>
            </div>
            <div class="admin-task-row-actions">
                <button class="btn-action-small btn-edit" onclick="openEditTaskModal(${t.id})">✏️</button>
                <button class="btn-action-small btn-delete" onclick="adminDeleteTask(${t.id})">🗑️</button>
            </div>
        </div>
    `,
    )
    .join("");
}

function renderItinerary() {
  const container = document.getElementById("itineraryList");
  const filterContainer = document.getElementById("dayFilterContainer");
  if (!container || !filterContainer) return;

  const days = ["Tutti", ...new Set(currentItinerary.map((item) => item.day))];

  filterContainer.innerHTML = days
    .map(
      (d) => `
        <button class="day-chip ${selectedDayFilter === d ? "active" : ""}" onclick="setDayFilter('${d}')">
            ${d}
        </button>
    `,
    )
    .join("");

  const filtered =
    selectedDayFilter === "Tutti"
      ? currentItinerary
      : currentItinerary.filter((i) => i.day === selectedDayFilter);

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state">Nessuna attività programmata per questo giorno 🏖️</div>`;
    return;
  }

  container.innerHTML = filtered
    .map((item) => {
      const deleteBtn =
        currentUser.role === "admin"
          ? `<button class="btn-delete-post" onclick="deleteItineraryItem(${item.id})">🗑️</button>`
          : "";

      return `
            <div class="itinerary-card">
                <div class="itinerary-time-box">
                    <span class="itinerary-day-badge">${item.day}</span>
                    <span class="itinerary-time">${item.time}</span>
                </div>
                <div class="itinerary-info">
                    <div class="itinerary-header">
                        <h4>${item.title}</h4>
                        ${deleteBtn}
                    </div>
                    ${item.location ? `<div class="itinerary-location">📍 ${item.location}</div>` : ""}
                    ${item.description ? `<div class="itinerary-desc">${formatRichText(item.description)}</div>` : ""}
                </div>
            </div>
        `;
    })
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
                <div class="feed-text">${formatRichText(p.text)}</div>
                ${mediaHtml}
            </div>
        `;
    })
    .join("");
}

// Modal Task Actions
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
    alert("Errore di connessione durante l'upload.");
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = "Conferma e Invia 🚀";
  }
};

// Modal Modifica Sfida (Admin)
window.openEditTaskModal = (taskId) => {
  const task = currentTasks.find((t) => t.id === taskId);
  if (!task) return;

  editingTaskId = taskId;
  document.getElementById("editTaskTitleInput").value = task.title;
  document.getElementById("editTaskPointsInput").value = task.points;
  document.getElementById("editTaskModal").style.display = "flex";
};

window.closeEditTaskModal = () => {
  document.getElementById("editTaskModal").style.display = "none";
  editingTaskId = null;
};

window.submitEditTask = () => {
  if (!editingTaskId) return;
  const title = document.getElementById("editTaskTitleInput").value;
  const points = document.getElementById("editTaskPointsInput").value;

  if (!title.trim()) return alert("Inserisci il titolo della sfida");

  socket.emit("admin_edit_task", {
    taskId: editingTaskId,
    title: title,
    points: points,
    adminId: currentUser.id,
  });

  closeEditTaskModal();
};

window.adminDeleteTask = (taskId) => {
  if (confirm("Sei sicuro di voler eliminare questa sfida?")) {
    socket.emit("admin_delete_task", { taskId, adminId: currentUser.id });
  }
};

// GESTIONE CONDANNATI (CREA E MODIFICA)
document
  .getElementById("condPhotoInput")
  .addEventListener("change", function (e) {
    const file = e.target.files[0];
    const preview = document.getElementById("condPhotoPreview");
    if (file) {
      preview.innerHTML = `<img src="${URL.createObjectURL(file)}" style="width:80px; height:80px; border-radius:10px; object-fit:cover;">`;
    }
  });

window.editCondemnedProfile = (condemnedId) => {
  const c = currentCondemned.find((item) => item.id === condemnedId);
  if (!c) return;

  switchTab("admin");

  document.getElementById("adminCondemnedFormTitle").textContent =
    `✏️ Modifica: ${c.name}`;
  document.getElementById("condId").value = c.id;
  document.getElementById("condExistingPhoto").value = c.photo || "";
  document.getElementById("condName").value = c.name || "";
  document.getElementById("condNickname").value = c.nickname || "";
  document.getElementById("condRole").value = c.role || "Sposo";
  document.getElementById("condTeam").value = c.team || "Celibers";
  document.getElementById("condFitMode").value = c.fitMode || "cover-center";
  document.getElementById("condImgHeight").value = c.imgHeight || "260px";

  // Ripristina testo formattato
  document.getElementById("condDesc").value = (c.description || "").replace(
    /<br\s*[\/]?>/gi,
    "\n",
  );
  document.getElementById("condWeakness").value = c.weakness || "";
  document.getElementById("condQuote").value = c.quote || "";

  if (c.photo) {
    document.getElementById("condPhotoPreview").innerHTML =
      `<img src="${c.photo}" style="width:80px; height:80px; border-radius:10px; object-fit:cover;"><small style="display:block; color:var(--text-muted);">Foto attuale</small>`;
  }

  document.getElementById("cancelCondemnedEditBtn").style.display = "block";
  document.getElementById("saveCondemnedBtn").textContent =
    "Salva Modifiche Profilo 💾";
  document
    .getElementById("adminCondemnedCard")
    .scrollIntoView({ behavior: "smooth" });
};

window.resetCondemnedForm = () => {
  document.getElementById("adminCondemnedFormTitle").textContent =
    "👰🤵 Aggiungi o Modifica Condannato";
  document.getElementById("condId").value = "";
  document.getElementById("condExistingPhoto").value = "";
  document.getElementById("condName").value = "";
  document.getElementById("condNickname").value = "";
  document.getElementById("condRole").value = "Sposo";
  document.getElementById("condTeam").value = "Celibers";
  document.getElementById("condFitMode").value = "cover-center";
  document.getElementById("condImgHeight").value = "260px";
  document.getElementById("condDesc").value = "";
  document.getElementById("condWeakness").value = "";
  document.getElementById("condQuote").value = "";
  document.getElementById("condPhotoInput").value = "";
  document.getElementById("condPhotoPreview").innerHTML = "";
  document.getElementById("cancelCondemnedEditBtn").style.display = "none";
  document.getElementById("saveCondemnedBtn").textContent =
    "Salva Profilo Condannato 💾";
};

window.adminSubmitCondemned = async () => {
  const id = document.getElementById("condId").value;
  const existingPhoto = document.getElementById("condExistingPhoto").value;
  const name = document.getElementById("condName").value;
  const nickname = document.getElementById("condNickname").value;
  const role = document.getElementById("condRole").value;
  const team = document.getElementById("condTeam").value;
  const fitMode = document.getElementById("condFitMode").value;
  const imgHeight = document.getElementById("condImgHeight").value;
  const description = document.getElementById("condDesc").value;
  const weakness = document.getElementById("condWeakness").value;
  const quote = document.getElementById("condQuote").value;
  const photoFile = document.getElementById("condPhotoInput").files[0];

  if (!name.trim()) return alert("Inserisci il nome del condannato");

  const btn = document.getElementById("saveCondemnedBtn");
  btn.disabled = true;
  btn.textContent = "Salvataggio in corso...";

  const formData = new FormData();
  formData.append("adminId", currentUser.id);
  if (id) formData.append("id", id);
  if (existingPhoto) formData.append("existingPhoto", existingPhoto);
  formData.append("name", name);
  formData.append("nickname", nickname);
  formData.append("role", role);
  formData.append("team", team);
  formData.append("fitMode", fitMode);
  formData.append("imgHeight", imgHeight);
  formData.append("description", description);
  formData.append("weakness", weakness);
  formData.append("quote", quote);
  if (photoFile) formData.append("photo", photoFile);

  try {
    const res = await fetch("/api/admin/save-condemned", {
      method: "POST",
      body: formData,
    });
    if (res.ok) {
      alert("Profilo salvato con successo!");
      resetCondemnedForm();
      switchTab("condemned");
    } else {
      alert("Errore salvataggio condannato.");
    }
  } catch (e) {
    alert("Errore di connessione.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Salva Profilo Condannato 💾";
  }
};

window.adminDeleteCondemned = (condemnedId) => {
  if (confirm("Vuoi eliminare questo profilo condannato?")) {
    socket.emit("admin_delete_condemned", {
      condemnedId,
      adminId: currentUser.id,
    });
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

// Itinerario
window.setDayFilter = (day) => {
  selectedDayFilter = day;
  renderItinerary();
};

window.adminCreateItinerary = () => {
  const day = document.getElementById("itinDay").value;
  const time = document.getElementById("itinTime").value;
  const title = document.getElementById("itinTitle").value;
  const location = document.getElementById("itinLocation").value;
  const description = document.getElementById("itinDesc").value;

  if (!title.trim()) return alert("Inserisci almeno il titolo dell'attività");

  socket.emit("admin_add_itinerary", {
    day,
    time,
    title,
    location,
    description,
    adminId: currentUser.id,
  });

  document.getElementById("itinDay").value = "";
  document.getElementById("itinTime").value = "";
  document.getElementById("itinTitle").value = "";
  document.getElementById("itinLocation").value = "";
  document.getElementById("itinDesc").value = "";
  alert("Tappa aggiunta all'itinerario!");
};

window.deleteItineraryItem = (itemId) => {
  if (confirm("Vuoi eliminare questa tappa dall'itinerario?")) {
    socket.emit("admin_delete_itinerary", { itemId, adminId: currentUser.id });
  }
};

// Admin Tasks & Points
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

window.deletePost = (postId) => {
  if (confirm("Vuoi eliminare questo post dal feed?")) {
    socket.emit("admin_delete_post", { postId, adminId: currentUser.id });
  }
};

// Feed Send
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

window.switchTab = (tabName) => {
  document
    .querySelectorAll(".tab-panel")
    .forEach((p) => p.classList.remove("active"));
  document
    .querySelectorAll(".nav-item")
    .forEach((btn) => btn.classList.remove("active"));
  document.getElementById(`tab-${tabName}`).classList.add("active");

  const activeBtn = Array.from(document.querySelectorAll(".nav-item")).find(
    (b) => b.getAttribute("onclick")?.includes(tabName),
  );
  if (activeBtn) activeBtn.classList.add("active");
};

window.logout = () => {
  localStorage.removeItem("party_user");
  window.location.href = "/index.html";
};
window.exportDatabaseFile = () => {
  window.location.href = `/api/admin/export-database?adminId=${currentUser.id}`;
};
