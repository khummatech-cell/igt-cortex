const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const moment = require('moment');
// const geoip = require('geoip-lite'); // Uncomment if you install it, utilizing mock for demo

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- MOCK DATABASE (In Production, use MongoDB/PostgreSQL) ---
let users = [];        // { id, email, password, role, orgID, permissions, name, avatar }
let orgs = [];         // { id, name, ownerID, properties: [] }
let properties = [];   // { id, name, orgID, url }
let contacts = [];     // { id, email, name, propertyID, source, lastSeen }
let chats = {};        // Active sessions
let activityLog = [];  // For Super Admin "Packet Tracing"

// Super Admin Account (Hardcoded)
users.push({
    id: 'ADMIN-001', name: 'Super Admin', email: 'admin@igt.co.za', 
    password: 'admin', role: 'super_admin', orgID: null, permissions: ['all']
});

// --- HELPER FUNCTIONS ---
function logActivity(type, desc, entityID) {
    activityLog.unshift({ 
        time: new Date(), type, desc, entityID, 
        ip: '192.168.1.1' // In real app, req.ip
    });
}

function getGeo(ip) {
    // In real app: return geoip.lookup(ip);
    return { country: "South Africa", city: "Pretoria", timezone: "Africa/Johannesburg" };
}

// --- REST API ROUTES ---

// 1. AUTHENTICATION
app.post('/api/auth/signup', (req, res) => {
    const { name, email, password, orgName } = req.body;
    if(users.find(u => u.email === email)) return res.status(400).json({error: "Email exists"});

    const orgID = "ORG-" + Math.random().toString(36).substr(2, 6).toUpperCase();
    const userID = "USR-" + Math.random().toString(36).substr(2, 6).toUpperCase();

    // Create Org
    orgs.push({ id: orgID, name: orgName, ownerID: userID, status: 'active' });
    
    // Create Owner User
    const newUser = {
        id: userID, name, email, password, role: 'owner', orgID,
        permissions: ['manage_agents', 'manage_billing', 'view_analytics', 'chat'],
        avatar: 'https://i.pravatar.cc/150?u=' + userID
    };
    users.push(newUser);

    logActivity('SIGNUP', `New Agency Registered: ${orgName}`, orgID);
    res.json({ user: newUser, orgID });
});

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    const user = users.find(u => u.email === email && u.password === password);
    
    if(!user) return res.status(401).json({error: "Invalid credentials"});
    
    // Check Suspension
    const org = orgs.find(o => o.id === user.orgID);
    if(user.role !== 'super_admin' && org && org.status === 'suspended') {
        return res.status(403).json({error: "Account Suspended for Policy Violation"});
    }

    res.json(user);
});

// 2. AGENCY MANAGEMENT
app.post('/api/property/create', (req, res) => {
    const { orgID, name, url } = req.body;
    const propID = "PROP-" + Math.random().toString(36).substr(2, 6).toUpperCase();
    
    properties.push({ id: propID, name, url, orgID });
    logActivity('PROPERTY_CREATE', `Created Tool: ${name}`, orgID);
    res.json({ id: propID, name });
});

app.post('/api/agent/create', (req, res) => {
    const { orgID, name, email, password, permissions } = req.body;
    const userID = "AGT-" + Math.random().toString(36).substr(2, 6).toUpperCase();
    
    users.push({
        id: userID, name, email, password, role: 'agent', orgID,
        permissions: permissions || ['chat'], // Default just chat
        avatar: 'https://i.pravatar.cc/150?u=' + userID
    });
    res.json({ success: true });
});

app.post('/api/broadcast', (req, res) => {
    const { orgID, message } = req.body;
    // Mock Sending Email/Promo
    logActivity('BROADCAST', `Promo sent to contacts of ORG ${orgID}`, orgID);
    res.json({ success: true, count: contacts.filter(c => properties.find(p => p.id === c.propertyID).orgID === orgID).length });
});

// 3. SUPER ADMIN ROUTES
app.get('/api/admin/stats', (req, res) => {
    res.json({
        total_orgs: orgs.length,
        total_users: users.length,
        total_chats: Object.keys(chats).length,
        logs: activityLog.slice(0, 50),
        orgs: orgs
    });
});

app.post('/api/admin/action', (req, res) => {
    const { orgID, action } = req.body; // 'suspend', 'block', 'recover'
    const org = orgs.find(o => o.id === orgID);
    if(org) {
        org.status = action === 'recover' ? 'active' : 'suspended';
        logActivity('ADMIN_ACTION', `Organization ${org.name} set to ${org.status}`, orgID);
    }
    res.json({ success: true });
});

// 4. DATA FETCHING
app.get('/api/dashboard/:userID', (req, res) => {
    const user = users.find(u => u.id === req.params.userID);
    if(!user) return res.status(404).json({});

    const userOrg = orgs.find(o => o.id === user.orgID);
    const userProps = properties.filter(p => p.orgID === user.orgID);
    const team = users.filter(u => u.orgID === user.orgID);
    const myContacts = contacts.filter(c => userProps.find(p => p.id === c.propertyID));

    res.json({ org: userOrg, properties: userProps, team, contacts });
});

// --- SOCKET.IO REAL-TIME LOGIC ---

io.on('connection', (socket) => {
    
    // A. VISITOR JOINS WEBSITE
    socket.on('visitor_join', (data) => {
        // data needs { propertyID, name, email }
        const prop = properties.find(p => p.id === data.propertyID);
        if(!prop) return;

        // CRM: Save Contact
        if(!contacts.find(c => c.email === data.email)) {
            contacts.push({
                id: socket.id, email: data.email, name: data.name, 
                propertyID: data.propertyID, source: prop.url, lastSeen: new Date()
            });
        }

        const geo = getGeo(socket.handshake.address);
        
        chats[socket.id] = {
            id: socket.id,
            visitor: { ...data, ip: socket.handshake.address, location: geo },
            propertyID: data.propertyID,
            orgID: prop.orgID,
            messages: [],
            status: 'open',
            startTime: new Date()
        };

        // Notify Agents watching this Property's Organization
        io.to(`ORG_${prop.orgID}`).emit('new_visitor', chats[socket.id]);
    });

    // B. AGENT LOGINS & JOINS ORG ROOM
    socket.on('agent_login', (orgID) => {
        socket.join(`ORG_${orgID}`); // Subscribe to all events for this company
    });

    // C. MESSAGING
    socket.on('send_msg', (data) => {
        const room = data.room || socket.id;
        if(chats[room]) {
            const msgObj = { 
                sender: data.sender, text: data.text, 
                time: moment().format('HH:mm') 
            };
            chats[room].messages.push(msgObj);
            io.to(room).emit('receive_msg', msgObj);

            // If agent sending to offline visitor
            if(data.sender === 'agent' && !io.sockets.sockets.get(room)) {
                // Trigger Email/SMS logic here
                console.log(`[OFFLINE SEND] Emailing ${chats[room].visitor.email}: ${data.text}`);
            }
        }
    });

    // D. AGENT ACTIONS
    socket.on('join_chat', (roomID) => socket.join(roomID));
    
    socket.on('close_chat', (roomID) => {
        if(chats[roomID]) {
            chats[roomID].status = 'closed';
            io.to(roomID).emit('chat_closed');
            // Update Analytics
        }
    });
});

server.listen(3000, () => console.log("IGT ENTERPRISE CLOUD ONLINE"));