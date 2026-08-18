const socket = io();
const localUser = JSON.parse(localStorage.getItem("party_user") || "null");

if (!localUser) {
  window.location.href = "/index.html";
}

let currentUser = localUser;
let currentTasks = [];
let currentUsers = [];
let currentFeed = [];

// Header e Badge
document.getElementById("userName").textContent = currentUser.name;
document.getElementById("myPoints").textContent = currentUser.points || 0;

if (currentUser.role === "admin") {
  document.getElementById("userRole").textContent = "⚡ Organizzatore";
  document.getElementById("avatarIcon").textContent = "🕶️";
  document.getElementById("adminTabBtn").style.display = "flex";
} else if (currentUser.role === "groom") {
  document.getElementById("userRole").textContent = "👑 Lo Sposo";
  document.getElementById("avatarIcon").textContent = "🤴";
} else {
  document.getElementById("userRole").textContent = "Membro";
}

socket.on("init_data", (data) => {
  currentTasks = data.tasks;
  currentUsers = data.users;
  currentFeed = data.feed;

  renderTasks();
  renderRanking();
  renderFeed();
  populateAdminUserSelect();
});

socket.on("update_tasks", (tasks) => {
  currentTasks = tasks;
  renderTasks();
});

socket.on("update_scoreboard", (users) => {
  currentUsers = users;
  renderRanking();
  populateAdminUserSelect();
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

function renderTasks() {
  const container = document.getElementById("taskList");
  container.innerHTML = currentTasks
    .map((t) => {
      const isDone = t.completedBy.includes(currentUser.id);
      return `
            <div class="task-card ${isDone ? "completed" : ""}">
                <div class="task-content">
                    <h4>${t.title}</h4>
                    <span class="task-points">+${t.points} PUNTI</span>
                </div>
                <button class="btn-task" ${isDone ? "disabled" : ""} onclick="completeTask(${t.id})">
                    ${isDone ? "Fatto ✓" : "Completa"}
                </button>
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
      const medals = ["🥇", "🥈", "🥉"];
      const medal = idx < 3 ? medals[idx] : `#${idx + 1}`;
      const isMe = u.id === currentUser.id;

      return `
            <div class="ranking-card ${idx === 0 ? "rank-1" : ""}" style="${isMe ? "border-color: #ff007a;" : ""}">
                <span class="rank-position">${medal}</span>
                <span class="rank-name">${u.name} ${u.role === "groom" ? "👑" : ""} ${u.role === "admin" ? "⚡" : ""} ${isMe ? "(Tu)" : ""}</span>
                <span class="rank-points">${u.points} pt</span>
            </div>
        `;
    })
    .join("");
}

function renderFeed() {
  const container = document.getElementById("feedList");
  container.innerHTML = currentFeed
    .map(
      (p) => `
        <div class="feed-card">
            <div class="feed-card-header">
                <span class="feed-user">${p.user}</span>
                <span>${p.time}</span>
            </div>
            <div class="feed-text">${p.text}</div>
        </div>
    `,
    )
    .join("");
}

function populateAdminUserSelect() {
  const select = document.getElementById("targetUserSelect");
  if (!select) return;
  select.innerHTML = currentUsers
    .map((u) => `<option value="${u.id}">${u.name} (${u.points} pt)</option>`)
    .join("");
}

window.completeTask = (taskId) => {
  socket.emit("complete_task", {
    userId: currentUser.id,
    taskId: taskId,
  });
};

// Funzioni Admin
window.adminCreateTask = () => {
  const titleInput = document.getElementById("newTaskTitle");
  const pointsInput = document.getElementById("newTaskPoints");
  if (!titleInput.value.trim()) return;

  socket.emit("admin_add_task", {
    title: titleInput.value,
    points: pointsInput.value,
    adminId: currentUser.id,
  });

  titleInput.value = "";
  alert("Sfida aggiunta con successo!");
};

window.adminAssignPoints = () => {
  const targetUserId = document.getElementById("targetUserSelect").value;
  const amount = document.getElementById("bonusPoints").value;
  if (!amount) return;

  socket.emit("admin_give_points", {
    targetUserId,
    amount,
    adminId: currentUser.id,
  });

  document.getElementById("bonusPoints").value = "";
  alert("Punti aggiornati!");
};

// Invio post feed
document.getElementById("feedSendBtn").addEventListener("click", sendFeedPost);
document.getElementById("feedInput").addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendFeedPost();
});

function sendFeedPost() {
  const input = document.getElementById("feedInput");
  const text = input.value.trim();
  if (!text) return;

  socket.emit("new_post", {
    user: currentUser.name,
    text: text,
  });
  input.value = "";
}

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
