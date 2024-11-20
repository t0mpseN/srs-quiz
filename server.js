const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const session = require('express-session');
const crypto = require('crypto');

const app = express();
const PORT = 3000;
const PUBLIC_PATH = path.join(__dirname, 'public');
const DECKS_PATH = path.join(__dirname, 'decks');
const DAILY_TRACK_PATH = path.join(__dirname, 'public/daily_track.json');
const SESSION_PATH = path.join(__dirname, 'public/session.json');
const PASSWORD_HASH = crypto.createHash('sha256').update('0192').digest('hex');

if (!fs.existsSync(PUBLIC_PATH)) {
    fs.mkdirSync(PUBLIC_PATH, { recursive: true });
}

if (!fs.existsSync(DECKS_PATH)) {
    fs.mkdirSync(DECKS_PATH, { recursive: true });
}

app.use(cors({
    origin: 'http://192.168.1.27:3000',
    credentials: true
}));

app.use(session({
    secret: '0192',  // Change this to a random string
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }  // Set to true if using HTTPS
}));

app.use(express.json({ limit: '10mb' }));
//app.use(express.static(path.join(__dirname, 'public')));



function getDecksInfo() {
    const decksPath = DECKS_PATH;
    const files = fs.readdirSync(decksPath).filter(file => 
        file.endsWith('.json') && 
        !['daily_track.json', 'session.json'].includes(file)
    );
    
    const decksInfo = files.map(file => {
        const deckPath = path.join(decksPath, file);
        const deckData = JSON.parse(fs.readFileSync(deckPath, 'utf8'));
        const name = file.replace('.json', '');
        
        // Calculate review and new cards counts
        const timeNow = Date.now();
        const reviews = deckData.filter(card => 
            card.NextReview > 0 && 
            card.NextReview <= timeNow
        ).length;
        
        const newCards = deckData.filter(card => 
            card.NextReview === 0
        ).length;
        
        return {
            name,
            reviews,
            new: newCards
        };
    });
    
    return decksInfo;
}

function getSafeDeckId(deckName) {
    // Convert deck name to a safe string for use as an object key
    return deckName.replace(/[^a-zA-Z0-9]/g, '_');
}

function initializeDailyTrack() {
    const defaultTrack = {
        date: new Date().toDateString(),
        decks: {}
    };
    fs.writeFileSync(DAILY_TRACK_PATH, JSON.stringify(defaultTrack), 'utf8');
    return defaultTrack;
}

function initializeSession() {
    const session = {
        date: new Date().toDateString(),
        reviewedCards: [],
        currentPhase: 'review' // Can be 'review' or 'learning'
    };
    fs.writeFileSync(SESSION_PATH, JSON.stringify(session), 'utf8');
    return session;
}

function getDailyReviews(deck, deckName) {
    let dailyTrack;
    try {
        dailyTrack = JSON.parse(fs.readFileSync(DAILY_TRACK_PATH, 'utf8'));
    } catch {
        dailyTrack = initializeDailyTrack();
    }

    const today = new Date().toDateString();
    if (dailyTrack.date !== today) {
        dailyTrack = {
            date: today,
            decks: {}
        };
    }

    // Use safe deck ID for object access
    const safeDeckId = getSafeDeckId(deckName);
    
    // Initialize deck tracking if it doesn't exist
    if (!dailyTrack.decks) {
        dailyTrack.decks = {};
    }
    
    if (!dailyTrack.decks[safeDeckId]) {
        dailyTrack.decks[safeDeckId] = {
            name: deckName,  // Store original name for reference
            newCardsReviewed: 0
        };
    }

    // Save the updated tracking
    fs.writeFileSync(DAILY_TRACK_PATH, JSON.stringify(dailyTrack), 'utf8');

    const timeNow = Date.now();
    const tenMinutesInMs = 600000;
    
    // First, get cards in learning phase (NextReview > 0 and Balance < 2)
    const learningCards = deck.filter(card => 
        card.NextReview > 0 && 
        card.Balance < 2 && 
        card.NextReview <= timeNow
    ).sort((a, b) => a.NextReview - b.NextReview);

    if (learningCards.length > 0) {
        return learningCards;
    }

    // If no learning cards, get new cards (with deck-specific limit)
    const remainingNewCardSlots = Math.max(0, 20 - dailyTrack.decks[safeDeckId].newCardsReviewed);
    const newCards = deck.filter(card => card.NextReview === 0)
                        .slice(0, remainingNewCardSlots);
    
    if (newCards.length > 0) {
        return newCards;
    }

    // If no new cards, get review cards (Balance >= 2)
    const reviewCards = deck.filter(card => 
        card.Balance >= 2 && 
        card.NextReview <= timeNow && 
        card.NextReview !== 0
    ).sort((a, b) => a.NextReview - b.NextReview);

    if (reviewCards.length > 0) {
        return reviewCards;
    }

    // If no regular review cards, get cards due within 10 minutes
    return deck.filter(card => 
        card.NextReview > timeNow && 
        card.NextReview - timeNow < tenMinutesInMs &&
        card.NextReview !== 0
    ).sort((a, b) => a.NextReview - b.NextReview);
}


function createBackup() {
    const date = new Date().toISOString().split('T')[0];
    const backupDir = path.join(__dirname, '..', 'backups', date);
    
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }
 
    // Backup decks
    if (fs.existsSync(DECKS_PATH)) {
        const decks = fs.readdirSync(DECKS_PATH).filter(file => file.endsWith('.json'));
        decks.forEach(deck => {
            const sourcePath = path.join(DECKS_PATH, deck);
            const backupPath = path.join(backupDir, deck);
            fs.copyFileSync(sourcePath, backupPath);
        });
    }

    // Backup other files
    const otherFiles = ['session.json', 'daily_track.json'];
    otherFiles.forEach(file => {
        const sourcePath = path.join(PUBLIC_PATH, file);
        const backupPath = path.join(backupDir, file);
        if (fs.existsSync(sourcePath)) {
            fs.copyFileSync(sourcePath, backupPath);
        }
    });
}

