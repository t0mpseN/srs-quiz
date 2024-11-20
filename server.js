const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const session = require('express-session');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

const PASSWORD_HASH = crypto.createHash('sha256').update('0192').digest('hex');

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

const DAILY_TRACK_PATH = path.join(__dirname, 'public/daily_track.json');
const SESSION_PATH = path.join(__dirname, 'public/session.json');

function initializeDailyTrack() {
    const defaultTrack = {
        date: new Date().toDateString(),
        newCardsReviewed: 0
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

function getDailyReviews(deck) {
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
            newCardsReviewed: 0
        };
        fs.writeFileSync(DAILY_TRACK_PATH, JSON.stringify(dailyTrack), 'utf8');
    }

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

    // If no learning cards, get new cards
    const remainingNewCardSlots = Math.max(0, 20 - dailyTrack.newCardsReviewed);
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
    const date = new Date().toISOString().split('T')[0];  // Gets YYYY-MM-DD
    const backupDir = path.join(__dirname, 'backups', date);  // backups/2024-11-19/
    
    // Create backup directory if it doesn't exist
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }
 
    const files = ['deck.json', 'session.json', 'daily_track.json'];
    
    files.forEach(file => {
        const sourcePath = path.join(__dirname, 'public', file);
        const backupPath = path.join(backupDir, file);  // Just using original filenames
        
        fs.copyFileSync(sourcePath, backupPath);
    });
 }

 app.get('/', (req, res) => {
    if (req.session.authenticated) {
        res.redirect('/index.html');
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

app.get('/deck', (req, res) => {
    const deckPath = path.join(__dirname, 'public/deck.json');
    fs.readFile(deckPath, 'utf8', (err, data) => {
        if (err) {
            console.error("Error reading deck.json:", err);
            return res.status(500).send("Server Error");
        }
        
        const deck = JSON.parse(data);
        const dailyReviews = getDailyReviews(deck);

        res.json({
            fullDeck: deck,
            dailyReviews: dailyReviews
        });
    });
});

app.post('/updateDeck', (req, res) => {
    const updatedFullDeck = req.body;
    const deckPath = path.join(__dirname, 'public/deck.json');
    
    let dailyTrack = JSON.parse(fs.readFileSync(DAILY_TRACK_PATH, 'utf8'));
    let session = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
    const today = new Date().toDateString();
    
    if (dailyTrack.date !== today) {
        dailyTrack = {
            date: today,
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
                    dailyTrack.newCardsReviewed++;
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
            console.error("Error saving deck.json:", err);
            return res.status(500).send("Failed to update deck.");
        }
        res.status(200).send("Deck updated successfully.");
    });
});

app.post('/deleteCard', (req, res) => {
    const { word } = req.body;
    const deckPath = path.join(__dirname, 'public/deck.json');

    try {
        // Read current deck
        const deck = JSON.parse(fs.readFileSync(deckPath, 'utf8'));
        
        // Filter out the card to delete
        const updatedDeck = deck.filter(card => card.Word !== word);
        
        // Save updated deck
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