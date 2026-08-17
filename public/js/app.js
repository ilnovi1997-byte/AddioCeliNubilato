const socket = io();
const user = JSON.parse(localStorage.getItem("party_user") || "null");

if (!user) {
  window.location.href = "/index.html";
}

document.getElementById("userName").textContent = user.name;

// Ricezione dati iniziali
socket.on("init_data", (data) => {
  renderTasks(data.tasks);
  renderRanking(data.users);
  renderFeed(data.feed);
});

// Aggiornamenti real-time
socket.on("update_tasks", (tasks) => renderTasks(tasks));
socket.on("update_scoreboard", (users) => {
  renderRanking(users);
  const me = users.find((u) => u.id === user.id);
  if (me)
    document.getElementById("userPoints").textContent = `${me.points} Punti`;
});
socket.on("broadcast_post", (post) => {
  const feed = document.getElementById("feedList");
  const el = document.createElement("div");
  el.className = "post-item";
  el.innerHTML = `<strong>${post.user}:</strong> ${post.text} <small>${post.time}</small>`;
  feed.prepend(el);
});

function renderTasks(tasks) {
  const list = document.getElementById("taskList");
  list.innerHTML = tasks
    .map((t) => {
      const done = t.completedBy.includes(user.id);
      return `
            <li class="card-item ${done ? "done" : ""}">
                <div>
                    <strong>${t.title}</strong>
                    <p>+${t.points} pt</p>
                </div>
                <button onclick="completeTask(${t.id})" ${done ? "disabled" : ""}>
                    ${done ? "Fatto ✓" : "Completa"}
                </button>
            </li>
        `;
    })
    .join("");
}

function renderRanking(users) {
  const list = document.getElementById("rankingList");
  const sorted = [...users].sort((a, b) => b.points - a.points);
  list.innerHTML = sorted
    .map(
      (u) => `<li><span>${u.name}</span> <strong>${u.points} pt</strong></li>`,
    )
    .join("");
}

function renderFeed(feed) {
  const list = document.getElementById("feedList");
  list.innerHTML = feed
    .map(
      (p) =>
        `<div class="post-item"><strong>${p.user}:</strong> ${p.text} <small>${p.time}</small></div>`,
    )
    .join("");
}

window.completeTask = (taskId) => {
  socket.emit("complete_task", { userId: user.id, taskId });
};

document.getElementById("sendPostBtn").onclick = () => {
  const input = document.getElementById("postInput");
  if (input.value.trim()) {
    socket.emit("new_post", { user: user.name, text: input.value });
    input.value = "";
  }
};

window.switchTab = (tabId) => {
  document
    .querySelectorAll(".tab-content")
    .forEach((el) => el.classList.remove("active"));
  document
    .querySelectorAll(".nav-tabs button")
    .forEach((el) => el.classList.remove("active"));
  document.getElementById(`tab-${tabId}`).classList.add("active");
  event.target.classList.add("active");
};
