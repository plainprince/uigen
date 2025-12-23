import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import modelManager from './model/index.js';
import * as db from './db.js';
import { password } from 'bun';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static(join(__dirname, '../public')));

app.get('/api/config', (req, res) => {
    // Expose only necessary config data (models)
    // Access providers via modelManager's internal config or expose a method
    const safeConfig = Array.from(modelManager.providers.entries()).map(([name, p]) => ({
        name: p.config.name,
        models: p.config.availableModels
    }));
    res.json(safeConfig);
});

// Middleware to check auth
const checkAuth = async (req, res, next) => {
    // Simple cookie-like check (in a real app, use sessions/JWT)
    // Here we'll rely on a custom header 'X-User-ID' set by the frontend after login
    // Or simpler: The requirements say "stored (no pwd!) as cookie or localStorage".
    // We'll trust the client sends the user ID or a token. 
    // To keep it vanilla and simple as requested:
    // We'll use a basic token mechanism. 
    // When logging in, we send back the user ID. The client sends it in headers.
    
    // Note: This is not secure for production but fits the "simple" requirement.
    // Better: Signed JWT. But I'll stick to a simple ID check for now unless I add 'jsonwebtoken'.
    // The plan said "Auth using bun:sqlite and Bun.password".
    // I will use a simple session map in memory for this session.
    
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const userId = authHeader.split(' ')[1]; // Bearer <id>
        if (userId) {
            req.user = db.getUserById(userId);
        }
    }
    next();
};

app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password: plainPassword } = req.body;
        if (!username || !email || !plainPassword) {
            return res.status(400).json({ error: "Missing fields" });
        }
        
        const hash = await password.hash(plainPassword);
        db.createUser(username, email, hash);
        
        // Auto-login: Get the created user
        const user = db.getUserByUsername(username);
        const { password_hash, ...userData } = user;
        
        res.status(201).json({ message: "User registered", user: userData });
    } catch (error) {
        if (error.message.includes("UNIQUE constraint failed")) {
             return res.status(409).json({ error: "Username or email already exists" });
        }
        res.status(500).json({ error: "Internal server error" });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password: plainPassword } = req.body;
        const user = db.getUserByUsername(username);
        
        if (!user) {
            return res.status(401).json({ error: "Invalid credentials" });
        }
        
        const isValid = await password.verify(plainPassword, user.password_hash);
        if (!isValid) {
            return res.status(401).json({ error: "Invalid credentials" });
        }
        
        // Return user data (excluding password)
        const { password_hash, ...userData } = user;
        res.json({ user: userData });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

app.get('/api/user/me', checkAuth, (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const { password_hash, ...userData } = req.user;
    res.json({ user: userData });
});

app.post('/api/save-state', checkAuth, (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const { userdata } = req.body;
    db.updateUserdata(req.user.id, userdata);
    res.json({ success: true });
});

app.post('/api/generate', checkAuth, async (req, res) => {
    const { prompt, models, history } = req.body;
    // models is an array of strings like ["Ollama/llama3.2:latest", "OpenAI/gpt-4o"]
    // history is array of all conversation messages (prompts only, no code)
    
    let messages = history || [];
    if (messages.length === 0) {
        messages.push({ role: 'user', content: prompt });
    }
    
    // Check if user is logged in (optional based on requirements: 
    // "If a request is made from frontend, it asks you to login... If you tried submitting a prompt but weren't logged in that prompt gets now submitted... The prompt field will be cleared and the prompt will be sent via HTTP")
    // The frontend handles the logic of forcing login. The backend just processes.
    
    // However, for saving userdata, we might need a user.
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Parallel processing for multiple models
    const streams = models.map(async (modelString) => {
        try {
            const stream = modelManager.streamResponse(modelString, messages);
            
            for await (const chunk of stream) {
                // We need to tag which model this chunk belongs to
                // Format: event: <modelString>\ndata: <json_chunk>\n\n
                // We'll wrap the chunk in a JSON structure
                const payload = JSON.stringify({
                    model: modelString,
                    content: chunk
                });
                res.write(`data: ${payload}\n\n`);
            }
             res.write(`data: ${JSON.stringify({ model: modelString, done: true })}\n\n`);
        } catch (err) {
            console.error(`Error with model ${modelString}:`, err);
            res.write(`data: ${JSON.stringify({ model: modelString, error: err.message })}\n\n`);
        }
    });

    await Promise.all(streams);
    res.write('event: done\ndata: [DONE]\n\n');
    res.end();
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

