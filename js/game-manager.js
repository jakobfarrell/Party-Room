// All available Party Room games.
// Each game has a unique ID used internally by the website.

export const GAMES = [
    {
        id: "most-likely-to",
        name: "Most Likely To",
        description: "Vote on which player best fits each prompt.",
        minPlayers: 3,
        maxPlayers: 12,
        category: "Party"
    },
    {
        id: "would-you-rather",
        name: "Would You Rather?",
        description: "Choose between two difficult or ridiculous options.",
        minPlayers: 2,
        maxPlayers: 12,
        category: "Party"
    },
    {
        id: "trivia",
        name: "Trivia",
        description: "Compete to answer questions correctly.",
        minPlayers: 2,
        maxPlayers: 12,
        category: "Quiz"
    },
    {
        id: "who-said-that",
        name: "Who Said That?",
        description: "Guess which player said each anonymous statement.",
        minPlayers: 3,
        maxPlayers: 12,
        category: "Party"
    },
    {
        id: "rock-paper-scissors",
        name: "Rock Paper Scissors Tournament",
        description: "Compete in a multiplayer elimination tournament.",
        minPlayers: 2,
        maxPlayers: 12,
        category: "Competition"
    }
];

// Find a game using its unique ID.
export function getGameById(gameId) {
    return GAMES.find(game => game.id === gameId) || null;
}

// Return all games that support the current player count.
export function getAvailableGames(playerCount) {
    return GAMES.filter(game =>
        playerCount >= game.minPlayers &&
        playerCount <= game.maxPlayers
    );
}
