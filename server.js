const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Assicura l'esistenza della cartella uploads
const UPLOADS_DIR = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Configurazione storage Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName =
      "media_" +
      Date.now() +
      "_" +
      Math.random().toString(36).substr(2, 6) +
      ext;
    cb(null, uniqueName);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 40 * 1024 * 1024 }, // Limite 40MB per video brevi/foto HD
});

const DB_FILE = path.join(__dirname, "database.json");
const ADMIN_MASTER_PIN = process.env.ADMIN_PIN || "9999";

let data = {
  teams: {
    Nubilers: { name: "Nubilers", color: "#ff007a", points: 0 },
    Celibers: { name: "Celibers", color: "#00d2ff", points: 0 },
  },
  users: [],
  tasks: [
    { id: 1, title: "Bevi uno shot senza usare le mani", points: 50 },
    { id: 2, title: "Fai un brindisi imbarazzante allo sposo", points: 100 },
    {
      id: 3,
      title: "Scatta un selfie con uno sconosciuto con occhiali da sole",
      points: 70,
    },
    {
      id: 4,
      title: "Fai cantare una canzone a squarciagola allo sposo",
      points: 80,
    },
    {
      id: 5,
      title: "Offri un drink a uno sconosciuto spiegando il matrimonio",
      points: 120,
    },
  ],
  feed: [
    {
      id: 1,
      user: "Sistema",
      text: "Benvenuti alla sfida Nubilers vs Celibers! 🔥",
      time: "18:00",
      team: null,
      media: null,
    },
  ],
};

function saveDatabase() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Errore salvataggio database:", err);
  }
}

if (fs.existsSync(DB_FILE)) {
  try {
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    data = JSON.parse(raw);
    if (!data.teams) {
      data.teams = {
        Nubilers: { name: "Nubilers", color: "#ff007a", points: 0 },
        Celibers: { name: "Celibers", color: "#00d2ff", points: 0 },
      };
    }
  } catch (e) {
    console.log("Inizializzazione database predefinito.");
  }
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// API: Login
app.post("/api/login", (req, res) => {
  const { name, pin, adminCode } = req.body;
  if (!name || !pin)
    return res.status(400).json({ error: "Inserisci nome e PIN." });

  const cleanName = name.trim();
  const cleanPin = pin.trim();
  const isAdmin = adminCode && adminCode.trim() === ADMIN_MASTER_PIN;

  let user = data.users.find(
    (u) => u.name.toLowerCase() === cleanName.toLowerCase(),
  );

  if (!user) {
    user = {
      id: "u_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
      name: cleanName,
      pin: cleanPin,
      team: null,
      points: 0,
      role: isAdmin
        ? "admin"
        : cleanName.toLowerCase() === "sposo"
          ? "groom"
          : "guest",
    };
    data.users.push(user);
    saveDatabase();
  } else {
    if (user.pin !== cleanPin)
      return res.status(401).json({ error: "PIN errato." });
    if (isAdmin && user.role !== "admin") {
      user.role = "admin";
      saveDatabase();
    }
  }

  res.json({ success: true, user });
});

// API: Selezione Squadra
app.post("/api/select-team", (req, res) => {
  const { userId, team } = req.body;
  if (!["Nubilers", "Celibers"].includes(team))
    return res.status(400).json({ error: "Squadra non valida." });

  const user = data.users.find((u) => u.id === userId);
  if (!user) return res.status(404).json({ error: "Utente non trovato." });

  user.team = team;
  saveDatabase();

  io.emit("update_scoreboard", { teams: data.teams, users: data.users });
  res.json({ success: true, user });
});

// API: Completamento Sfida con Upload Foto/Video Opzionale
app.post("/api/complete-task", upload.single("media"), (req, res) => {
  const { userId, taskId } = req.body;
  const user = data.users.find((u) => u.id === userId);
  const task = data.tasks.find((t) => t.id === parseInt(taskId, 10));

  if (!user || !task || !user.team) {
    return res.status(400).json({ error: "Richiesta non valida." });
  }

  user.points += task.points;
  data.teams[user.team].points += task.points;

  let mediaObj = null;
  if (req.file) {
    const isVideo = req.file.mimetype.startsWith("video");
    mediaObj = {
      url: "/uploads/" + req.file.filename,
      type: isVideo ? "video" : "image",
    };
  }

  const post = {
    id: Date.now(),
    user: `${user.name} (${user.team})`,
    text: `ha completato "${task.title}" (+${task.points} pt per ${user.team})! 📸`,
    time: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    team: user.team,
    media: mediaObj,
  };

  data.feed.unshift(post);
  if (data.feed.length > 80) data.feed.pop();

  saveDatabase();

  io.emit("update_scoreboard", {
    teams: data.teams,
    users: data.users.map((u) => ({
      id: u.id,
      name: u.name,
      team: u.team,
      points: u.points,
      role: u.role,
    })),
  });
  io.emit("broadcast_post", post);

  res.json({
    success: true,
    post,
    userPoints: user.points,
    teamPoints: data.teams[user.team].points,
  });
});

// Socket.io Real-Time
io.on("connection", (socket) => {
  socket.emit("init_data", {
    teams: data.teams,
    tasks: data.tasks,
    users: data.users.map((u) => ({
      id: u.id,
      name: u.name,
      team: u.team,
      points: u.points,
      role: u.role,
    })),
    feed: data.feed,
  });

  socket.on("admin_add_task", ({ title, points, adminId }) => {
    const adminUser = data.users.find((u) => u.id === adminId);
    if (!adminUser || adminUser.role !== "admin") return;

    const newTask = {
      id: Date.now(),
      title: title.trim(),
      points: parseInt(points, 10) || 50,
    };
    data.tasks.push(newTask);
    saveDatabase();
    io.emit("update_tasks", data.tasks);
  });

  socket.on("admin_give_team_points", ({ team, amount, adminId }) => {
    const adminUser = data.users.find((u) => u.id === adminId);
    if (!adminUser || adminUser.role !== "admin" || !data.teams[team]) return;

    data.teams[team].points += parseInt(amount, 10) || 0;
    saveDatabase();
    io.emit("update_scoreboard", {
      teams: data.teams,
      users: data.users.map((u) => ({
        id: u.id,
        name: u.name,
        team: u.team,
        points: u.points,
        role: u.role,
      })),
    });
  });

  socket.on("new_post", ({ user, text, team }) => {
    if (!text || !text.trim()) return;
    const post = {
      id: Date.now(),
      user: user || "Anonimo",
      text: text.trim(),
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      team: team || null,
      media: null,
    };
    data.feed.unshift(post);
    saveDatabase();
    io.emit("broadcast_post", post);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () =>
  console.log(`Server attivo sulla porta ${PORT}`),
);
