
import { auth, database } from "./firebase-config.js";

import {
    ref,
    set,
    onValue
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-database.js";

// Characters used for room codes.
// Ambiguous characters such as 0, O, 1, and I are excluded.
const ROOM_CODE_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateRoomCode() {
    let code = "";

    for (let i = 0; i < 6; i++) {
        const randomIndex = Math.floor(
            Math.random() * ROOM_CODE_CHARACTERS.length
        );

        code += ROOM_CODE_CHARACTERS[randomIndex];
    }

    return code;
}

// Create a new private room
export async function createRoom(profile, roomName = "Game Night") {
    const user = auth.currentUser;

    if (!user) {
        throw new Error("You must be signed in to create a room.");
    }

    if (!profile || !profile.username || !profile.avatar) {
        throw new Error("Your player profile is missing.");
    }

    const cleanRoomName = roomName.trim().slice(0, 30) || "Game Night";

    // Try a few codes in case one is already taken.
    for (let attempt = 0; attempt < 5; attempt++) {
        const roomCode = generateRoomCode();

        const roomInfoRef = ref(
            database,
            `rooms/${roomCode}/info`
        );

        const memberRef = ref(
            database,
            `rooms/${roomCode}/members/${user.uid}`
        );

        try {
            // Create the room information first.
            await set(roomInfoRef, {
                hostUid: user.uid,
                roomName: cleanRoomName,
                createdAt: Date.now()
            });

            // Add the host as the first room member.
            await set(memberRef, {
                username: profile.username,
                avatar: profile.avatar,
                ready: true,
                joinedAt: Date.now()
            });

            return roomCode;

        } catch (error) {
            console.error("Room creation attempt failed:", error);

            // Try another code if the write was rejected.
            if (attempt === 4) {
                throw error;
            }
        }
    }

    throw new Error("Unable to create a room. Please try again.");
}

// Join an existing room using its code.
export async function joinRoom(roomCode, profile) {
    const user = auth.currentUser;

    if (!user) {
        throw new Error("You must be signed in to join a room.");
    }

    if (!profile || !profile.username || !profile.avatar) {
        throw new Error("Your player profile is missing.");
    }

    const cleanCode = roomCode.trim().toUpperCase();

    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(cleanCode)) {
        throw new Error("Please enter a valid six-character room code.");
    }

    const memberRef = ref(
        database,
        `rooms/${cleanCode}/members/${user.uid}`
    );

    // Firebase security rules reject this if the room doesn't exist.
    await set(memberRef, {
        username: profile.username,
        avatar: profile.avatar,
        ready: false,
        joinedAt: Date.now()
    });

    return cleanCode;
}

// Listen for live changes to a room.
export function listenToRoom(roomCode, callback) {
    const roomRef = ref(
        database,
        `rooms/${roomCode}/`
    );

    return onValue(roomRef, (snapshot) => {
        callback(snapshot.val());
    });
}
