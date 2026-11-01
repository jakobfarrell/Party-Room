

import { auth, database } from "./firebase-config.js";

import {
    ref,
    set,
    get,
    remove,
    onValue,
    runTransaction,
    onDisconnect
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

// Claim a room for this player.
// A player can only have one active room at a time.
async function claimPlayerRoom(uid, roomCode) {
    const playerRoomRef = ref(
        database,
        `playerRooms/${uid}`
    );

    const result = await runTransaction(
        playerRoomRef,
        (currentRoom) => {
            if (currentRoom === null) {
                return roomCode;
            }

            // Abort if the player already belongs to a room.
            return;
        }
    );

    if (!result.committed) {
        throw new Error(
            "You are already in a room. Leave your current room before joining another."
        );
    }
}

// Register automatic cleanup if the player's connection disappears.
async function registerRoomPresence(roomCode, isHost) {
    const user = auth.currentUser;

    if (!user) {
        throw new Error("You must be signed in.");
    }

    const memberRef = ref(
        database,
        `rooms/${roomCode}/members/${user.uid}`
    );

    const playerRoomRef = ref(
        database,
        `playerRooms/${user.uid}`
    );

    // Register the host's room closure FIRST.
    // This allows other players to see that the room is closing.
    if (isHost) {
        const closedRef = ref(
            database,
            `rooms/${roomCode}/info/closed`
        );

        const closedAtRef = ref(
            database,
            `rooms/${roomCode}/info/closedAt`
        );

        await onDisconnect(closedRef).set(true);
        await onDisconnect(closedAtRef).set(Date.now());
    }

    // Remove the player from the room if they disconnect.
    await onDisconnect(memberRef).remove();

    // Release their active-room lock if they disconnect.
    await onDisconnect(playerRoomRef).remove();
}

// Cancel pending disconnect actions before deliberately leaving.
// This prevents an old room's disconnect cleanup from affecting a new room.
async function cancelRoomPresence(roomCode) {
    const user = auth.currentUser;

    if (!user) {
        return;
    }

    const memberRef = ref(
        database,
        `rooms/${roomCode}/members/${user.uid}`
    );

    const playerRoomRef = ref(
        database,
        `playerRooms/${user.uid}`
    );

    const operations = [
        onDisconnect(memberRef).cancel(),
        onDisconnect(playerRoomRef).cancel()
    ];

    // Also cancel the scheduled room closure for the host.
    const closedRef = ref(
        database,
        `rooms/${roomCode}/info/closed`
    );

    const closedAtRef = ref(
        database,
        `rooms/${roomCode}/info/closedAt`
    );

    operations.push(onDisconnect(closedRef).cancel());
    operations.push(onDisconnect(closedAtRef).cancel());

    await Promise.all(operations);
}

// Create a new private room.
export async function createRoom(profile, roomName = "Game Night") {
    const user = auth.currentUser;

    if (!user) {
        throw new Error("You must be signed in to create a room.");
    }

    if (!profile || !profile.username || !profile.avatar) {
        throw new Error("Your player profile is missing.");
    }

    const cleanRoomName =
        roomName.trim().slice(0, 30) || "Game Night";

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

        let roomCreated = false;
        let lockClaimed = false;

        try {
            // Reserve this player for the new room.
            await claimPlayerRoom(user.uid, roomCode);
            lockClaimed = true;

            // Create room information.
            await set(roomInfoRef, {
                hostUid: user.uid,
                roomName: cleanRoomName,
                createdAt: Date.now()
            });

            roomCreated = true;

            // Add the host as the first member.
            await set(memberRef, {
                username: profile.username,
                avatar: profile.avatar,
                ready: true,
                joinedAt: Date.now()
            });

            // Register automatic disconnect cleanup.
            await registerRoomPresence(roomCode, true);

            return roomCode;

        } catch (error) {
            console.error("Room creation attempt failed:", error);

            // Clean up any partial room creation.
            try {
                await cancelRoomPresence(roomCode);

                if (roomCreated) {
                    await remove(memberRef);
                    await remove(roomInfoRef);
                }

                if (lockClaimed) {
                    await remove(
                        ref(database, `playerRooms/${user.uid}`)
                    );
                }
            } catch (cleanupError) {
                console.error("Room cleanup failed:", cleanupError);
            }

            // Try another code for a room-code collision.
            if (
                attempt === 4 ||
                error.message?.includes("already in a room")
            ) {
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

    let lockClaimed = false;

    try {
        // Reserve this player for the room.
        await claimPlayerRoom(user.uid, cleanCode);
        lockClaimed = true;

        // Add the player to the room.
        // Firebase rules will reject this if the room does not exist
        // or has already been closed.
        await set(memberRef, {
            username: profile.username,
            avatar: profile.avatar,
            ready: false,
            joinedAt: Date.now()
        });

        // Register automatic disconnect cleanup.
        await registerRoomPresence(cleanCode, false);

        return cleanCode;

    } catch (error) {
        console.error("Room joining failed:", error);

        try {
            await cancelRoomPresence(cleanCode);
            await remove(memberRef);

            if (lockClaimed) {
                await remove(
                    ref(database, `playerRooms/${user.uid}`)
                );
            }
        } catch (cleanupError) {
            console.error("Join cleanup failed:", cleanupError);
        }

        throw error;
    }
}

// Explicitly leave a room.
export async function leaveRoom(roomCode) {
    const user = auth.currentUser;

    if (!user || !roomCode) {
        return;
    }

    const roomInfoRef = ref(
        database,
        `rooms/${roomCode}/info`
    );

    const memberRef = ref(
        database,
        `rooms/${roomCode}/members/${user.uid}`
    );

    const playerRoomRef = ref(
        database,
        `playerRooms/${user.uid}`
    );

    // Check whether this player is the host.
    const infoSnapshot = await get(roomInfoRef);
    const roomInfo = infoSnapshot.val();

    const isHost =
        roomInfo && roomInfo.hostUid === user.uid;

    // Close the room before removing the host.
    if (isHost && roomInfo.closed !== true) {
        await set(
            ref(database, `rooms/${roomCode}/info/closed`),
            true
        );

        await set(
            ref(database, `rooms/${roomCode}/info/closedAt`),
            Date.now()
        );
    }

    // Cancel pending disconnect actions.
    await cancelRoomPresence(roomCode);

    // Remove this player from the room.
    await remove(memberRef);

    // Release their active-room lock.
    await remove(playerRoomRef);
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
