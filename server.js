const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { google } = require("googleapis");
const { Readable } = require("stream");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const DB_FILE = path.join(__dirname, "database.json");
const ADMIN_MASTER_PIN = process.env.ADMIN_PIN || "9999";
const GDRIVE_FOLDER_ID = process.env.GDRIVE_FOLDER_ID || "";

// Multer in memoria
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024 },
});

// Configurazione Google Drive API
let driveClient = null;
try {
  let credentials;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } else if (fs.existsSync(path.join(__dirname, "google-credentials.json"))) {
    credentials = JSON.parse(
      fs.readFileSync(path.join(__dirname, "google-credentials.json"), "utf-8"),
    );
  }

  if (credentials) {
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/drive"],
    });
    driveClient = google.drive({ version: "v3", auth });
    console.log("✅ Google Drive API autenticata con successo.");
  } else {
    console.warn(
      "⚠️ Credenziali Google non trovate. I file non verranno salvati su Drive.",
    );
  }
} catch (err) {
  console.error("Errore setup Google Drive:", err.message);
}

// Funzione helper upload Drive
async function uploadFileToDrive(fileBuffer, originalName, mimeType) {
  if (!driveClient || !GDRIVE_FOLDER_ID) {
    throw new Error("Google Drive non configurato");
  }

  const ext = path.extname(originalName).toLowerCase();
  const fileName = `media_${Date.now()}_${Math.random().toString(36).substr(2, 5)}${ext}`;

  const stream = new Readable();
  stream.push(fileBuffer);
  stream.push(null);

  const response = await driveClient.files.create({
    requestBody: {
      name: fileName,
      parents: [GDRIVE_FOLDER_ID],
    },
    media: {
      mimeType: mimeType,
      body: stream,
    },
    fields: "id, name, webViewLink, webContentLink",
  });

  // Rendi il file leggibile pubblicamente dall'app
  try {
    await driveClient.permissions.create({
      fileId: response.data.id,
      requestBody: { role: "reader", type: "anyone" },
    });
  } catch (permErr) {
    console.warn("Permesso pubblico non applicato:", permErr.message);
  }

  return response.data.id;
}

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
    data = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
  } catch (e) {
    console.log("Inizializzazione database di default.");
  }
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Endpoint Proxy per servire foto e video da Google Drive in streaming diretto
// Endpoint Proxy ottimizzato per streaming immagini e video da Google Drive
// Endpoint Proxy ottimizzato per streaming immagini e video da Google Drive
app.get("/api/media/:fileId", async (req, res) => {
  if (!driveClient) return res.status(503).send("Google Drive non configurato");

  try {
    const fileId = req.params.fileId;

    // 1. Recupera i metadati per impostare il Content-Type corretto
    const meta = await driveClient.files.get({
      fileId: fileId,
      fields: "mimeType, size",
    });

    res.setHeader(
      "Content-Type",
      meta.data.mimeType || "application/octet-stream",
    );
    if (meta.data.size) {
      res.setHeader("Content-Length", meta.data.size);
    }
    res.setHeader("Cache-Control", "public, max-age=86400"); // Cache 24h per velocizzare il caricamento

    // 2. Esegui lo stream del file
    const driveRes = await driveClient.files.get(
      { fileId: fileId, alt: "media" },
      { responseType: "stream" },
    );

    driveRes.data.pipe(res);
  } catch (err) {
    console.error("Errore recupero media da Drive:", err.message);
    res.status(404).send("Media non trovato");
  }
});
app.post("/api/login", (req, res) => {
  const { name, pin, adminCode } = req.body;
  if (!name || !pin) return res.status(400).json({ error: "Dati mancanti" });

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
      return res.status(401).json({ error: "PIN errato" });
    if (isAdmin && user.role !== "admin") {
      user.role = "admin";
      saveDatabase();
    }
  }

  res.json({ success: true, user });
});

app.post("/api/select-team", (req, res) => {
  const { userId, team } = req.body;
  const user = data.users.find((u) => u.id === userId);
  if (!user) return res.status(404).json({ error: "Utente non trovato" });

  user.team = team;
  saveDatabase();
  io.emit("update_scoreboard", { teams: data.teams, users: data.users });
  res.json({ success: true, user });
});

// Upload Prova + Salvataggio su Google Drive
app.post("/api/complete-task", upload.single("media"), async (req, res) => {
  const { userId, taskId } = req.body;
  const user = data.users.find((u) => u.id === userId);
  const task = data.tasks.find((t) => t.id === parseInt(taskId, 10));

  if (!user || !task || !user.team) {
    return res.status(400).json({ error: "Richiesta non valida" });
  }

  let mediaObj = null;

  if (req.file) {
    try {
      const driveFileId = await uploadFileToDrive(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
      );
      const isVideo = req.file.mimetype.startsWith("video");
      mediaObj = {
        url: `/api/media/${driveFileId}`,
        type: isVideo ? "video" : "image",
      };
    } catch (driveErr) {
      console.error("Errore caricamento su Google Drive:", driveErr.message);
    }
  }

  user.points += task.points;
  data.teams[user.team].points += task.points;

  const post = {
    id: Date.now(),
    user: `${user.name} (${user.team})`,
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
      points: u.points,
      role: u.role,
    })),
  });
  io.emit("broadcast_post", post);

  res.json({ success: true, post });
});

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

  socket.on("admin_give_team_points", ({ team, amount, adminId }) => {
    const admin = data.users.find((u) => u.id === adminId);
    if (!admin || admin.role !== "admin" || !data.teams[team]) return;

    data.teams[team].points += parseInt(amount, 10) || 0;
    saveDatabase();
    io.emit("update_scoreboard", { teams: data.teams, users: data.users });
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
