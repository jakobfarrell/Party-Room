
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

// Each question presents two choices.
export const WOULD_YOU_RATHER_QUESTIONS = [
    {
        question: "Would you rather...",
        optionA: "Be able to read minds",
        optionB: "Be able to see the future"
    },
    {
        question: "Would you rather...",
        optionA: "Travel anywhere instantly",
        optionB: "Travel to any point in time"
    },
    {
        question: "Would you rather...",
        optionA: "Never have to sleep",
        optionB: "Never have to eat"
    },
    {
        question: "Would you rather...",
        optionA: "Be incredibly wealthy but unknown",
        optionB: "Be famous but only moderately wealthy"
    },
    {
        question: "Would you rather...",
        optionA: "Live by the beach",
        optionB: "Live in the mountains"
    },
    {
        question: "Would you rather...",
        optionA: "Give up your phone for a year",
        optionB: "Give up television and streaming for a year"
    },
    {
        question: "Would you rather...",
        optionA: "Always know when someone is lying",
        optionB: "Always get away with lying"
    },
    {
        question: "Would you rather...",
        optionA: "Have unlimited free travel",
        optionB: "Have unlimited free food"
    },
    {
        question: "Would you rather...",
        optionA: "Be the funniest person in every room",
        optionB: "Be the smartest person in every room"
    },
    {
        question: "Would you rather...",
        optionA: "Live without music",
        optionB: "Live without movies and television"
    },
    {
        question: "Would you rather...",
        optionA: "Have a personal chef",
        optionB: "Have a personal driver"
    },
    {
        question: "Would you rather...",
        optionA: "Be able to breathe underwater",
        optionB: "Be able to fly"
    },
    {
        question: "Would you rather...",
        optionA: "Know how you will die",
        optionB: "Know when you will die"
    },
    {
        question: "Would you rather...",
        optionA: "Have your dream job with average pay",
        optionB: "Have a boring job with incredible pay"
    },
    {
        question: "Would you rather...",
        optionA: "Always be 10 minutes early",
        optionB: "Always be 10 minutes late"
    },
    {
        question: "Would you rather...",
        optionA: "Give up coffee forever",
        optionB: "Give up alcohol forever"
    },
    {
        question: "Would you rather...",
        optionA: "Be able to talk to animals",
        optionB: "Be able to speak every human language"
    },
    {
        question: "Would you rather...",
        optionA: "Have unlimited money but no friends",
        optionB: "Have amazing friends but always be broke"
    },
    {
        question: "Would you rather...",
        optionA: "Relive your favorite day",
        optionB: "Experience your perfect future day"
    },
    {
        question: "Would you rather...",
        optionA: "Be stranded on a deserted island alone",
        optionB: "Be stranded with someone you cannot stand"
    },
    {
        question: "Would you rather...",
        optionA: "Never feel embarrassment again",
        optionB: "Never feel fear again"
    },
    {
        question: "Would you rather...",
        optionA: "Have a rewind button for your life",
        optionB: "Have a pause button for your life"
    },
    {
        question: "Would you rather...",
        optionA: "Be an incredible singer",
        optionB: "Be an incredible dancer"
    },
    {
        question: "Would you rather...",
        optionA: "Live in your favorite fictional world",
        optionB: "Meet your favorite fictional characters"
    },
    {
        question: "Would you rather...",
        optionA: "Always win arguments",
        optionB: "Always know exactly what to say"
    }
];

const TOTAL_ROUNDS = 15;
const QUESTION_DURATION = 20000;

// Firebase reference for this room's Would You Rather data.
function getWouldYouRatherRef(roomCode) {
    return ref(database, `rooms/${roomCode}/wouldYouRather`);
}

