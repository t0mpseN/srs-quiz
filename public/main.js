document.addEventListener("DOMContentLoaded", async () => {
    document.getElementById('backButton').addEventListener('click', () => {
        window.location.href = '/decks.html';
    });
    if (!await checkAuth()) return;
    console.log("DOM fully loaded!");
    
    async function checkAuth() {
        try {
            const response = await fetch(`/check-auth`, {
                credentials: 'include'
            });
            const data = await response.json();
            
            if (!data.authenticated) {
                window.location.href = '/login.html';
                return false;
            }
            return true;
        } catch (error) {
            console.error('Auth check failed:', error);
            window.location.href = '/login.html';
            return false;
        }
    }

    async function readDeck() {
        try {
            const currentDeck = localStorage.getItem('currentDeck');
            if (!currentDeck) {
                window.location.href = '/decks.html';
                return { dailyReviews: [], fullDeck: [] };
            }
    
            const response = await fetch(`/deck/${currentDeck}`, {
                credentials: 'include'
            });
            
            if (response.status === 401) {
                window.location.href = '/login.html';
                return { dailyReviews: [], fullDeck: [] };
            }
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            
            const data = await response.json();
            return {
                dailyReviews: data.dailyReviews,
                fullDeck: data.fullDeck
            };
        } catch (error) {
            console.error("Error reading deck from server:", error);
            return { dailyReviews: [], fullDeck: [] };
        }
    }
    
    function getCurrentDateTime() {
        const isoDate = new Date();
        const milliseconds = new Date(isoDate).getTime();
        return milliseconds;
    }

    function getRandomObjects(array, selectedIndices) {
        if (selectedIndices.length >= array.length) {
            throw new Error("No more unique indices available.");
        }
        
        let randomIndex;
        
        do {
            randomIndex = Math.floor(Math.random() * array.length);
        } while (selectedIndices.includes(randomIndex));

        selectedIndices.push(randomIndex);

        return array[randomIndex];
    }
    
    async function GetCards() {
        let deckData = await readDeck();
        let todaysReviewCards = deckData.dailyReviews;
        let fullDeck = deckData.fullDeck;
        
        if (todaysReviewCards.length === 0) {
            document.getElementById("question").textContent = "No more reviews for the day.";
            const buttons = document.querySelectorAll('button');
            buttons.forEach(button => button.style.display = 'none');
            return [[], []];
        }
     
        let questionData = [todaysReviewCards[0]];
        let selectedIndices = [fullDeck.indexOf(todaysReviewCards[0])];
        
        let attempts = 0;
        const maxAttempts = 20;
        
        while (questionData.length < 4 && attempts < maxAttempts) {
            try {
                let randomAlternative = getRandomObjects(fullDeck, selectedIndices);
                if (!questionData.includes(randomAlternative)) {
                    questionData.push(randomAlternative);
                }
            } catch (error) {
                console.warn("Not enough unique cards available for alternatives");
                break;
            }
            attempts++;
        }
     
        return [todaysReviewCards, questionData];
    }
    
    async function checkAnswer(answer, questionData, clickedButton) {
        const correctAnswer = questionData[0].Meaning;
        const word = questionData[0].Word;
        const buttons = document.querySelectorAll('button');
        
        // Disable all buttons temporarily
        buttons.forEach(button => button.disabled = true);

        // Find and highlight the correct answer button
        buttons.forEach(button => {
            if (button.textContent === correctAnswer) {
                button.style.backgroundColor = '#4ECB71'; // Green
            }
        });

        if (answer === correctAnswer) {
            await updateDeck(word, true);
        } else {
            clickedButton.style.backgroundColor = '#FF6B6B'; // Red
            await updateDeck(word, false);
        }

        // Wait a moment before reloading to show the colors
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    }

    async function deleteCard(word) {
        try {
            const currentDeck = localStorage.getItem('currentDeck');
            const confirmation = confirm(`Are you sure you want to delete the card "${word}"?`);
            
            if (!confirmation) {
                return;
            }
    
            const response = await fetch(`/deleteCard/${currentDeck}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ word }),
            });
    
            if (response.ok) {
                console.log("Card deleted successfully");
                window.location.reload();
            } else {
                console.error("Failed to delete card");
                alert("Failed to delete card");
            }
        } catch (error) {
            console.error("Error deleting card:", error);
            alert("Error deleting card");
        }
    }

    async function updateDeck(word, isCorrect) {
        try {
            const currentDeck = localStorage.getItem('currentDeck');
            const response = await fetch(`/deck/${currentDeck}`, {
                credentials: 'include'
            });
            const deckData = await response.json();
            const deck = deckData.fullDeck
            const wordIndex = deck.findIndex((item) => item.Word === word);
    
            if (wordIndex === -1) {
                console.error("Word not found in deck!");
                return;
            }
    
            const currentTime = getCurrentDateTime();
            deck[wordIndex].LastReviewed = currentTime;
    
            if (isCorrect) {
                if (deck[wordIndex].Balance < 2) { // LEARNING CARD
                    deck[wordIndex].Balance++;
                    if (deck[wordIndex].Balance === 2) {
                        deck[wordIndex].Interval = 86400000; // 1 day
                    } else {
                        deck[wordIndex].Interval = 60000; // 1 minute
                    }
                } else { // GRADUATED CARD
                    if (deck[wordIndex].Interval === 86400000) {
                        deck[wordIndex].Interval = 86400000 * deck[wordIndex].EF;
                    } else {
                        deck[wordIndex].Interval = deck[wordIndex].Interval * deck[wordIndex].EF;
                    }
                }
            } else { // isWrong
                if (deck[wordIndex].Balance < 2) { // LEARNING CARD
                    deck[wordIndex].Balance = 0;
                    deck[wordIndex].Interval = 30000; // 30 seconds
                } else { // GRADUATED CARD
                    if (deck[wordIndex].EF > 1.3) {
                        deck[wordIndex].EF -= 0.2;
                    }
                    deck[wordIndex].Balance--;
                    deck[wordIndex].Interval = 30000; // 30 seconds
                }
            }
    
            deck[wordIndex].NextReview = currentTime + deck[wordIndex].Interval;
    
            try {
                const saveResponse = await fetch(`/updateDeck/${currentDeck}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(deck),
                });
    
                if (saveResponse.ok) {
                    console.log("Deck updated successfully!");
                } else {
                    console.error("Failed to save deck.");
                }
            } catch (saveError) {
                console.error("Error saving deck:", saveError);
            }
        } catch (error) {
            console.error("Error updating deck from server:", error);
        }
    }
    
    let values = await GetCards();
    let questionData = values[1];

    let fullDeck = (await readDeck()).fullDeck;

    let reviewWords = [];

    for (let i = 0; i < fullDeck.length; i++) {
        let card2 = fullDeck[i];
    
        if (card2.NextReview != 0 && card2.LastReviewed< getCurrentDateTime() && card2.Interval <= 60000) {
            
            reviewWords.push(card2);
            reviewWords = reviewWords.filter((item, index) => reviewWords.indexOf(item) === index);
        } 
    }

    let newWords = [];
    let gradWords = [];

    for (let i = 0; i < fullDeck.length; i++) {
        let card = fullDeck[i];
        if (card.NextReview === 0 && newWords.length < 20) {
            newWords.push(card);
        }
        if (card.Balance == 2 && (card.NextReview - getCurrentDateTime()) <= 86400000) {
            gradWords.push(card);
        }
    }    
    
    let newWordsNumber = newWords.length - (reviewWords.length + gradWords.length);

    if (newWords.length < 20){
        newWordsNumber = 0
        if (typeof newWords.length === 'undefined'){
            newWordsNumber = 0
        }
    }
    console.log("newWords.length:", newWords.length)
    console.log("reviewWords.length:", reviewWords.length)
    console.log("newWordsNumber:", newWordsNumber)
    
    if (questionData.length >= 4) {
        let alternativesArray = [
            questionData[0].Meaning, 
            questionData[1].Meaning, 
            questionData[2].Meaning, 
            questionData[3].Meaning
        ];

        alternativesArray = alternativesArray.sort((a, b) => 0.5 - Math.random());         // Shuffle alternatives
    
        // Create and style the reading text
        const readingText = document.createElement('div');
        readingText.textContent = questionData[0].Reading || '';
        readingText.className = 'reading-text';

        // Get the question element and clear it
        const questionElement = document.getElementById("question");
        questionElement.innerHTML = '';

        const deleteBtn = document.getElementById('deleteCard');
        deleteBtn.addEventListener('click', () => {
            deleteCard(questionData[0].Word);
            newWordsNumber--;
        });

        const backButton = document.createElement('button');
        backButton.className = 'delete-btn';
        backButton.style.marginTop = '20px';
        backButton.addEventListener('click', () => {
            window.location.href = '/decks.html';
        });

        // Add the reading and word to the question element
        questionElement.appendChild(readingText);
        questionElement.appendChild(document.createTextNode(questionData[0].Word));

        document.getElementById("alternative1").textContent = alternativesArray[0];
        document.getElementById("alternative2").textContent = alternativesArray[1];
        document.getElementById("alternative3").textContent = alternativesArray[2];
        document.getElementById("alternative4").textContent = alternativesArray[3];
        document.getElementById("reviewWords").textContent = `Reviews: ${reviewWords.length}`;
        document.getElementById("newWords").textContent = `New: ${newWordsNumber}`;
 
        let buttons = [
            document.getElementById("alternative1"),
            document.getElementById("alternative2"),
            document.getElementById("alternative3"),
            document.getElementById("alternative4")
        ];
    
        buttons.forEach((button, index) => {
            button.addEventListener("click", () => {
                checkAnswer(alternativesArray[index], questionData, button);
            });
        });
    } else {
        console.error("Not enough data to populate the quiz.");
    }
});