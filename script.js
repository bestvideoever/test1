// ===== Firebase Initialization =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase, ref, get, set, onValue, off, update, push, onChildAdded, remove } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

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

// ===== Global Variables =====
let currentUserId = "";
let currentChatFriend = "";
let pc = null;
let localStream = null;
let currentCallId = null;
let callType = "";
let busyTimeout = null;
let incomingRef = null;
let answerRef = null;
let remoteCandidatesRef = null;
let callStatusRef = null;

// ===== Show Pages =====
window.showLanding = () => {
  document.querySelectorAll("section").forEach(s => s.style.display = "none");
  document.getElementById("landing").style.display = "block";
};

window.showNicknamePage = () => {
  document.querySelectorAll("section").forEach(s => s.style.display = "none");
  document.getElementById("nicknamePage").style.display = "block";
};

window.showLoginPage = () => {
  document.querySelectorAll("section").forEach(s => s.style.display = "none");
  document.getElementById("loginPage").style.display = "block";
};

// ===== Account Creation =====
window.generateUserId = async () => {
  const nickname = document.getElementById("nicknameInput").value.trim();
  if (!nickname) return alert("Please enter a nickname");

  document.getElementById("loading").style.display = "block";
  const id = "user_" + Math.random().toString(36).substr(2, 9);
  document.getElementById("generatedId").value = id;

  setTimeout(() => {
    document.getElementById("loading").style.display = "none";
    document.getElementById("generatedDetails").style.display = "block";
  }, 1000);
};

window.finalizeAccount = async () => {
  const id = document.getElementById("generatedId").value.trim();
  const password = document.getElementById("createPassword").value.trim();
  const nickname = document.getElementById("nicknameInput").value.trim();
  if (!password) return alert("Enter a password");

  await set(ref(db, `users/${id}`), { nickname, password });
  document.querySelectorAll("section").forEach(s => s.style.display = "none");
  document.getElementById("successPage").style.display = "block";
};

// ===== Login =====
window.loginUser = async () => {
  const id = document.getElementById("loginId").value.trim();
  const pass = document.getElementById("loginPassword").value.trim();
  if (!id || !pass) return alert("Fill all fields");

  const snap = await get(ref(db, `users/${id}`));
  if (!snap.exists()) return alert("No such user");
  const data = snap.val();
  if (data.password !== pass) return alert("Wrong password");

  currentUserId = id;
  document.querySelectorAll("section").forEach(s => s.style.display = "none");
  document.getElementById("chatPage").style.display = "block";
  loadFriends();
  startIncomingListener();
};

// ===== Friend List =====
function loadFriends() {
  const friendsRef = ref(db, `friends/${currentUserId}`);
  onValue(friendsRef, async snapshot => {
    const list = document.getElementById("friendList");
    list.innerHTML = "";
    const friends = snapshot.val();
    if (!friends) return (list.innerHTML = "<p>No friends yet. Add some!</p>");
    for (const fid in friends) {
      const fsnap = await get(ref(db, `users/${fid}`));
      const fname = fsnap.exists() ? fsnap.val().nickname : fid;
      const div = document.createElement("div");
      div.textContent = `${fname} (${fid})`;
      div.onclick = () => openChat(fid, fname);
      list.appendChild(div);
    }
  });
}

window.openChat = (fid, fname) => {
  currentChatFriend = fid;
  document.getElementById("chatWith").textContent = `${fname} (${fid})`;
  document.getElementById("chatView").style.display = "block";
  document.getElementById("friendList").style.display = "none";
  listenMessages();
};

window.backToFriendList = async () => {
  if (currentCallId) await hangupCall();
  currentChatFriend = "";
  document.getElementById("chatView").style.display = "none";
  document.getElementById("friendList").style.display = "block";
};

// ===== Messaging =====
function listenMessages() {
  const mref1 = ref(db, `messages/${currentUserId}_${currentChatFriend}`);
  const mref2 = ref(db, `messages/${currentChatFriend}_${currentUserId}`);
  let msgs = {};
  const updateUI = () => {
    const div = document.getElementById("chatMessages");
    div.innerHTML = "";
    const sorted = Object.keys(msgs).sort((a,b) => msgs[a].timestamp - msgs[b].timestamp);
    sorted.forEach(k => {
      const m = msgs[k];
      const el = document.createElement("div");
      el.textContent = m.message;
      el.className = m.sender === currentUserId ? "me" : "friend";
      div.appendChild(el);
    });
    div.scrollTop = div.scrollHeight;
  };
  onValue(mref1, snap => { msgs = {...msgs, ...snap.val()}; updateUI(); });
  onValue(mref2, snap => { msgs = {...msgs, ...snap.val()}; updateUI(); });
}

window.sendMessage = async () => {
  const inp = document.getElementById("messageInput");
  const msg = inp.value.trim();
  if (!msg) return;
  const key = push(ref(db, `messages/${currentUserId}_${currentChatFriend}`)).key;
  await update(ref(db, `messages/${currentUserId}_${currentChatFriend}/${key}`), {
    sender: currentUserId,
    receiver: currentChatFriend,
    message: msg,
    timestamp: Date.now()
  });
  inp.value = "";
};

