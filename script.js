// FIREBASE CONFIG & APP LOGIC
const firebaseConfig = {
    apiKey: "AIzaSyBfn1c-stzzb8F4ouaRkOZ8_lW7upKCMLg",
    authDomain: "form-1-2aebe.firebaseapp.com",
    projectId: "form-1-2aebe",
    storageBucket: "form-1-2aebe.firebasestorage.app",
    messagingSenderId: "865530965289",
    appId: "1:865530965289:web:c03342613566c78f0e9b38",
    measurementId: "G-ZHQH7EPKDH"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const $ = id => document.getElementById(id);
const RANKS = [
    { name: 'Novice', minPoints: 0, color: '#94a3b8' },
    { name: 'Acolyte', minPoints: 10, color: '#60a5fa' },
    { name: 'Lector', minPoints: 30, color: '#34d399' },
    { name: 'Deacon', minPoints: 100, color: '#f97316' },
    { name: 'Priest', minPoints: 160, color: '#a855f7' }
];

let currentUser = null, isSignup = false, isReset = false;

function getRank(pts) {
    let rank = RANKS[0];
    RANKS.forEach(r => { if (pts >= r.minPoints) rank = r; });
    return rank;
}

// Auth Views Switcher
$('toggleAuthBtn').onclick = () => {
    isSignup = !isSignup;
    isReset = false;
    $('loginForm').style.display = isSignup ? 'none' : 'block';
    $('signupForm').style.display = isSignup ? 'block' : 'none';
    $('resetForm').style.display = 'none';
    $('forgotLinkBox').style.display = isSignup ? 'none' : 'block';
    $('toggleText').textContent = isSignup ? 'Already have an account?' : "Don't have an account?";
    $('toggleAuthBtn').textContent = isSignup ? 'Sign in' : 'Create one';
};

$('forgotBtn').onclick = () => {
    isReset = true;
    $('loginForm').style.display = 'none';
    $('signupForm').style.display = 'none';
    $('resetForm').style.display = 'block';
    $('forgotLinkBox').style.display = 'none';
    $('toggleText').textContent = 'Back to';
    $('toggleAuthBtn').textContent = 'Sign in';
};

// Handlers
$('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    try {
        await auth.signInWithEmailAndPassword($('loginEmail').value, $('loginPassword').value);
    } catch(err) { showErr('loginError', err.message); }
};

$('signupForm').onsubmit = async (e) => {
    e.preventDefault();
    try {
        const cred = await auth.createUserWithEmailAndPassword($('signupEmail').value, $('signupPassword').value);
        const name = $('signupName').value;
        await db.collection('users').doc(cred.user.uid).set({ displayName: name, points: 0, rank: 'Novice' });
        await cred.user.updateProfile({ displayName: name });
    } catch(err) { showErr('signupError', err.message); }
};

$('resetForm').onsubmit = async (e) => {
    e.preventDefault();
    const email = $('resetEmail').value;
    try {
        await auth.sendPasswordResetEmail(email);
        showSuccess('resetSuccess', 'Password reset email sent! Check your inbox.');
    } catch(err) { showErr('resetError', err.message); }
};

$('logoutBtn').onclick = () => auth.signOut();

function showErr(id, msg) {
    const el = $(id); el.textContent = msg; el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 4000);
}

function showSuccess(id, msg) {
    const el = $(id); el.textContent = msg; el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 5000);
}

// Auth Observer
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        $('login-screen').classList.add('hidden');
        $('dashboard').classList.add('active');
        $('devUid').textContent = user.uid.substring(0, 8) + '...';
        loadUserData(user.uid);
        initRealtime();
        initFootballGame();
    } else {
        $('login-screen').classList.remove('hidden');
        $('dashboard').classList.remove('active');
    }
});

async function loadUserData(uid) {
    const doc = await db.collection('users').doc(uid).get();
    const data = doc.data() || { displayName: currentUser.displayName || 'User', points: 0 };
    $('userAvatar').textContent = (data.displayName || 'U')[0].toUpperCase();
    $('userNameDisplay').textContent = data.displayName || 'User';
    const rank = getRank(data.points || 0);
    $('userRankBadge').textContent = rank.name;
    $('userRankBadge').style.background = rank.color + '33';
    $('userRankBadge').style.color = rank.color;
}

