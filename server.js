const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const DB_FILE = path.join(__dirname, "database.json");
const ADMIN_MASTER_PIN = process.env.ADMIN_PIN || "9999";

// Configurazione Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer in memoria RAM
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024 },
});

function uploadToCloudinary(buffer, isVideo, folder = "addio_celibato") {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: isVideo ? "video" : "image",
        folder: folder,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      },
    );
    uploadStream.end(buffer);
  });
}

let data = {
  teams: {
    Nubilers: { name: "Nubilers", color: "#ff007a", points: 0 },
    Celibers: { name: "Celibers", color: "#00d2ff", points: 0 },
  },
  users: [],
  itinerary: [
    {
      id: 1,
      day: "Giorno 1",
      time: "18:30",
      title: "Ritrovo & Brindisi di Benvenuto",
      description:
        "Incontro al punto base, consegna magliette e primo shot di rito.",
      location: "Base / Hotel",
    },
    {
      id: 2,
      day: "Giorno 1",
      time: "21:00",
      title: "Cena & Inizio Clash",
      description:
        "Cena tutti insieme e apertura ufficiale delle sfide Nubilers vs Celibers.",
      location: "Ristorante Centro",
    },
    {
      id: 3,
      day: "Giorno 2",
      time: "11:00",
      title: "Attività a Sorpresa",
      description:
        "Outfit comodo e occhiali da sole, vietato fare domande allo sposo!",
      location: "Location Segreta",
    },
  ],
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
      avatar: null,
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
    data = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    if (!data.teams) {
      data.teams = {
        Nubilers: { name: "Nubilers", color: "#ff007a", points: 0 },
        Celibers: { name: "Celibers", color: "#00d2ff", points: 0 },
      };
    }
    if (!data.itinerary) data.itinerary = [];
    if (!data.tasks) data.tasks = [];
  } catch (e) {
    console.log("Inizializzazione database predefinito.");
  }
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Login
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
      avatar: null,
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

// Selezione Squadra
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

// Upload Immagine Profilo
app.post("/api/upload-avatar", upload.single("avatar"), async (req, res) => {
  const { userId } = req.body;
  const user = data.users.find((u) => u.id === userId);

  if (!user) return res.status(404).json({ error: "Utente non trovato." });
  if (!req.file)
    return res.status(400).json({ error: "Nessun file selezionato." });

  try {
    const result = await uploadToCloudinary(
      req.file.buffer,
      false,
      "addio_celibato/avatars",
    );
    user.avatar = result.secure_url;
    saveDatabase();

    io.emit("update_scoreboard", { teams: data.teams, users: data.users });
    res.json({ success: true, avatarUrl: user.avatar, user });
  } catch (err) {
    console.error("Errore upload avatar Cloudinary:", err);
    res
      .status(500)
      .json({ error: "Errore durante il caricamento dell'immagine profilo." });
  }
});

// Completamento Sfida con Upload Prova
app.post("/api/complete-task", upload.single("media"), async (req, res) => {
  const { userId, taskId } = req.body;
  const user = data.users.find((u) => u.id === userId);
  const task = data.tasks.find((t) => t.id === parseInt(taskId, 10));

  if (!user || !task || !user.team) {
    return res.status(400).json({ error: "Richiesta non valida." });
  }

  let mediaObj = null;

  if (req.file) {
    const isVideo = req.file.mimetype.startsWith("video");
    try {
      const result = await uploadToCloudinary(
        req.file.buffer,
        isVideo,
        "addio_celibato/sfide",
      );
      mediaObj = {
        url: result.secure_url,
        type: isVideo ? "video" : "image",
      };
    } catch (err) {
      console.error("Errore Cloudinary:", err.message);
    }
  }

  user.points += task.points;
  data.teams[user.team].points += task.points;

  const post = {
    id: Date.now(),
    user: `${user.name} (${user.team})`,
    avatar: user.avatar || null,
    text: `ha completato "${task.title}" (+${task.points} pt per ${user.team})! 🎯`,
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
      avatar: u.avatar,
      points: u.points,
      role: u.role,
    })),
  });
  io.emit("broadcast_post", post);

  res.json({ success: true, post });
});