// Start a new game. Only the host can do this.
export async function startWouldYouRather(roomCode, members) {
    const user = auth.currentUser;

    if (!user) {
        throw new Error("You must be signed in to start a game.");
    }

    const roomSnapshot = await get(
        ref(database, `rooms/${roomCode}/info`)
    );

    if (!roomSnapshot.exists() ||
        roomSnapshot.val().hostUid !== user.uid) {
        throw new Error("Only the host can start Would You Rather.");
    }

    const playerIds = Object.keys(members || {});

    if (playerIds.length < 2) {
        throw new Error("Would You Rather requires at least 2 players.");
    }

    // Shuffle the question bank and select 15 questions.
    const questionIndexes = WOULD_YOU_RATHER_QUESTIONS.map(
        (question, index) => index
    );

    for (let i = questionIndexes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));

        [questionIndexes[i], questionIndexes[j]] =
            [questionIndexes[j], questionIndexes[i]];
    }

    const selectedQuestions = questionIndexes.slice(0, TOTAL_ROUNDS);

    const scores = {};

    playerIds.forEach(uid => {
        scores[uid] = 0;
    });

    await remove(
        ref(database, `rooms/${roomCode}/wouldYouRather/votes`)
    );

    await set(
        ref(database, `rooms/${roomCode}/wouldYouRather/state`),
        {
            status: "question",
            round: 1,
            questionIndex: selectedQuestions[0],
            questionOrder: selectedQuestions,
            scores: scores,
            result: null,
            startedAt: Date.now(),
            questionStartedAt: Date.now(),
            questionDuration: QUESTION_DURATION
        }
    );
}

export function listenToWouldYouRather(roomCode, isHost, callback) {

    const user = auth.currentUser;

    if (!user) {
        throw new Error("You must be signed in.");
    }

    const stateRef = ref(
        database,
        `rooms/${roomCode}/wouldYouRather/state`
    );

    const votesRef = ref(
        database,
        isHost
            ? `rooms/${roomCode}/wouldYouRather/votes`
            : `rooms/${roomCode}/wouldYouRather/votes/${user.uid}`
    );

    let latestState = null;
    let latestVotes = {};

    const stopStateListener = onValue(stateRef, snapshot => {

        latestState = snapshot.val();

        callback({
            state: latestState,
            votes: latestVotes
        });
    });

    const stopVotesListener = onValue(votesRef, snapshot => {

        if (isHost) {
            latestVotes = snapshot.val() || {};
        } else {
            const ownVote = snapshot.val();

            latestVotes = ownVote
                ? { [user.uid]: ownVote }
                : {};
        }

        callback({
            state: latestState,
            votes: latestVotes
        });
    });

    return () => {
        stopStateListener();
        stopVotesListener();
    };
}

// Submit a player's prediction.
export async function submitWouldYouRatherVote(roomCode, option) {
    const user = auth.currentUser;

    if (!user) {
        throw new Error("You must be signed in to vote.");
    }

    if (option !== "A" && option !== "B") {
        throw new Error("Please select a valid option.");
    }

    const stateSnapshot = await get(
        ref(database, `rooms/${roomCode}/wouldYouRather/state`)
    );

    if (!stateSnapshot.exists() ||
        stateSnapshot.val().status !== "question") {
        throw new Error("This round is no longer accepting votes.");
    }

    const state = stateSnapshot.val();

    if (Date.now() >
        state.questionStartedAt + state.questionDuration) {
        throw new Error("Time has run out for this round.");
    }

    const memberSnapshot = await get(
        ref(database, `rooms/${roomCode}/members/${user.uid}`)
    );

    if (!memberSnapshot.exists()) {
        throw new Error("You are no longer in this room.");
    }

    const voteRef = ref(
        database,
        `rooms/${roomCode}/wouldYouRather/votes/${user.uid}`
    );

    // A player can only vote once per round.
    const transactionResult = await runTransaction(
        voteRef,
        currentVote => {
            if (currentVote !== null) {
                return;
            }

            return {
                option: option,
                submittedAt: Date.now(),
                round: state.round
            };
        }
    );

    if (!transactionResult.committed) {
        throw new Error("You have already voted this round.");
    }
}