function initRealtime() {
    // Chat with image auto-detect
    db.collection('messages').orderBy('timestamp', 'asc').limit(30).onSnapshot(snap => {
        let html = '';
        snap.forEach(d => {
            const m = d.data();
            const self = m.uid === currentUser.uid;
            const isImg = m.text.match(/\.(jpeg|jpg|gif|png|webp)$/i) != null || m.text.startsWith('http');
            
            let body = m.text;
            if (isImg && (m.text.startsWith('http://') || m.text.startsWith('https://'))) {
                body = `<div>${m.text}</div><img src="${m.text}" class="chat-img" alt="shared image" onerror="this.style.display='none'" />`;
            }

            html += `<div class="msg ${self?'self':''}"><b>${self?'You':m.displayName}:</b> ${body}</div>`;
        });
        $('chatMessages').innerHTML = html || '<div class="empty-state">No messages yet.</div>';
        $('chatMessages').scrollTop = $('chatMessages').scrollHeight;
    });

    // Leaderboard
    db.collection('users').orderBy('points', 'desc').limit(10).onSnapshot(snap => {
        let html = '';
        snap.forEach(d => {
            const u = d.data();
            const rank = getRank(u.points || 0);
            html += `<div class="leader-item">
                <div class="l-avatar" style="background:${rank.color}">${(u.displayName||'U')[0]}</div>
                <div style="flex:1"><b>${u.displayName||'User'}</b><br><small>${rank.name}</small></div>
                <div><b>${u.points||0} pts</b></div>
            </div>`;
        });
        $('leaderList').innerHTML = html;
    });
}

// Send Chat
$('chatSendBtn').onclick = sendMessage;
$('chatInput').onkeypress = (e) => { if(e.key === 'Enter') sendMessage(); };

