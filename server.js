const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const session = require('express-session');
const crypto = require('crypto');
const archiver = require('archiver');
const app = express();
const PORT = process.env.PORT || 3000;
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
    origin: true,  // Allow all origins
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
        dailyTrack = initializeDailyTrack();
    }

    // Use safe deck ID for object access
    const safeDeckId = getSafeDeckId(deckName);
    
    // Initialize deck tracking if it doesn't exist
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

    // Check how many new cards have been reviewed today
    const newCardsReviewedToday = dailyTrack.decks[safeDeckId].newCardsReviewed || 0;
    
    // If we haven't hit the daily limit, get new cards
    if (newCardsReviewedToday < 20) {
        const remainingNewCardSlots = 20 - newCardsReviewedToday;
        const newCards = deck.filter(card => card.NextReview === 0)
                            .slice(0, remainingNewCardSlots);
        
        if (newCards.length > 0) {
            return newCards;
        }
    }

    // If no new cards or hit daily limit, get review cards (Balance >= 2)
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
    console.log('Received password:', password);  // See what password was sent
    
    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
    console.log('Generated hash:', hashedPassword);  // See what hash was generated
    console.log('Stored hash:', PASSWORD_HASH);  // See what hash is stored
    console.log('Match?:', hashedPassword === PASSWORD_HASH);  // See if they match
    
    if (hashedPassword === PASSWORD_HASH) {
        req.session.authenticated = true;
        res.status(200).json({ message: 'Login successful' });
    } else {
        res.status(401).json({ message: 'Invalid password' });
    }
});

app.get('/decks', (req, res) => {
    try {
        const files = fs.readdirSync(DECKS_PATH).filter(file => file.endsWith('.json'));

        // Read daily tracking data
        let dailyTrack;
        try {
            dailyTrack = JSON.parse(fs.readFileSync(DAILY_TRACK_PATH, 'utf8'));
            // Reset daily track if it's a new day
            if (dailyTrack.date !== new Date().toDateString()) {
                dailyTrack = {
                    date: new Date().toDateString(),
                    decks: {}
                };
                fs.writeFileSync(DAILY_TRACK_PATH, JSON.stringify(dailyTrack), 'utf8');
            }
        } catch {
            dailyTrack = {
                date: new Date().toDateString(),
                decks: {}
            };
            fs.writeFileSync(DAILY_TRACK_PATH, JSON.stringify(dailyTrack), 'utf8');
        }

        const decksInfo = files.map(file => {
            const deckPath = path.join(DECKS_PATH, file);
            const deckData = JSON.parse(fs.readFileSync(deckPath, 'utf8'));
            const name = file.replace('.json', '');
            const safeDeckId = getSafeDeckId(name);
            
            // Get daily tracking for this deck
            if (!dailyTrack.decks[safeDeckId]) {
                dailyTrack.decks[safeDeckId] = {
                    name: name,
                    newCardsReviewed: 0
                };
            }

            const newCardsReviewedToday = dailyTrack.decks[safeDeckId].newCardsReviewed || 0;
            const remainingNewCards = Math.max(0, 20 - newCardsReviewedToday);
            
            // Calculate reviews and new cards
            const timeNow = Date.now();
            const reviews = deckData.filter(card => 
                card.NextReview > 0 && 
                card.NextReview <= timeNow
            ).length;
            
            // Count total new cards, but only show what's available today
            const totalNewCards = deckData.filter(card => 
                card.NextReview === 0
            ).length;

            const availableNewCards = Math.min(totalNewCards, remainingNewCards);
            
            return {
                name,
                reviews,
                new: availableNewCards
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
    
    let dailyTrack;
    try {
        dailyTrack = JSON.parse(fs.readFileSync(DAILY_TRACK_PATH, 'utf8'));
    } catch {
        dailyTrack = initializeDailyTrack();
    }

    let session;
    try {
        session = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
    } catch {
        session = initializeSession();
    }

    const today = new Date().toDateString();
    
    if (dailyTrack.date !== today) {
        dailyTrack = initializeDailyTrack();
    }

    const safeDeckId = getSafeDeckId(req.params.deckName);

    // Initialize deck tracking if it doesn't exist
    if (!dailyTrack.decks[safeDeckId]) {
        dailyTrack.decks[safeDeckId] = {
            name: req.params.deckName,
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
                // Only increment counter for new cards (NextReview was 0)
                const oldCard = currentDeck.find(card => card.Word === updatedCard.Word);
                if (oldCard && oldCard.NextReview === 0) {
                    dailyTrack.decks[safeDeckId].newCardsReviewed++;
                }
                session.reviewedCards.push(updatedCard.Word);
            }
            
            fs.writeFileSync(DAILY_TRACK_PATH, JSON.stringify(dailyTrack, null, 2), 'utf8');
            fs.writeFileSync(SESSION_PATH, JSON.stringify(session, null, 2), 'utf8');
            createBackup();
        }

        fs.writeFileSync(deckPath, JSON.stringify(updatedFullDeck, null, 2), 'utf8');
        res.status(200).send("Deck updated successfully.");
    } catch (error) {
        console.error("Error updating deck:", error);
        res.status(500).send("Failed to update deck");
    }
});


app.post('/deleteCard/:deckName', (req, res) => {
    const { word } = req.body;
    const deckName = req.params.deckName;
    const deckPath = path.join(DECKS_PATH, `${deckName}.json`);

    try {
        // Read and find index in original deck
        const deck = JSON.parse(fs.readFileSync(deckPath, 'utf8'));
        const indexToDelete = deck.findIndex(card => card.Word === word);
        
        if (indexToDelete === -1) {
            throw new Error("Card not found");
        }

        // Remove card from original deck
        deck.splice(indexToDelete, 1);
        fs.writeFileSync(deckPath, JSON.stringify(deck, null, 2), 'utf8');

        // Handle corresponding deck deletion
        let correspondingDeckName;
        if (deckName.includes('(Reverse)')) {
            correspondingDeckName = deckName.replace(' (Reverse)', '');
        } else {
            correspondingDeckName = `${deckName} (Reverse)`;
        }

        const correspondingDeckPath = path.join(DECKS_PATH, `${correspondingDeckName}.json`);
        
        if (fs.existsSync(correspondingDeckPath)) {
            const correspondingDeck = JSON.parse(fs.readFileSync(correspondingDeckPath, 'utf8'));
            // Remove card at the same index from corresponding deck
            correspondingDeck.splice(indexToDelete, 1);
            fs.writeFileSync(correspondingDeckPath, JSON.stringify(correspondingDeck, null, 2), 'utf8');
        }

        res.status(200).send("Card deleted successfully");
    } catch (error) {
        console.error("Error deleting card:", error);
        res.status(500).send("Failed to delete card");
    }
});

app.get('/backup', (req, res) => {
    const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression
    });

    const date = new Date().toISOString().split('T')[0];
    const filename = `decks-backup-${date}.zip`;
    // Set the headers for zip download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

    // Pipe archive data to the response
    archive.pipe(res);

    // Add the entire decks directory to the archive
    archive.directory(DECKS_PATH, 'decks');

    archive.finalize();
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
    console.log(`Server is running on port ${PORT}`);
});