// Finish the current round and award majority-prediction points.
export async function finishWouldYouRatherRound(roomCode) {
    const user = auth.currentUser;

    if (!user) {
        throw new Error("You must be signed in.");
    }

    const roomSnapshot = await get(
        ref(database, `rooms/${roomCode}/info`)
    );

    if (!roomSnapshot.exists() ||
        roomSnapshot.val().hostUid !== user.uid) {
        throw new Error("Only the host can finish the round.");
    }

    const [
        stateSnapshot,
        votesSnapshot,
        membersSnapshot
    ] = await Promise.all([
        get(ref(database, `rooms/${roomCode}/wouldYouRather/state`)),
        get(ref(database, `rooms/${roomCode}/wouldYouRather/votes`)),
        get(ref(database, `rooms/${roomCode}/members`))
    ]);

    if (!stateSnapshot.exists() ||
        stateSnapshot.val().status !== "question") {
        return;
    }

    const state = stateSnapshot.val();
    const votes = votesSnapshot.val() || {};
    const members = membersSnapshot.val() || {};

    // Count votes from current players only.
    let countA = 0;
    let countB = 0;

    const validVotes = {};

    Object.entries(votes).forEach(([uid, vote]) => {
        if (!members[uid] ||
            vote.round !== state.round ||
            (vote.option !== "A" && vote.option !== "B")) {
            return;
        }

        validVotes[uid] = vote;

        if (vote.option === "A") {
            countA++;
        } else {
            countB++;
        }
    });

    // Determine the majority choice.
    // A tie means either prediction earns points.
    let majorityOption = null;

    if (countA > countB) {
        majorityOption = "A";
    } else if (countB > countA) {
        majorityOption = "B";
    }

    const voteResults = {};

    const scores = { ...(state.scores || {}) };

    Object.entries(validVotes).forEach(([uid, vote]) => {
        const correct =
            majorityOption === null ||
            vote.option === majorityOption;

        voteResults[uid] = {
            option: vote.option,
            correct: correct
        };

        if (correct) {
            scores[uid] = (scores[uid] || 0) + 100;
        }
    });

    const stateRef = ref(
        database,
        `rooms/${roomCode}/wouldYouRather/state`
    );

    // Transaction prevents multiple completion attempts from
    // awarding points more than once.
    return await runTransaction(stateRef, currentState => {
        if (!currentState ||
            currentState.status !== "question" ||
            currentState.round !== state.round) {
            return;
        }

        return {
            ...currentState,
            status: "results",
            scores: scores,
            result: {
                countA: countA,
                countB: countB,
                majorityOption: majorityOption,
                voteResults: voteResults,
                revealedAt: Date.now()
            }
        };
    });
}

// Start the next round.
export async function nextWouldYouRatherRound(roomCode) {
    const user = auth.currentUser;

    if (!user) {
        throw new Error("You must be signed in.");
    }

    const roomSnapshot = await get(
        ref(database, `rooms/${roomCode}/info`)
    );

    if (!roomSnapshot.exists() ||
        roomSnapshot.val().hostUid !== user.uid) {
        throw new Error("Only the host can start the next round.");
    }

    const stateSnapshot = await get(
        ref(database, `rooms/${roomCode}/wouldYouRather/state`)
    );

    if (!stateSnapshot.exists() ||
        stateSnapshot.val().status !== "results") {
        throw new Error("The current round has not finished.");
    }

    const state = stateSnapshot.val();

    const nextRound = state.round + 1;
    const nextIndex = state.questionOrder[nextRound - 1];

    // End the game after the final round.
    if (nextIndex === undefined) {
        await update(
            ref(database, `rooms/${roomCode}/wouldYouRather/state`),
            { status: "complete" }
        );

        return;
    }

    await remove(
        ref(database, `rooms/${roomCode}/wouldYouRather/votes`)
    );

    await update(
        ref(database, `rooms/${roomCode}/wouldYouRather/state`),
        {
            status: "question",
            round: nextRound,
            questionIndex: nextIndex,
            result: null,
            questionStartedAt: Date.now()
        }
    );
}

// End the game and return everyone to the room lobby.
export async function endWouldYouRatherGame(roomCode) {
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
        throw new Error("Only the host can end Would You Rather.");
    }

    await update(roomInfoRef, {
        gameStarted: false
    });

    await remove(
        ref(database, `rooms/${roomCode}/wouldYouRather`)
    );
}