// ===== CALLING FIXES =====
function createPeerConnection(targetId) {
  pc = new RTCPeerConnection();
  pc.ontrack = e => {
    if (e.streams[0]) {
      remoteVideoEl.srcObject = e.streams[0];
      remoteAudioEl.srcObject = e.streams[0];
    }
  };
  pc.onicecandidate = e => {
    if (e.candidate) push(ref(db, `candidates/${targetId}/${currentUserId}`), e.candidate.toJSON());
  };
}

async function startCall(media) {
  if (!currentChatFriend) return alert("Select a friend first");
  const busySnap = await get(ref(db, `incoming/${currentChatFriend}`));
  if (busySnap.exists()) return alert("Friend is busy");

  callType = media;
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: media === "video" });
  showPreviewArea(media);

  currentCallId = `${Date.now()}_${currentUserId}_${currentChatFriend}`;
  createPeerConnection(currentChatFriend);
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  await set(ref(db, `incoming/${currentChatFriend}`), { from: currentUserId, sdp: offer.sdp, type: offer.type, media, timestamp: Date.now(), callId: currentCallId });
  await set(ref(db, `calls/${currentCallId}`), { caller: currentUserId, callee: currentChatFriend, status: 'ringing', timestamp: Date.now() });

  busyTimeout = setTimeout(() => hangupCall(), 30000);

  answerRef = ref(db, `answers/${currentUserId}/${currentChatFriend}`);
  onValue(answerRef, snap => {
    const ans = snap.val();
    if (ans && ans.sdp) {
      clearTimeout(busyTimeout);
      pc.setRemoteDescription({ type: ans.type, sdp: ans.sdp });
    }
  });

  listenForRemoteCandidates(currentChatFriend);
}

function startIncomingListener() {
  incomingRef = ref(db, `incoming/${currentUserId}`);
  onValue(incomingRef, async snap => {
    if (!snap.exists()) return (document.getElementById("incomingModal").style.display = "none");
    const offer = snap.val();
    if (currentCallId) { await remove(ref(db, `incoming/${currentUserId}`)); return; }

    document.getElementById("incomingText").innerText = `Incoming ${offer.media} call`;
    document.getElementById("incomingModal").style.display = "block";
    busyTimeout = setTimeout(() => { rejectCall(); }, 30000);

    document.getElementById("acceptCallBtn").onclick = async () => {
      clearTimeout(busyTimeout);
      acceptCall(offer);
    };
    document.getElementById("rejectCallBtn").onclick = () => rejectCall();
  });
}

async function acceptCall(offer) {
  currentCallId = offer.callId;
  callType = offer.media;
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callType === "video" });
  showPreviewArea(callType);

  createPeerConnection(offer.from);
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  await pc.setRemoteDescription({ type: offer.type, sdp: offer.sdp });
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await set(ref(db, `answers/${offer.from}/${currentUserId}`), { sdp: answer.sdp, type: answer.type, callId: currentCallId });

  await update(ref(db, `calls/${currentCallId}`), { status: "connected" });
  listenForRemoteCandidates(offer.from);
  document.getElementById("incomingModal").style.display = "none";
}

async function rejectCall() {
  await remove(ref(db, `incoming/${currentUserId}`));
  document.getElementById("incomingModal").style.display = "none";
}

function listenForRemoteCandidates(fromId) {
  remoteCandidatesRef = ref(db, `candidates/${currentUserId}/${fromId}`);
  onChildAdded(remoteCandidatesRef, snap => {
    if (pc) pc.addIceCandidate(snap.val());
  });
}

function showPreviewArea(media) {
  document.getElementById("callPreview").style.display = "block";
  if (media === "video") {
    document.getElementById("callPreviewVideoLocal").style.display = "inline-block";
    document.getElementById("callPreviewVideoLocal").srcObject = localStream;
  } else {
    document.getElementById("callPreviewAudioLocal").style.display = "block";
    document.getElementById("callPreviewAudioLocal").srcObject = localStream;
  }
}

async function hangupCall() {
  if (currentCallId) await update(ref(db, `calls/${currentCallId}`), { status: "ended" });
  await localCleanup();
}

async function localCleanup() {
  if (pc) pc.close();
  if (localStream) localStream.getTracks().forEach(t => t.stop());
  await remove(ref(db, `incoming/${currentChatFriend}`));
  currentCallId = null;
}

document.getElementById("audioCallHalf").onclick = () => startCall("audio");
document.getElementById("videoCallHalf").onclick = () => startCall("video");
document.getElementById("hangupCallBtn").onclick = () => hangupCall();

window.addEventListener("beforeunload", () => { if (currentCallId) hangupCall(); });

// Typing effect
window.addEventListener("DOMContentLoaded", () => {
  const text = "OnlineWebChat";
  const target = document.getElementById("typingHeading");
  let i = 0;
  (function typeChar() {
    if (i < text.length) {
      target.textContent += text[i++];
      setTimeout(typeChar, 150);
    }
  })();
});
