/* script.js */

let lastBalls = [];
let selectedFingers = [];
let socket = null;
let playerName = "";
let roomCode = "";
let isHost = false;
let gameMode = "limited";

// Game state tracked on frontend
let mySlot = null;         // "A" or "B"
let currentBattingName = "";
let currentBowlingName = "";
let matchMode = "limited"; // synced from server on MATCH_DECISION
let matchOvers = 0;

const sounds = {
  wicket: new Audio("sounds/wicket.mp3"),
  six: new Audio("sounds/six.m4a")
};

function playSound(name) {
  if (sounds[name]) {
    sounds[name].currentTime = 0;
    sounds[name].play().catch(() => {});
  }
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function goToMode() {
  const nameInput = document.getElementById("playerNameInput").value.trim();
  if (!nameInput) { alert("Enter your name first!"); return; }
  playerName = nameInput;
  showScreen("modeScreen");
}

function goToRoomSetup() {
  showScreen("roomSetupScreen");
}

/* script.js — replace setMode() */

function setMode(mode) {
  gameMode = mode;
  const oversInput = document.getElementById("oversInput");

  document.getElementById("limitedBtn").classList.toggle("active", mode === "limited");
  document.getElementById("unlimitedBtn").classList.toggle("active", mode === "unlimited");

  if (mode === "unlimited") {
    oversInput.value = "";
    oversInput.disabled = true;
    oversInput.style.display = "none";
  } else {
    oversInput.disabled = false;
    oversInput.style.display = "block";
  }
}

function createRoom() {
  const overs = document.getElementById("oversInput").value;
  const wickets = document.getElementById("wicketsInput").value;
  const code = document.getElementById("createRoomCodeInput").value.trim();

  if (gameMode === "limited" && (!overs || !wickets || !code)) {
    alert("Fill all fields!"); return;
  }
  if (gameMode === "unlimited" && (!wickets || !code)) {
    alert("Fill all fields!"); return;
  }

  roomCode = code;
  isHost = true;
  connectToServer(code, gameMode === "limited" ? overs : null, wickets);
  showScreen("lobbyScreen");
}

function joinRoom() {
  const code = document.getElementById("joinRoomCodeInput").value.trim();
  if (!code) { alert("Enter room code!"); return; }
  roomCode = code;
  isHost = false;
  connectToServer(code, null, null);
  showScreen("lobbyScreen");
}

function startMatch() {
  const teamB = document.getElementById("teamB").innerText;
  if (!isHost) { alert("Only host can start match"); return; }
  if (teamB === "Empty" || teamB === "Waiting...") {
    alert("Waiting for opponent to join"); return;
  }
  socket.send(JSON.stringify({ type: "START_MATCH" }));
}

function copyRoomCode() {
  navigator.clipboard.writeText(roomCode);
  window.afterCopy = true;
  document.getElementById("resultTitle").innerText = "Copied!";
  document.getElementById("resultText").innerText = "Room code copied to clipboard.";
  showScreen("resultScreen");
}

/* script.js — replace continueGame() */

function continueGame() {
  if (window.afterCopy) {
    window.afterCopy = false;
    showScreen("lobbyScreen");
    return;
  }
  if (window.matchOverResult) {
    window.matchOverResult = false;
    location.reload();
    return;
  }
  if (window.afterInningsBreak) {
    window.afterInningsBreak = false;
    showScreen("gameScreen");
    return;
  }
  showScreen("gameScreen");
}

function toggleTheme() {
  document.body.classList.toggle("light");
  document.getElementById("themeToggle").innerText =
    document.body.classList.contains("light") ? "☀️" : "🌙";
}

function sendToss(choice) {
  socket.send(JSON.stringify({
    type: "TOSS_CHOICE",
    player: isHost ? "A" : "B",
    choice
  }));
}

function sendDecision(choice) {
  socket.send(JSON.stringify({
    type: "BAT_BOWL_CHOICE",
    player: isHost ? "A" : "B",
    choice
  }));
}

function toggleFinger(finger, btn) {
  if (selectedFingers.includes(finger)) {
    selectedFingers = selectedFingers.filter(f => f !== finger);
    btn.classList.remove("selected");
  } else {
    selectedFingers.push(finger);
    btn.classList.add("selected");
  }
  document.getElementById("selectedDisplay").innerText =
    selectedFingers.length > 0 ? selectedFingers.join(", ") : "None";
}

function lockHand() {
  if (selectedFingers.length === 0) { alert("Select at least one finger!"); return; }
  if (window.handLocked) return;
  window.handLocked = true;

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
  document.querySelectorAll(".fingerBtn").forEach(btn => btn.classList.remove("selected"));
  document.getElementById("selectedDisplay").innerText = "Locked! Waiting for opponent...";
}

// ─── Scoreboard helpers ───────────────────────────────────────────

function updateScoreboard(payload) {
  const {
    battingName, bowlingName,
    scoreA, scoreB, wicketsA, wicketsB,
    balls, ballsLeft, innings, target,
    out, lastRuns
  } = payload;

  currentBattingName = battingName;
  currentBowlingName = bowlingName;

  // Names
  document.getElementById("battingName").innerText = "Bat: " + battingName;
  document.getElementById("bowlingName").innerText = "Bowl: " + bowlingName;

  // Which score belongs to batting team
  const teamAName = document.getElementById("teamA").innerText;
  const battingScore = battingName === teamAName ? scoreA : scoreB;
  const battingWickets = battingName === teamAName ? wicketsA : wicketsB;

  document.getElementById("batterStats").innerText =
    "(" + battingScore + "-" + battingWickets + ")";

  document.getElementById("mainScore").innerText =
    battingScore + " / " + battingWickets;

  // Overs display (limited only)
  if (matchMode === "limited") {
    const over = Math.floor(balls / 6);
    const ball = balls % 6;
    document.getElementById("overDisplay").innerText = over + "." + ball;
    document.getElementById("ballsLeftDisplay").innerText = ballsLeft ?? "-";
  } else {
    document.getElementById("overDisplay").innerText = "-";
    document.getElementById("ballsLeftDisplay").innerText = "-";
  }

  // Innings
  document.getElementById("inningsDisplay").innerText = "Innings: " + innings;

  // Target info (innings 2 only)
  if (target) {
    const runsLeft = Math.max(target - battingScore, 0);
    document.getElementById("targetDisplay").innerText = target;
    document.getElementById("runsLeftDisplay").innerText = runsLeft;

    if (matchMode === "limited" && ballsLeft > 0) {
      document.getElementById("rrrDisplay").innerText =
        (runsLeft / ballsLeft).toFixed(2);
    } else {
      document.getElementById("rrrDisplay").innerText = "-";
    }
  } else {
    document.getElementById("targetDisplay").innerText = "-";
    document.getElementById("runsLeftDisplay").innerText = "-";
    document.getElementById("rrrDisplay").innerText = "-";
  }

  // Mode label
  document.getElementById("modeDisplay").innerText =
    "Single • " + (matchMode === "limited" ? "Limited" : "Unlimited");
}

function updateBallHistory(balls, out, lastRuns) {
  const ballRun = out ? "W" : lastRuns;

  // Reset history at start of each new over (ball 0 = first ball of over)
  if (balls % 6 === 1) {
    lastBalls = [];
  }

  lastBalls.push(ballRun);

  const boxes = document.querySelectorAll(".ballBox");
  boxes.forEach((box, i) => {
    box.innerText = lastBalls[i] !== undefined ? lastBalls[i] : "-";
    box.classList.remove("ballFlash");
  });

  // Flash only the latest ball
  if (boxes[lastBalls.length - 1]) {
    boxes[lastBalls.length - 1].classList.add("ballFlash");
    setTimeout(() => boxes[lastBalls.length - 1].classList.remove("ballFlash"), 500);
  }
}

/* script.js — add as a new top-level function */

let breakCountdownTimer = null;

function startBreakCountdown() {
  let secs = 5;
  document.getElementById("breakCountdownNum").innerText = secs;

  if (breakCountdownTimer) clearInterval(breakCountdownTimer);

  breakCountdownTimer = setInterval(() => {
    secs--;
    document.getElementById("breakCountdownNum").innerText = secs;
    if (secs <= 0) {
      clearInterval(breakCountdownTimer);
      breakCountdownTimer = null;
      goToInnings2();
    }
  }, 1000);
}

function skipBreak() {
  if (breakCountdownTimer) {
    clearInterval(breakCountdownTimer);
    breakCountdownTimer = null;
  }
  goToInnings2();
}

function goToInnings2() {
  // Reset game screen for innings 2
  lastBalls = [];
  document.getElementById("mainScore").innerText = "0 / 0";
  document.getElementById("overDisplay").innerText = "0.0";
  document.getElementById("ballsLeftDisplay").innerText =
    matchMode === "limited" ? (matchOvers * 6) : "-";
  document.getElementById("runsLeftDisplay").innerText = "-";
  document.getElementById("rrrDisplay").innerText = "-";
  document.getElementById("inningsDisplay").innerText = "Innings: 2";
  document.getElementById("ballMessage").innerText = "";
  document.querySelectorAll(".ballBox").forEach(b => b.innerText = "-");
  window.handLocked = false;
  showScreen("gameScreen");
}

/* script.js — replace showBallMessage() */

function showBallMessage(out, lastRuns) {
  const msg = document.getElementById("ballMessage");
  if (out) {
    playSound("wicket");
    msg.innerText = "WICKET! 🔴";
    msg.style.color = "var(--red)";
  } else if (lastRuns === 6) {
    playSound("six");
    msg.innerText = "SIX! 🚀";
    msg.style.color = "var(--amber)";
  } else if (lastRuns === 4) {
    msg.innerText = "FOUR! 💥";
    msg.style.color = "var(--green)";
  } else if (lastRuns === 0) {
    msg.innerText = "DOT BALL •";
    msg.style.color = "var(--text-muted)";
  } else {
    msg.innerText = lastRuns + (lastRuns === 1 ? " RUN" : " RUNS");
    msg.style.color = "var(--text)";
  }
}

// ─── Server connection ────────────────────────────────────────────

function connectToServer(code, overs, wickets) {

  socket = new WebSocket(
    "wss://handcricket-server.mahin-aistudio.workers.dev/" + code
  );

  socket.onopen = () => {
    socket.send(JSON.stringify({
      type: "JOIN_ROOM",
      payload: { playerName, overs, wickets, mode: gameMode }
    }));
  };

  socket.onmessage = (event) => {
    console.log("Received:", event.data);
    const data = JSON.parse(event.data);

    // ── ROOM_JOINED ──
    if (data.type === "ROOM_JOINED") {
      roomCode = data.payload.roomCode;
      mySlot = data.payload.slot;
      document.getElementById("lobbyRoomCode").innerText = roomCode;
    }

    // ── LOBBY_UPDATE ──
    if (data.type === "LOBBY_UPDATE") {
      document.getElementById("lobbyRoomCode").innerText = roomCode;
      document.getElementById("teamA").innerText = data.payload.teamA || "Empty";
      document.getElementById("teamB").innerText = data.payload.teamB || "Empty";
    }

    // ── TOSS_CALLER ──
    if (data.type === "TOSS_CALLER") {
      showScreen("tossScreen");
      const iAmCaller =
        (isHost && data.payload.caller === "A") ||
        (!isHost && data.payload.caller === "B");
      document.getElementById("tossButtons").style.display = iAmCaller ? "flex" : "none";
      document.getElementById("tossWaiting").style.display = iAmCaller ? "none" : "block";
    }

    // ── TOSS_RESULT ──
    if (data.type === "TOSS_RESULT") {
      const teamAName = document.getElementById("teamA").innerText;
      const teamBName = document.getElementById("teamB").innerText;

      showScreen("decisionScreen");

      // Show toss result inline instead of alert
      document.getElementById("decisionWaiting").innerText =
        "🪙 " + data.payload.coin.toUpperCase() + " — " + data.payload.winner + " won the toss!";

      const amIWinner =
        (isHost && data.payload.winner === teamAName) ||
        (!isHost && data.payload.winner === teamBName);

      document.getElementById("decisionButtons").style.display = amIWinner ? "flex" : "none";
      document.getElementById("decisionWaiting").style.display = "block";
    }

    // ── MATCH_DECISION ──
    if (data.type === "MATCH_DECISION") {
      // Store mode from server so scoreboard is accurate
      matchMode = data.payload.mode;
      matchOvers = data.payload.overs || 0;

      currentBattingName = data.payload.batting;
      currentBowlingName = data.payload.bowling;

      // Reset ball history for fresh innings
      lastBalls = [];

      // Reset scoreboard to zero state
      document.getElementById("mainScore").innerText = "0 / 0";
      document.getElementById("overDisplay").innerText = "0.0";
      document.getElementById("targetDisplay").innerText = "-";
      document.getElementById("ballsLeftDisplay").innerText =
        matchMode === "limited" ? (matchOvers * 6) : "-";
      document.getElementById("runsLeftDisplay").innerText = "-";
      document.getElementById("rrrDisplay").innerText = "-";
      document.getElementById("battingName").innerText = "Bat: " + data.payload.batting;
      document.getElementById("bowlingName").innerText = "Bowl: " + data.payload.bowling;
      document.getElementById("inningsDisplay").innerText = "Innings: 1";
      document.getElementById("modeDisplay").innerText =
        "Single • " + (matchMode === "limited" ? "Limited" : "Unlimited");
      document.getElementById("ballMessage").innerText = "";

      // Reset ball boxes
      document.querySelectorAll(".ballBox").forEach(b => b.innerText = "-");

      showScreen("gameScreen");
    }

    // ── BALL_RESULT ──
    if (data.type === "BALL_RESULT") {
      window.handLocked = false;

      updateScoreboard(data.payload);
      updateBallHistory(data.payload.balls, data.payload.out, data.payload.lastRuns);
      showBallMessage(data.payload.out, data.payload.lastRuns);

      /* script.js — replace the matchOver block inside BALL_RESULT handler */

if (data.payload.matchOver) {
  const winner = data.payload.winner;
  const isDraw = winner === "Draw";
  setTimeout(() => {
    document.getElementById("resultEmoji").innerText = isDraw ? "🤝" : "🏆";
    document.getElementById("resultTitle").innerText = isDraw ? "It's a Draw!" : "Match Over!";
    document.getElementById("resultText").innerText =
      isDraw ? "Both teams scored the same!" : "🎉 Winner: " + winner;
    window.afterCopy = false;
    window.matchOverResult = true;
    showScreen("resultScreen");
  }, 900);
}
    }

    /* script.js — replace the INNINGS_BREAK handler inside socket.onmessage */

if (data.type === "INNINGS_BREAK") {
  window.handLocked = false;
  lastBalls = [];

  const p = data.payload;

  document.getElementById("breakBattedName").innerText = p.nextBowlingName;
  document.getElementById("breakScore1").innerText =
    p.innings1Score + " / " + p.innings1Wickets;
  document.getElementById("breakTarget").innerText = p.target;
  document.getElementById("breakBattingNext").innerText = p.nextBattingName;
  document.getElementById("breakModeInfo").innerText =
    p.mode === "limited"
      ? "Needs " + p.target + " in " + (p.overs * 6) + " balls"
      : "Needs " + p.target + " runs (no ball limit)";

  showScreen("inningsBreakScreen");
  startBreakCountdown();
}

    // ── ROOM_FULL ──
    if (data.type === "ROOM_FULL") {
      alert("Room is full!");
      showScreen("modeScreen");
    }
  };
}
