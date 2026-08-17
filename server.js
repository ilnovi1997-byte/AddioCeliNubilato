const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database leggero in-memory / JSON
let data = {
    users: [], // { id, name, pin, points, role }
    tasks: [
        { id: 1, title: 'Bevi uno shot senza usare le mani', points: 50, completedBy: [] },
        { id: 2, title: 'Fai una foto con un sosia dello sposo', points: 100, completedBy: [] }
    ],
    feed: [] // { id, user, text, timestamp }
};

// API: Registrazione / Accesso semplice con PIN
app.post('/api/login', (req, res) => {
    const { name, pin } = req.body;
    if (!name || !pin) return res.status(400).json({ error: 'Dati mancanti' });

    let user = data.users.find(u => u.name.toLowerCase() === name.toLowerCase());
    if (!user) {
        // Registra nuovo utente
        user = { id: Date.now().toString(), name, pin, points: 0, role: name.toLowerCase() === 'sposo' ? 'groom' : 'guest' };
        data.users.push(user);
    } else if (user.pin !== pin) {
        return res.status(401).json({ error: 'PIN errato' });
    }

    res.json({ success: true, user });
});

// Gestione Real-time (Socket.io)
io.on('connection', (socket) => {
    // Invia stato iniziale
    socket.emit('init_data', { tasks: data.tasks, users: data.users, feed: data.feed });

    // Completamento sfida
    socket.on('complete_task', ({ userId, taskId }) => {
        const user = data.users.find(u => u.id === userId);
        const task = data.tasks.find(t => t.id === taskId);

        if (user && task && !task.completedBy.includes(userId)) {
            task.completedBy.push(userId);
            user.points += task.points;
            
            io.emit('update_scoreboard', data.users);
            io.emit('update_tasks', data.tasks);
        }
    });

    // Messaggio o post live
    socket.on('new_post', ({ user, text }) => {
        const post = { id: Date.now(), user, text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
        data.feed.unshift(post);
        io.emit('broadcast_post', post);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server attivo su http://localhost:${PORT}`));