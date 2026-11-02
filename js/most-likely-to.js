
import { auth, database } from "./firebase-config.js";

import {
    ref,
    get,
    set,
    update,
    remove,
    onValue
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-database.js";

// Prompts used by Most Likely To.
export const MOST_LIKELY_PROMPTS = [
    "Who is most likely to become famous?",
    "Who is most likely to survive a zombie apocalypse?",
    "Who is most likely to become a millionaire?",
    "Who is most likely to get lost in their own city?",
    "Who is most likely to become a world traveler?",
    "Who is most likely to accidentally start an argument?",
    "Who is most likely to become a celebrity?",
    "Who is most likely to forget someone's birthday?",
    "Who is most likely to get kicked out of a bar?",
    "Who is most likely to become president?",
    "Who is most likely to laugh at the worst possible moment?",
    "Who is most likely to spend all their money in one day?",
    "Who is most likely to go viral on the internet?",
    "Who is most likely to move to another country?",
    "Who is most likely to become a professional gambler?",
    "Who is most likely to fall asleep at a party?",
    "Who is most likely to accidentally insult someone?",
    "Who is most likely to win a reality TV show?",
    "Who is most likely to get arrested for something ridiculous?",
    "Who is most likely to become a conspiracy theorist?",
    "Who is most likely to make friends with a complete stranger?",
    "Who is most likely to show up late to their own wedding?",
    "Who is most likely to become a famous musician?",
    "Who is most likely to spend a weekend without their phone?",
    "Who is most likely to become a terrible influencer?"
];

// Get the Firebase reference for a room's game data.
function getGameRef(roomCode) {
    return ref(database, `rooms/${roomCode}/game`);
}

// Start a new Most Likely To game.
export async function startMostLikelyTo(roomCode, members) {

    const user = auth.currentUser;

    if (!user) {
        throw new Error("You must be signed in to start a game.");
    }

    const roomSnapshot = await get(
        ref(database, `rooms/${roomCode}/info`)
    );

    if (!roomSnapshot.exists() ||
        roomSnapshot.val().hostUid !== user.uid) {
        throw new Error("Only the host can start this game.");
    }

    const playerIds = Object.keys(members || {});

    if (playerIds.length < 3) {
        throw new Error("Most Likely To requires at least 3 players.");
    }

    const firstPromptIndex = Math.floor(
        Math.random() * MOST_LIKELY_PROMPTS.length
    );

    const scores = {};

    playerIds.forEach(uid => {
        scores[uid] = 0;
    });

    await remove(ref(database, `rooms/${roomCode}/game/votes`));

    await set(ref(database, `rooms/${roomCode}/game/state`), {
        status: "voting",
        round: 1,
        prompt: MOST_LIKELY_PROMPTS[firstPromptIndex],
        usedPromptIndexes: [firstPromptIndex],
        scores: scores,
        result: null,
        startedAt: Date.now()
    });
}

// Listen for live game updates.
export function listenToMostLikelyTo(roomCode, callback) {

    const gameRef = getGameRef(roomCode);

    return onValue(gameRef, snapshot => {
        callback(snapshot.val() || {});
    });
}

// Submit a player's vote.
export async function submitMostLikelyToVote(roomCode, targetUid) {

    const user = auth.currentUser;

    if (!user) {
        throw new Error("You must be signed in to vote.");
    }

    if (!targetUid || targetUid === user.uid) {
        throw new Error("You cannot vote for yourself.");
    }

    const gameSnapshot = await get(
        ref(database, `rooms/${roomCode}/game/state`)
    );

    if (!gameSnapshot.exists() ||
        gameSnapshot.val().status !== "voting") {
        throw new Error("Voting is not currently open.");
    }

    const targetSnapshot = await get(
        ref(database, `rooms/${roomCode}/members/${targetUid}`)
    );

    if (!targetSnapshot.exists()) {
        throw new Error("That player is no longer in the room.");
    }

    await set(
        ref(database, `rooms/${roomCode}/game/votes/${user.uid}`),
        {
            targetUid: targetUid,
            submittedAt: Date.now()
        }
    );
}

// End voting and calculate the round results.
export async function finishMostLikelyToRound(roomCode) {

    const user = auth.currentUser;

    if (!user) {
        throw new Error("You must be signed in.");
    }

    const roomSnapshot = await get(
        ref(database, `rooms/${roomCode}/info`)
    );

    if (!roomSnapshot.exists() ||
        roomSnapshot.val().hostUid !== user.uid) {
        throw new Error("Only the host can end the round.");
    }

    const gameSnapshot = await get(
        ref(database, `rooms/${roomCode}/game/state`)
    );

    if (!gameSnapshot.exists() ||
        gameSnapshot.val().status !== "voting") {
        throw new Error("There is no active voting round.");
    }

    const state = gameSnapshot.val();

    const [votesSnapshot, membersSnapshot] = await Promise.all([
        get(ref(database, `rooms/${roomCode}/game/votes`)),
        get(ref(database, `rooms/${roomCode}/members`))
    ]);

    const votes = votesSnapshot.val() || {};
    const members = membersSnapshot.val() || {};

    const voteCounts = {};

    Object.keys(members).forEach(uid => {
        voteCounts[uid] = 0;
    });

    Object.values(votes).forEach(vote => {
        if (
            vote &&
            vote.targetUid &&
            Object.prototype.hasOwnProperty.call(
                voteCounts,
                vote.targetUid
            )
        ) {
            voteCounts[vote.targetUid]++;
        }
    });

    const highestVotes = Math.max(
        0,
        ...Object.values(voteCounts)
    );

    const winners = highestVotes > 0
        ? Object.keys(voteCounts).filter(
            uid => voteCounts[uid] === highestVotes
        )
        : [];

    const scores = { ...(state.scores || {}) };

    winners.forEach(uid => {
        scores[uid] = (scores[uid] || 0) + 1;
    });

    await update(
        ref(database, `rooms/${roomCode}/game/state`),
        {
            status: "results",
            scores: scores,
            result: {
                voteCounts: voteCounts,
                winners: winners,
                revealedAt: Date.now()
            }
        }
    );
}

// Start the next round.
export async function nextMostLikelyToRound(roomCode) {

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
        ref(database, `rooms/${roomCode}/game/state`)
    );

    if (!stateSnapshot.exists() ||
        stateSnapshot.val().status !== "results") {
        throw new Error("The current round has not finished.");
    }

    const state = stateSnapshot.val();

    const usedIndexes = state.usedPromptIndexes || [];

    const availableIndexes = MOST_LIKELY_PROMPTS
        .map((prompt, index) => index)
        .filter(index => !usedIndexes.includes(index));

    if (availableIndexes.length === 0) {
        await update(
            ref(database, `rooms/${roomCode}/game/state`),
            { status: "complete" }
        );

        return;
    }

    const nextIndex = availableIndexes[
        Math.floor(Math.random() * availableIndexes.length)
    ];

    await remove(ref(database, `rooms/${roomCode}/game/votes`));

    await update(
        ref(database, `rooms/${roomCode}/game/state`),
        {
            status: "voting",
            round: (state.round || 1) + 1,
            prompt: MOST_LIKELY_PROMPTS[nextIndex],
            usedPromptIndexes: [...usedIndexes, nextIndex],
            result: null,
            startedAt: Date.now()
        }
    );
}
