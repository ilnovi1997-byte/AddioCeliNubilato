const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

const DB_FILE = path.join(__dirname, "database.json");

// PIN Master per diventare Admin (modificabile da variabile d'ambiente o qui)
const ADMIN_MASTER_PIN = process.env.ADMIN_PIN || "9999";

// Stato iniziale
let data = {
  users: [],
  tasks: [
    {
      id: 1,
      title: "Bevi uno shot senza usare le mani",
      points: 50,
      completedBy: [],
    },
    {
      id: 2,
      title: "Fai un brindisi imbarazzante allo sposo",
      points: 100,
      completedBy: [],
    },
    {
      id: 3,
      title: "Scatta un selfie con uno sconosciuto con occhiali da sole",
      points: 70,
      completedBy: [],
    },
    {
      id: 4,
      title: "Fai cantare una canzone a squarciagola allo sposo",
      points: 80,
      completedBy: [],
    },
    {
      id: 5,
      title: "Offri un bicchiere spiegando le regole del matrimonio",
      points: 120,
      completedBy: [],
    },
  ],
  feed: [
    {
      id: 1,
      user: "Sistema",
      text: "Benvenuti all'Addio al Celibato! 🎉",
      time: "18:00",
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
  } catch (e) {
    console.log("Inizializzazione database predefinito.");
  }
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// API: Login con supporto Admin
app.post("/api/login", (req, res) => {
  const { name, pin, adminCode } = req.body;
  if (!name || !pin) {
    return res.status(400).json({ error: "Inserisci nome e PIN." });
  }

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
    if (user.pin !== cleanPin) {
      return res.status(401).json({ error: "PIN errato per questo nome." });
    }
    // Promozione a admin se inserisce il codice corretto
    if (isAdmin && user.role !== "admin") {
      user.role = "admin";
      saveDatabase();
    }
  }

  res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      points: user.points,
      role: user.role,
    },
  });
});

// Socket.io Real-Time
io.on("connection", (socket) => {
  socket.emit("init_data", {
    tasks: data.tasks,
    users: data.users.map((u) => ({
      id: u.id,
      name: u.name,
      points: u.points,
      role: u.role,
    })),
    feed: data.feed,
  });

  // Completamento sfida
  socket.on("complete_task", ({ userId, taskId }) => {
    const user = data.users.find((u) => u.id === userId);
    const task = data.tasks.find((t) => t.id === taskId);

    if (user && task && !task.completedBy.includes(userId)) {
      task.completedBy.push(userId);
      user.points += task.points;

      const autoPost = {
        id: Date.now(),
        user: "🏆 Sfida Completata",
        text: `${user.name} ha completato "${task.title}" (+${task.points} pt)!`,
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      data.feed.unshift(autoPost);
      saveDatabase();

      io.emit(
        "update_scoreboard",
        data.users.map((u) => ({
          id: u.id,
          name: u.name,
          points: u.points,
          role: u.role,
        })),
      );
      io.emit("update_tasks", data.tasks);
      io.emit("broadcast_post", autoPost);
    }
  });

  // AZIONI RISERVATE ADMIN: Aggiungi nuova sfida live
  socket.on("admin_add_task", ({ title, points, adminId }) => {
    const adminUser = data.users.find((u) => u.id === adminId);
    if (!adminUser || adminUser.role !== "admin") return;

    const newTask = {
      id: Date.now(),
      title: title.trim(),
      points: parseInt(points, 10) || 50,
      completedBy: [],
    };
    data.tasks.push(newTask);

    const autoPost = {
      id: Date.now() + 1,
      user: "⚡ Nuova Sfida Admin",
      text: `Nuova prova aggiunta: "${newTask.title}" (+${newTask.points} pt)!`,
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
    data.feed.unshift(autoPost);
    saveDatabase();

    io.emit("update_tasks", data.tasks);
    io.emit("broadcast_post", autoPost);
  });

  // AZIONI RISERVATE ADMIN: Assegna punti manuali
  socket.on("admin_give_points", ({ targetUserId, amount, adminId }) => {
    const adminUser = data.users.find((u) => u.id === adminId);
    const target = data.users.find((u) => u.id === targetUserId);
    if (!adminUser || adminUser.role !== "admin" || !target) return;

    target.points += parseInt(amount, 10) || 0;
    saveDatabase();
    io.emit(
      "update_scoreboard",
      data.users.map((u) => ({
        id: u.id,
        name: u.name,
        points: u.points,
        role: u.role,
      })),
    );
  });

  // Nuovo post
  socket.on("new_post", ({ user, text }) => {
    if (!text || !text.trim()) return;
    const post = {
      id: Date.now(),
      user: user || "Anonimo",
      text: text.trim(),
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
    data.feed.unshift(post);
    if (data.feed.length > 50) data.feed.pop();

    saveDatabase();
    io.emit("broadcast_post", post);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server attivo sulla porta ${PORT}`);
});
