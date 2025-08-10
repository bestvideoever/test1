// small safe global stubs for immediate onclick availability
function showLanding() {
  try {
    document.getElementById("landing").style.display = "block";
    document.getElementById("nicknamePage").style.display = "none";
    document.getElementById("successPage").style.display = "none";
    document.getElementById("loginPage").style.display = "none";
    document.getElementById("chatPage").style.display = "none";
  } catch(e){}
}

function showNicknamePage() {
  try {
    document.getElementById("landing").style.display = "none";
    document.getElementById("nicknamePage").style.display = "block";
    document.getElementById("nicknameInput").value = "";
    document.getElementById("loading").style.display = "none";
    document.getElementById("generatedDetails").style.display = "none";
    document.getElementById("generatedId").value = "";
    document.getElementById("createPassword").value = "";
  } catch(e){}
}

function showLoginPage() {
  try {
    document.getElementById("landing").style.display = "none";
    document.getElementById("loginPage").style.display = "block";
    document.getElementById("loginId").value = "";
    document.getElementById("loginPassword").value = "";
  } catch(e){}
}

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase, ref, get, set, onValue, off, update, push, onChildAdded, remove } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

// your firebase config (unchanged)
const firebaseConfig = {
  apiKey: "AIzaSyA9pmgthHuuMCE5zq8VLlk8jvgjQjfESWU",
  authDomain: "online-web-chat-22e51.firebaseapp.com",
  databaseURL: "https://online-web-chat-22e51-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "online-web-chat-22e51",
  storageBucket: "online-web-chat-22e51.appspot.com",
  messagingSenderId: "389702378019",
  appId: "1:389702378019:web:b53f8d6621c47f8d2c8796",
  measurementId: "G-M7SXNWGNRQ"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// existing app variables
let currentUserId = "";
let currentChatFriend = "";
let friendsListener = null;
let messagesListener = null;

// calling variables
let pc = null;
let localStream = null;
let callType = null; // 'audio' or 'video'
const pcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// call tracking
let currentCallId = null;
let incomingRef = null;         // incoming/<myId> global (keeps attached after login)
let answerRef = null;           // answers/<caller>/<callee> per-call
let remoteCandidatesRef = null; // candidates/<myId>/<peer> per-call
let callStatusRef = null;       // calls/<callId> per-call

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

/* ------------------ App logic ------------------ */
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
  // start a persistent incoming listener for this user
  startIncomingListener();
};

window.toggleAddFriendSection = () => {
  const sec = document.getElementById("addFriendSection");
  sec.style.display = sec.style.display === "none" ? "block" : "none";
};

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

// (continued below: loadFriends, messaging, WebRTC, etc.)
