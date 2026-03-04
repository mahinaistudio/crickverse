let selectedFingers = [];
let socket = null;
let playerName = "";
let roomCode = "";
let isHost = false;

function showScreen(id) {
    document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.remove("active");
    });

    document.getElementById(id).classList.add("active");
}

function goToMode() {
    const nameInput = document.getElementById("playerNameInput").value;

    if (!nameInput) {
        alert("Enter your name first!");
        return;
    }

    playerName = nameInput;
    showScreen("modeScreen");
}

function goToRoomSetup() {
    showScreen("roomSetupScreen");
}

function createRoom() {

    const overs = document.getElementById("oversInput").value;
    const wickets = document.getElementById("wicketsInput").value;
    const code = document.getElementById("createRoomCodeInput").value;

    if (!overs || !wickets || !code) {
        alert("Fill all fields!");
        return;
    }

    roomCode = code;
    isHost = true;

    connectToServer(code, overs, wickets);

    showScreen("lobbyScreen");
}

function joinRoom() {

    const code = document.getElementById("joinRoomCodeInput").value;

    if (!code) {
        alert("Enter room code!");
        return;
    }

    roomCode = code;
    isHost = false;

    connectToServer(code, null, null);

    showScreen("lobbyScreen");
}

function sendToss(choice) {

  socket.send(JSON.stringify({
    type: "TOSS_CHOICE",
    player: isHost ? "A" : "B",
    choice: choice
  }));

}

function sendDecision(choice) {

  socket.send(JSON.stringify({
    type: "BAT_BOWL_CHOICE",
    player: isHost ? "A" : "B",
    choice: choice
  }));

}

function lockHand() {

  if (selectedFingers.length === 0) {
    alert("Select at least one finger!");
    return;
  }

  socket.send(JSON.stringify({
    type: "HAND_SELECT",
    player: isHost ? "A" : "B",
    fingers: selectedFingers
  }));

  socket.send(JSON.stringify({
    type: "HAND_LOCK",
    player: isHost ? "A" : "B"
  }));

  selectedFingers = [];
  document.getElementById("selectedDisplay").innerText = "Locked!";
}

function toggleFinger(finger) {

  if (selectedFingers.includes(finger)) {
    selectedFingers = selectedFingers.filter(f => f !== finger);
  } else {
    selectedFingers.push(finger);
  }

  document.getElementById("selectedDisplay").innerText =
    selectedFingers.length > 0
      ? selectedFingers.join(", ")
      : "None";
}

function startMatch() {

  if (!isHost) {
    alert("Only host can start the match!");
    return;
  }

  socket.send(JSON.stringify({
    type: "START_MATCH"
  }));
}

function connectToServer(code, overs, wickets) {

    socket = new WebSocket(
        "wss://handcricket-server.mahin-aistudio.workers.dev/" + code
    );

    socket.onopen = () => {

        socket.send(JSON.stringify({
    type: "JOIN_ROOM",
    payload: {
        playerName: playerName,
        overs: overs,
        wickets: wickets
    }
}));
    };

    socket.onmessage = (event) => {

        console.log("Received:", event.data);

        const data = JSON.parse(event.data);

        if (data.type === "LOBBY_UPDATE") {
            document.getElementById("lobbyRoomCode").innerText = roomCode;
            document.getElementById("teamA").innerText =
                data.payload.teamA || "Empty";
            document.getElementById("teamB").innerText =
                data.payload.teamB || "Empty";
        }

if (data.type === "MATCH_DECISION") {

  alert(
    "Batting: " + data.payload.batting +
    "\nBowling: " + data.payload.bowling
  );

  showScreen("gameScreen");
}

if (data.type === "TOSS_CALLER") {

  showScreen("tossScreen");

  if ((isHost && data.payload.caller === "A") ||
      (!isHost && data.payload.caller === "B")) {

    document.getElementById("tossButtons").style.display = "block";
  } else {
    document.getElementById("tossButtons").style.display = "none";
  }
}

if (data.type === "BALL_RESULT") {

  document.getElementById("scoreA").innerText = data.payload.scoreA;
  document.getElementById("scoreB").innerText = data.payload.scoreB;
  document.getElementById("wicketsA").innerText = data.payload.wicketsA;
  document.getElementById("wicketsB").innerText = data.payload.wicketsB;

  document.getElementById("innings").innerText = data.payload.innings;

  if (data.payload.target) {
    document.getElementById("target").innerText = data.payload.target;
  }

  if (data.payload.out) {
    document.getElementById("ballMessage").innerText = "OUT!";
  } else {
    document.getElementById("ballMessage").innerText = "Runs scored!";
  }

  if (data.payload.matchOver) {

  document.getElementById("ballMessage").innerText =
    "Match Over! Winner: " + data.payload.winner;

  const rematch = confirm("Match Over!\nWinner: " + data.payload.winner + "\n\nRematch?");

  if (rematch) {
    location.reload();
  } else {
    showScreen("nameScreen");
  }

}

}

if (data.type === "TOSS_RESULT") {

  alert(
    "Coin: " + data.payload.coin +
    "\nWinner: " + data.payload.winner
  );

  showScreen("decisionScreen");

  const amIWinner =
    (isHost && data.payload.winner === document.getElementById("teamA").innerText) ||
    (!isHost && data.payload.winner === document.getElementById("teamB").innerText);

  if (amIWinner) {
    document.getElementById("decisionButtons").style.display = "block";
    document.getElementById("decisionWaiting").style.display = "none";
  } else {
    document.getElementById("decisionButtons").style.display = "none";
    document.getElementById("decisionWaiting").style.display = "block";
  }
}

        if (data.type === "ROOM_FULL") {
            alert("Room is full!");
            showScreen("modeScreen");
        }
    };
}