async function sendMessage() {
    const text = $('chatInput').value.trim();
    if (!text) return;
    $('chatInput').value = '';
    await db.collection('messages').add({
        text: text, uid: currentUser.uid, displayName: currentUser.displayName || 'User', timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('users').doc(currentUser.uid).update({
        points: firebase.firestore.FieldValue.increment(1)
    });
    loadUserData(currentUser.uid);
}

// Motivational Quotes Rotator
const quotes = [
    { text: "Carry each other's burdens, and fulfill the law of Christ.", author: "Galatians 6:2" },
    { text: "I can do all things through Christ who strengthens me.", author: "Philippians 4:13" },
    { text: "Trust in the LORD with all your heart and lean not on your own understanding.", author: "Proverbs 3:5" },
    { text: "Be strong and courageous. Do not be afraid; do not be discouraged.", author: "Joshua 1:9" }
];
let currentQuoteIdx = 0;
$('newSpeechBtn').onclick = () => {
    currentQuoteIdx = (currentQuoteIdx + 1) % quotes.length;
    $('speechText').textContent = quotes[currentQuoteIdx].text;
    $('speechAuthor').textContent = quotes[currentQuoteIdx].author;
};

// Math Questions (Text & Image support)
const mathQuestions = [
    { q: "Solve for x: 2x + 6 = 14", ans: "4", img: "" },
    { q: "What is the area of a right triangle with base 6 and height 8?", ans: "24", img: "" },
    { q: "Evaluate: 12 / (2 + 1) * 2", ans: "8", img: "" }
];
let currentMathIdx = 0;
function loadMathQuestion() {
    const item = mathQuestions[currentMathIdx];
    $('mathQuestion').textContent = item.q;
    $('mathImgContainer').innerHTML = item.img ? `<img src="${item.img}" class="math-img" />` : '';
    $('mathFeedback').textContent = '';
    $('mathAnswerInput').value = '';
}
loadMathQuestion();

$('mathSubmitBtn').onclick = async () => {
    const userAns = $('mathAnswerInput').value.trim();
    if (userAns === mathQuestions[currentMathIdx].ans) {
        $('mathFeedback').style.color = '#34d399';
        $('mathFeedback').textContent = '🎉 Correct! +5 Points rewarded!';
        await db.collection('users').doc(currentUser.uid).update({
            points: firebase.firestore.FieldValue.increment(5)
        });
        loadUserData(currentUser.uid);
        setTimeout(() => {
            currentMathIdx = (currentMathIdx + 1) % mathQuestions.length;
            loadMathQuestion();
        }, 1500);
    } else {
        $('mathFeedback').style.color = '#ec4899';
        $('mathFeedback').textContent = '❌ Incorrect. Try again!';
    }
};

// Football Penalty Game Logic (Canvas - PC & Mobile friendly)
let gameScore = 0;
function initFootballGame() {
    const cvs = $('footballCanvas');
    const ctx = cvs.getContext('2d');
    cvs.width = cvs.parentElement.clientWidth;
    cvs.height = cvs.parentElement.clientHeight;

    let ballX = cvs.width / 2, ballY = cvs.height - 30;
    let keeperX = cvs.width / 2;

    function drawField() {
        ctx.clearRect(0,0,cvs.width,cvs.height);
        // Pitch
        ctx.fillStyle = '#1a4d2e';
        ctx.fillRect(0,0,cvs.width,cvs.height);
        // Goal posts
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 4;
        ctx.strokeRect(cvs.width * 0.2, 10, cvs.width * 0.6, 40);
        // Goalkeeper
        ctx.fillStyle = '#ec4899';
        ctx.fillRect(keeperX - 15, 25, 30, 15);
        // Ball
        ctx.beginPath();
        ctx.arc(ballX, ballY, 10, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.closePath();
    }

    function shoot(targetPos) { // 'left', 'center', 'right'
        const targetXMap = {
            left: cvs.width * 0.3,
            center: cvs.width * 0.5,
            right: cvs.width * 0.7
        };
        const options = ['left', 'center', 'right'];
        const keeperChoice = options[Math.floor(Math.random() * options.length)];
        
        keeperX = targetXMap[keeperChoice];
        ballX = targetXMap[targetPos];
        ballY = 40;

        drawField();

        if (targetPos !== keeperChoice) {
            gameScore += 10;
            $('gameScore').textContent = `GOAL! Score: ${gameScore} | Saved: NO`;
            $('gameScore').style.color = '#34d399';
        } else {
            $('gameScore').textContent = `SAVED! Score: ${gameScore} | Keeper blocked it!`;
            $('gameScore').style.color = '#ec4899';
        }

        setTimeout(() => {
            ballX = cvs.width / 2; ballY = cvs.height - 30;
            keeperX = cvs.width / 2;
            drawField();
        }, 1200);
    }

    $('shootLeftBtn').onclick = () => shoot('left');
    $('shootCenterBtn').onclick = () => shoot('center');
    $('shootRightBtn').onclick = () => shoot('right');

    // Keyboard support for PC
    window.onkeydown = (e) => {
        if (e.key === 'ArrowLeft') shoot('left');
        if (e.key === 'ArrowUp') shoot('center');
        if (e.key === 'ArrowRight') shoot('right');
    };

    drawField();
}

// Static Resources Setup
const resources = [
    { title: 'Theology of the Body', desc: 'Human love and dignity.' },
    { title: 'Sacred Scripture', desc: 'Old and New Testament studies.' },
    { title: 'Catechism', desc: 'Summary of Church doctrine.' },
    { title: 'Moral Theology', desc: 'Principles of Christian ethics.' }
];
$('eduGrid').innerHTML = resources.map(r => `<div class="edu-item"><b>${r.title}</b><p>${r.desc}</p></div>`).join('');

// Dev Panel Controls
$('devDots').onclick = () => $('devPanel').classList.toggle('open');
$('devRefresh').onclick = () => location.reload();
$('devClearChat').onclick = async () => {
    if(!confirm('Clear all chat messages?')) return;
    const snap = await db.collection('messages').get();
    snap.forEach(doc => doc.ref.delete());
};

// Background Particles Animation
(function() {
    const c = $('particles-canvas'), ctx = c.getContext('2d');
    let w = c.width = innerWidth, h = c.height = innerHeight;
    let pts = Array.from({length: 35}, () => ({x: Math.random()*w, y: Math.random()*h, vx: Math.random()-0.5, vy: Math.random()-0.5}));
    window.onresize = () => { w = c.width = innerWidth; h = c.height = innerHeight; };
    function draw() {
        ctx.clearRect(0,0,w,h);
        ctx.fillStyle = '#00f0ff';
        pts.forEach(p => {
            p.x += p.vx; p.y += p.vy;
            if(p.x<0||p.x>w) p.vx*=-1; if(p.y<0||p.y>h) p.vy*=-1;
            ctx.fillRect(p.x, p.y, 2, 2);
        });
        requestAnimationFrame(draw);
    }
    draw();
})();