// Socket.io Real-Time
io.on("connection", (socket) => {
  socket.emit("init_data", {
    teams: data.teams,
    itinerary: data.itinerary || [],
    tasks: data.tasks,
    users: data.users.map((u) => ({
      id: u.id,
      name: u.name,
      team: u.team,
      avatar: u.avatar,
      points: u.points,
      role: u.role,
    })),
    feed: data.feed,
  });

  // Admin: Aggiungi Sfida
  socket.on("admin_add_task", ({ title, points, adminId }) => {
    const admin = data.users.find((u) => u.id === adminId);
    if (!admin || admin.role !== "admin") return;

    data.tasks.push({
      id: Date.now(),
      title: title.trim(),
      points: parseInt(points, 10) || 50,
    });
    saveDatabase();
    io.emit("update_tasks", data.tasks);
  });

  // Admin: Modifica Sfida
  socket.on("admin_edit_task", ({ taskId, title, points, adminId }) => {
    const admin = data.users.find((u) => u.id === adminId);
    if (!admin || admin.role !== "admin") return;

    const task = data.tasks.find((t) => t.id === taskId);
    if (task) {
      task.title = title.trim();
      task.points = parseInt(points, 10) || task.points;
      saveDatabase();
      io.emit("update_tasks", data.tasks);
    }
  });

  // Admin: Elimina Sfida
  socket.on("admin_delete_task", ({ taskId, adminId }) => {
    const admin = data.users.find((u) => u.id === adminId);
    if (!admin || admin.role !== "admin") return;

    data.tasks = data.tasks.filter((t) => t.id !== taskId);
    saveDatabase();
    io.emit("update_tasks", data.tasks);
  });

  // Admin: Punti Squadra
  socket.on("admin_give_team_points", ({ team, amount, adminId }) => {
    const admin = data.users.find((u) => u.id === adminId);
    if (!admin || admin.role !== "admin" || !data.teams[team]) return;

    data.teams[team].points += parseInt(amount, 10) || 0;
    saveDatabase();
    io.emit("update_scoreboard", { teams: data.teams, users: data.users });
  });

  // Admin: Moderazione Feed
  socket.on("admin_delete_post", ({ postId, adminId }) => {
    const adminUser = data.users.find((u) => u.id === adminId);
    if (!adminUser || adminUser.role !== "admin") return;

    data.feed = data.feed.filter((p) => p.id !== postId);
    saveDatabase();
    io.emit("feed_updated", data.feed);
  });

  // Admin: Itinerario
  socket.on(
    "admin_add_itinerary",
    ({ day, time, title, description, location, adminId }) => {
      const admin = data.users.find((u) => u.id === adminId);
      if (!admin || admin.role !== "admin") return;

      if (!data.itinerary) data.itinerary = [];

      const newItem = {
        id: Date.now(),
        day: day.trim() || "Giorno 1",
        time: time.trim() || "12:00",
        title: title.trim(),
        description: (description || "").trim(),
        location: (location || "").trim(),
      };

      data.itinerary.push(newItem);
      saveDatabase();
      io.emit("update_itinerary", data.itinerary);
    },
  );

  socket.on("admin_delete_itinerary", ({ itemId, adminId }) => {
    const admin = data.users.find((u) => u.id === adminId);
    if (!admin || admin.role !== "admin") return;

    data.itinerary = (data.itinerary || []).filter(
      (item) => item.id !== itemId,
    );
    saveDatabase();
    io.emit("update_itinerary", data.itinerary);
  });

  // Feed Post
  socket.on("new_post", ({ userId, user, text, team }) => {
    if (!text || !text.trim()) return;
    const author = data.users.find((u) => u.id === userId);
    const post = {
      id: Date.now(),
      user: user || "Anonimo",
      avatar: author ? author.avatar : null,
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
