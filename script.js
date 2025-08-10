// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase, ref, get, set, onValue, off, update, push, onChildAdded, remove } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

// New Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyA_VwoVKxDJEh-vWjMLQ_0Bbfl1yRwjyd0",
  authDomain: "nologinchatcall.firebaseapp.com",
  databaseURL: "https://nologinchatcall-default-rtdb.firebaseio.com",
  projectId: "nologinchatcall",
  storageBucket: "nologinchatcall.firebasestorage.app",
  messagingSenderId: "36865683290",
  appId: "1:36865683290:web:fd3bbbe55d688feb408d63",
  measurementId: "G-QTEZZYBGH3"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// App variables
let currentUserId = "";
let currentChatFriend = "";
let friendsListener = null;
let messagesListener = null;

// Calling variables
let pc = null;
let localStream = null;
let callType = null;
let currentCallId = null;
let incomingRef = null;
let answerRef = null;
let remoteCandidatesRef = null;
let callStatusRef = null;
const pcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// UI elements
const callBar = document.getElementById('callBar');
const audioCallHalf = document.getElementById('audioCallHalf');
const videoCallHalf = document.getElementById('videoCallHalf');
const callPreview = document.getElementById('callPreview');
const localVideoEl = document.getElementById('callPreviewVideoLocal');
const remoteVideoEl = document.getElementById('callPreviewVideoRemote');
const localAudioEl = document.getElementById('callPreviewAudioLocal');
const remoteAudioEl = document.getElementById('callPreviewAudioRemote');
const hangupCallBtn = document.getElementById('hangupCallBtn');
const incomingModal = document.getElementById('incomingModal');
const incomingText = document.getElementById('incomingText');
const acceptCallBtn = document.getElementById('acceptCallBtn');
const rejectCallBtn = document.getElementById('rejectCallBtn');

// UI helpers
function showSection(id) {
  ["landing", "nicknamePage", "successPage", "loginPage", "chatPage"].forEach(sid => {
    document.getElementById(sid).style.display = sid === id ? "block" : "none";
  });
}

window.showLanding = () => showSection("landing");

window.showNicknamePage = () => {
  showSection("nicknamePage");
  document.getElementById("nicknameInput").value = "";
  document.getElementById("loading").style.display = "none";
  document.getElementById("generatedDetails").style.display = "none";
  document.getElementById("generatedId").value = "";
  document.getElementById("createPassword").value = "";
};

window.showLoginPage = () => {
  showSection("loginPage");
  document.getElementById("loginId").value = "";
  document.getElementById("loginPassword").value = "";
};

// Account creation
window.generateUserId = () => {
  const nickname = document.getElementById("nicknameInput").value.trim();
  if (!nickname) return alert("Please enter your nickname");
  document.getElementById("loading").style.display = "block";
  const firstLetter = nickname[0].toLowerCase();
  const generateId = () => firstLetter + Math.floor(100 + Math.random() * 900);
  const checkAndGenerateUniqueId = async () => {
    let id = generateId();
    let snap = await get(ref(db, "users/" + id));
    while (snap.exists()) {
      id = generateId();
      snap = await get(ref(db, "users/" + id));
    }
    return id;
  };
  checkAndGenerateUniqueId().then(id => {
    setTimeout(() => {
      document.getElementById("loading").style.display = "none";
      document.getElementById("generatedDetails").style.display = "block";
      document.getElementById("generatedId").value = id;
    }, 700);
  });
};

window.finalizeAccount = async () => {
  const id = document.getElementById("generatedId").value.trim();
  const password = document.getElementById("createPassword").value;
  const nickname = document.getElementById("nicknameInput").value.trim();
  if (!password) return alert("Please enter a password");
  const userRef = ref(db, "users/" + id);
  const snap = await get(userRef);
  if (snap.exists()) { alert("ID already exists, try generating again"); return; }
  await set(userRef, { password, nickname });
  showSection("successPage");
};

// Login
window.loginUser = async () => {
  const id = document.getElementById("loginId").value.trim();
  const password = document.getElementById("loginPassword").value;
  if (!id || !password) return alert("Enter ID and password");
  const userRef = ref(db, "users/" + id);
  const snap = await get(userRef);
  if (!snap.exists()) return alert("User ID not found");
  const userData = snap.val();
  if (userData.password !== password) return alert("Password incorrect");
  currentUserId = id;
  showSection("chatPage");
  document.getElementById("friendList").style.display = "block";
  document.getElementById("chatView").style.display = "none";
  loadFriends();
  startIncomingListener();
};

// Toggle friend section
window.toggleAddFriendSection = () => {
  const sec = document.getElementById("addFriendSection");
  sec.style.display = sec.style.display === "none" ? "block" : "none";
};

// Add friend (FIXED)
window.addFriend = async () => {
  const friendId = document.getElementById("searchFriendId").value.trim();
  if (!friendId || friendId === currentUserId) return alert("Invalid Friend ID");
  const friendRef = ref(db, "users/" + friendId);
  const snap = await get(friendRef);
  if (!snap.exists()) return alert("Friend not found");
  await set(ref(db, `friends/${currentUserId}/${friendId}`), true);
  await set(ref(db, `friends/${friendId}/${currentUserId}`), true);
  alert("Friend added!");
  document.getElementById("searchFriendId").value = "";
  document.getElementById("addFriendSection").style.display = "none";
  loadFriends();
};

// Load friends
function loadFriends() {
  const friendsRef = ref(db, `friends/${currentUserId}`);
  if (friendsListener) { off(friendsRef); friendsListener = null; }
  friendsListener = onValue(friendsRef, async snapshot => {
    const friendListDiv = document.getElementById("friendList");
    friendListDiv.innerHTML = "";
    const friends = snapshot.val();
    if (!friends) { friendListDiv.innerHTML = "<p>No friends yet. Add some!</p>"; return; }
    for (const friendId in friends) {
      const friendSnap = await get(ref(db, `users/${friendId}`));
      const friendName = friendSnap.exists() ? friendSnap.val().nickname : friendId;
      const div = document.createElement('div');
      div.textContent = `${friendName} (${friendId})`;
      div.onclick = () => openChat(friendId, friendName);
      friendListDiv.appendChild(div);
    }
  });
}

// The rest of your message, calling, and cleanup logic remains the same...
