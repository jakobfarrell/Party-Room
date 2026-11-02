
import { auth, database } from "./firebase-config.js";

import {
    ref,
    get,
    set,
    update,
    remove,
    onValue,
    runTransaction
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-database.js";

// Trivia question bank.
// Each question has four possible answers and one correct answer.
export const TRIVIA_QUESTIONS = [
    {
        question: "Which planet has the most moons currently confirmed?",
        answers: ["Earth", "Jupiter", "Mars", "Venus"],
        correctAnswer: 1
    },
    {
        question: "What is the largest ocean on Earth?",
        answers: ["Atlantic", "Indian", "Arctic", "Pacific"],
        correctAnswer: 3
    },
    {
        question: "Which element has the chemical symbol Au?",
        answers: ["Silver", "Gold", "Argon", "Aluminum"],
        correctAnswer: 1
    },
    {
        question: "Who wrote the novel 1984?",
        answers: ["Aldous Huxley", "George Orwell", "Ray Bradbury", "J.R.R. Tolkien"],
        correctAnswer: 1
    },
    {
        question: "What is the capital of Japan?",
        answers: ["Kyoto", "Osaka", "Tokyo", "Hiroshima"],
        correctAnswer: 2
    },
    {
        question: "How many sides does a dodecagon have?",
        answers: ["10", "11", "12", "14"],
        correctAnswer: 2
    },
    {
        question: "Which animal is the largest mammal?",
        answers: ["African elephant", "Blue whale", "Giraffe", "Whale shark"],
        correctAnswer: 1
    },
    {
        question: "What is the smallest prime number?",
        answers: ["0", "1", "2", "3"],
        correctAnswer: 2
    },
    {
        question: "Which country invented paper?",
        answers: ["Egypt", "Greece", "China", "India"],
        correctAnswer: 2
    },
    {
        question: "What is the longest river in South America?",
        answers: ["Nile", "Amazon", "Paraná", "Orinoco"],
        correctAnswer: 1
    },
    {
        question: "Which artist painted the Mona Lisa?",
        answers: ["Michelangelo", "Raphael", "Leonardo da Vinci", "Donatello"],
        correctAnswer: 2
    },
    {
        question: "How many bones are in the adult human body?",
        answers: ["186", "196", "206", "216"],
        correctAnswer: 2
    },
    {
        question: "Which language has the most native speakers worldwide?",
        answers: ["English", "Spanish", "Hindi", "Mandarin Chinese"],
        correctAnswer: 3
    },
    {
        question: "What is the hardest natural substance?",
        answers: ["Quartz", "Diamond", "Granite", "Sapphire"],
        correctAnswer: 1
    },
    {
        question: "Which city hosted the 2016 Summer Olympics?",
        answers: ["London", "Beijing", "Rio de Janeiro", "Tokyo"],
        correctAnswer: 2
    },
    {
        question: "What is the main gas in Earth's atmosphere?",
        answers: ["Oxygen", "Carbon dioxide", "Nitrogen", "Hydrogen"],
        correctAnswer: 2
    },
    {
        question: "Who developed the theory of general relativity?",
        answers: ["Isaac Newton", "Albert Einstein", "Galileo Galilei", "Nikola Tesla"],
        correctAnswer: 1
    },
    {
        question: "Which instrument has 88 keys?",
        answers: ["Violin", "Organ", "Piano", "Accordion"],
        correctAnswer: 2
    },
    {
        question: "What is the largest desert in the world?",
        answers: ["Sahara", "Gobi", "Antarctic Desert", "Arabian Desert"],
        correctAnswer: 2
    },
    {
        question: "Which blood type is known as the universal red-cell donor?",
        answers: ["AB positive", "O negative", "A positive", "B negative"],
        correctAnswer: 1
    }
];

// Get the Firebase reference for this room's Trivia data.
function getTriviaRef(roomCode) {
    return ref(database, `rooms/${roomCode}/trivia`);
}

// Start a new Trivia game. Only the host can do this.
export async function startTrivia(roomCode, members) {
    const user = auth.currentUser;

    if (!user) {
        throw new Error("You must be signed in to start a game.");
    }

    const roomSnapshot = await get(
        ref(database, `rooms/${roomCode}/info`)
    );

    if (!roomSnapshot.exists() ||
        roomSnapshot.val().hostUid !== user.uid) {
        throw new Error("Only the host can start Trivia.");
    }

    const playerIds = Object.keys(members || {});

    if (playerIds.length < 2) {
        throw new Error("Trivia requires at least 2 players.");
    }

    const scores = {};

    playerIds.forEach(uid => {
        scores[uid] = 0;
    });

    // Randomize the question order for this game.
    const questionIndexes = TRIVIA_QUESTIONS.map((question, index) => index);

    for (let i = questionIndexes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [questionIndexes[i], questionIndexes[j]] =
            [questionIndexes[j], questionIndexes[i]];
    }

    await remove(ref(database, `rooms/${roomCode}/trivia/answers`));

    await set(ref(database, `rooms/${roomCode}/trivia/state`), {
        status: "question",
        round: 1,
        questionIndex: questionIndexes[0],
        questionOrder: questionIndexes,
        scores: scores,
        result: null,
        startedAt: Date.now(),
        questionStartedAt: Date.now(),
        questionDuration: 20000
    });
}

// Listen for live Trivia updates.
export function listenToTrivia(roomCode, callback) {
    return onValue(getTriviaRef(roomCode), snapshot => {
        callback(snapshot.val() || {});
    });
}

// Submit a player's answer.

export async function submitTriviaAnswer(roomCode, answerIndex) {

    const user = auth.currentUser;

    if (!user) {
        throw new Error("You must be signed in to answer.");
    }

    if (!Number.isInteger(answerIndex) ||
        answerIndex < 0 ||
        answerIndex > 3) {
        throw new Error("Please select a valid answer.");
    }

    const stateSnapshot = await get(
        ref(database, `rooms/${roomCode}/trivia/state`)
    );

    if (!stateSnapshot.exists() ||
        stateSnapshot.val().status !== "question") {
        throw new Error("This question is no longer accepting answers.");
    }

    const state = stateSnapshot.val();

    if (Date.now() >
        state.questionStartedAt + state.questionDuration) {
        throw new Error("Time has run out for this question.");
    }

    const memberSnapshot = await get(
        ref(database, `rooms/${roomCode}/members/${user.uid}`)
    );

    if (!memberSnapshot.exists()) {
        throw new Error("You are no longer in this room.");
    }

    const answerRef = ref(
        database,
        `rooms/${roomCode}/trivia/answers/${user.uid}`
    );

    // Create the answer only if this player hasn't already answered.
    const transactionResult = await runTransaction(
        answerRef,
        currentAnswer => {

            if (currentAnswer !== null) {
                return;
            }

            return {
                answerIndex: answerIndex,
                submittedAt: Date.now(),
                round: state.round
            };
        }
    );

    if (!transactionResult.committed) {
        throw new Error("You have already answered this question.");
    }
}


// End the current question and award points.
export async function finishTriviaQuestion(roomCode) {
    const user = auth.currentUser;

    if (!user) {
        throw new Error("You must be signed in.");
    }

    const roomSnapshot = await get(
        ref(database, `rooms/${roomCode}/info`)
    );

    if (!roomSnapshot.exists() ||
        roomSnapshot.val().hostUid !== user.uid) {
        throw new Error("Only the host can finish the question.");
    }

    const [stateSnapshot, answersSnapshot, membersSnapshot] =
        await Promise.all([
            get(ref(database, `rooms/${roomCode}/trivia/state`)),
            get(ref(database, `rooms/${roomCode}/trivia/answers`)),
            get(ref(database, `rooms/${roomCode}/members`))
        ]);

    if (!stateSnapshot.exists() ||
        stateSnapshot.val().status !== "question") {
        return;
    }

    const state = stateSnapshot.val();
    const answers = answersSnapshot.val() || {};
    const members = membersSnapshot.val() || {};

    const question = TRIVIA_QUESTIONS[state.questionIndex];

    if (!question) {
        throw new Error("Trivia question could not be found.");
    }

    const correctPlayers = [];
    const answerResults = {};

    Object.entries(answers).forEach(([uid, answer]) => {
        if (!members[uid] ||
            answer.round !== state.round) {
            return;
        }

        const isCorrect =
            answer.answerIndex === question.correctAnswer;

        answerResults[uid] = {
            answerIndex: answer.answerIndex,
            correct: isCorrect
        };

        if (isCorrect) {
            correctPlayers.push(uid);
        }
    });

    const stateRef = ref(
        database,
        `rooms/${roomCode}/trivia/state`
    );

    return await runTransaction(stateRef, currentState => {
        if (!currentState ||
            currentState.status !== "question" ||
            currentState.round !== state.round) {
            return;
        }

        const scores = { ...(currentState.scores || {}) };

        correctPlayers.forEach(uid => {
            scores[uid] = (scores[uid] || 0) + 100;
        });

        return {
            ...currentState,
            status: "results",
            scores: scores,
            result: {
                correctAnswer: question.correctAnswer,
                answerResults: answerResults,
                revealedAt: Date.now()
            }
        };
    });
}

// Start the next question.
export async function nextTriviaQuestion(roomCode) {
    const user = auth.currentUser;

    if (!user) {
        throw new Error("You must be signed in.");
    }

    const roomSnapshot = await get(
        ref(database, `rooms/${roomCode}/info`)
    );

    if (!roomSnapshot.exists() ||
        roomSnapshot.val().hostUid !== user.uid) {
        throw new Error("Only the host can start the next question.");
    }

    const stateSnapshot = await get(
        ref(database, `rooms/${roomCode}/trivia/state`)
    );

    if (!stateSnapshot.exists() ||
        stateSnapshot.val().status !== "results") {
        throw new Error("The current question has not finished.");
    }

    const state = stateSnapshot.val();
    const nextRound = (state.round || 1) + 1;
    const nextIndex = state.questionOrder[nextRound - 1];

    if (nextIndex === undefined) {
        await update(
            ref(database, `rooms/${roomCode}/trivia/state`),
            { status: "complete" }
        );

        return;
    }

    await remove(ref(database, `rooms/${roomCode}/trivia/answers`));

    await update(
        ref(database, `rooms/${roomCode}/trivia/state`),
        {
            status: "question",
            round: nextRound,
            questionIndex: nextIndex,
            result: null,
            questionStartedAt: Date.now()
        }
    );
}

// End Trivia and return everyone to the room lobby.
export async function endTriviaGame(roomCode) {
    const user = auth.currentUser;

    if (!user) {
        throw new Error("You must be signed in.");
    }

    const roomInfoRef = ref(
        database,
        `rooms/${roomCode}/info`
    );

    const roomSnapshot = await get(roomInfoRef);

    if (!roomSnapshot.exists() ||
        roomSnapshot.val().hostUid !== user.uid) {
        throw new Error("Only the host can end Trivia.");
    }

    await update(roomInfoRef, {
        gameStarted: false
    });

    await remove(
        ref(database, `rooms/${roomCode}/trivia`)
    );
}