app.get('/', (req, res) => {
    if (req.session.authenticated) {
        res.redirect('/decks.html');
    } else {
        res.sendFile(path.join(__dirname, 'public/login.html'));
    }
});

// Login endpoint
app.post('/login', (req, res) => {
    const { password } = req.body;
    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
    
    if (hashedPassword === PASSWORD_HASH) {
        req.session.authenticated = true;
        res.status(200).json({ message: 'Login successful' });
    } else {
        res.status(401).json({ message: 'Invalid password' });
    }
});

// Middleware to check if user is authenticated
const checkAuth = (req, res, next) => {
    if (req.session.authenticated) {
        next();
    } else {
        res.status(401).json({ message: 'Unauthorized' });
    }
};

app.get('/decks', (req, res) => {
    try {
        const files = fs.readdirSync(DECKS_PATH).filter(file => file.endsWith('.json'));
        const decksInfo = files.map(file => {
            const deckPath = path.join(DECKS_PATH, file);
            const deckData = JSON.parse(fs.readFileSync(deckPath, 'utf8'));
            const name = file.replace('.json', '');
            
            // Calculate reviews and new cards
            const timeNow = Date.now();
            const reviews = deckData.filter(card => 
                card.NextReview > 0 && 
                card.NextReview <= timeNow
            ).length;
            
            const newCards = deckData.filter(card => 
                card.NextReview === 0
            ).length;
            
            return {
                name,
                reviews,
                new: newCards
            };
        });
        
        res.json(decksInfo);
    } catch (error) {
        console.error('Error getting decks:', error);
        res.status(500).json({ error: 'Failed to get decks' });
    }
});

app.get('/deck/:deckName', (req, res) => {
    const deckPath = path.join(DECKS_PATH, `${req.params.deckName}.json`);
    fs.readFile(deckPath, 'utf8', (err, data) => {
        if (err) {
            console.error(`Error reading ${req.params.deckName}.json:`, err);
            return res.status(500).send("Server Error");
        }
        
        const deck = JSON.parse(data);
        const dailyReviews = getDailyReviews(deck, req.params.deckName);

        res.json({
            fullDeck: deck,
            dailyReviews: dailyReviews
        });
    });
});

app.post('/updateDeck/:deckName', (req, res) => {
    const updatedFullDeck = req.body;
    const deckPath = path.join(DECKS_PATH, `${req.params.deckName}.json`);
    
    let dailyTrack = JSON.parse(fs.readFileSync(DAILY_TRACK_PATH, 'utf8'));
    let session = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
    const today = new Date().toDateString();
    
    if (dailyTrack.date !== today) {
        dailyTrack = {
            date: today,
            decks: {}
        };
    }

    // Initialize deck tracking if it doesn't exist
    if (!dailyTrack.decks[req.params.deckName]) {
        dailyTrack.decks[req.params.deckName] = {
            newCardsReviewed: 0
        };
    }
    
    try {
        const currentDeck = JSON.parse(fs.readFileSync(deckPath, 'utf8'));
        const updatedCard = updatedFullDeck.find(newCard => {
            const oldCard = currentDeck.find(card => card.Word === newCard.Word);
            return oldCard && oldCard.LastReviewed !== newCard.LastReviewed;
        });

        if (updatedCard) {
            if (!session.reviewedCards.includes(updatedCard.Word)) {
                if (updatedCard.LastReviewed !== 0 && updatedCard.NextReview !== 0) {
                    dailyTrack.decks[req.params.deckName].newCardsReviewed++;
                }
                session.reviewedCards.push(updatedCard.Word);
            }
            
            fs.writeFileSync(DAILY_TRACK_PATH, JSON.stringify(dailyTrack), 'utf8');
            fs.writeFileSync(SESSION_PATH, JSON.stringify(session), 'utf8');
            createBackup();
        }
    } catch (error) {
        console.error("Error updating session:", error);
    }
    
    fs.writeFile(deckPath, JSON.stringify(updatedFullDeck, null, 2), 'utf8', (err) => {
        if (err) {
            console.error(`Error saving ${req.params.deckName}.json:`, err);
            return res.status(500).send("Failed to update deck.");
        }
        res.status(200).send("Deck updated successfully.");
    });
});


app.post('/deleteCard/:deckName', (req, res) => {
    const { word } = req.body;
    const deckPath = path.join(DECKS_PATH, `${req.params.deckName}.json`);

    try {
        const deck = JSON.parse(fs.readFileSync(deckPath, 'utf8'));
        const updatedDeck = deck.filter(card => card.Word !== word);
        fs.writeFileSync(deckPath, JSON.stringify(updatedDeck, null, 2), 'utf8');
        res.status(200).send("Card deleted successfully");
    } catch (error) {
        console.error("Error deleting card:", error);
        res.status(500).send("Failed to delete card");
    }
});

// Logout endpoint
app.post('/logout', (req, res) => {
    req.session.destroy();
    res.status(200).json({ message: 'Logged out successfully' });
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Add this at the end of your server.js
app.get('/check-auth', (req, res) => {
    res.json({ authenticated: !!req.session.authenticated });
});


app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://192.168.1.27:${PORT}`);
});