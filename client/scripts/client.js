window.onload = async () => {
    // Initialize connection status
    updateConnectionStatus('connecting');

    // Fetch relay JSON
    const relayjson = await fetch('./json/relays.json').then(r => r.json());

    const persistCheckbox = document.getElementById('persistUID');
    const persistUID = localStorage.getItem('persistUID') === 'true';
    persistCheckbox.checked = persistUID;

    let sessionId;
    if (persistUID && localStorage.getItem('savedUID')) {
        sessionId = localStorage.getItem('savedUID');
    } else {
        sessionId = Math.random().toString(36).slice(2,10);
        if (persistUID) {
            localStorage.setItem('savedUID', sessionId);
        }
    }
    document.getElementById('myUID').innerText = sessionId;

    persistCheckbox.addEventListener('change', () => {
        const isChecked = persistCheckbox.checked;
        localStorage.setItem('persistUID', isChecked);
        if (isChecked) {
            localStorage.setItem('savedUID', sessionId);
        } else {
            localStorage.removeItem('savedUID');
        }
    });

    // Mobile menu functionality
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    function toggleSidebar() {
        sidebar.classList.toggle('active');
        sidebarOverlay.classList.toggle('active');
    }

    function closeSidebar() {
        sidebar.classList.remove('active');
        sidebarOverlay.classList.remove('active');
    }

    mobileMenuToggle.onclick = toggleSidebar;
    sidebarOverlay.onclick = closeSidebar;

    // Close sidebar when clicking on chat area (mobile)
    document.querySelector('.main-content').addEventListener('click', function(e) {
        if (window.innerWidth <= 768 && sidebar.classList.contains('active')) {
            closeSidebar();
        }
    });

    // Modal functionality
    const infoModal = document.getElementById('info-modal');
    const infoBtn = document.getElementById('info-btn');
    const closeInfoBtn = document.getElementById('close-info-modal');

    // Info modal
    infoBtn.onclick = function() {
        infoModal.style.display = 'flex';
        closeSidebar(); // Close sidebar when opening modal on mobile
    }

    closeInfoBtn.onclick = function() {
        infoModal.style.display = 'none';
    }

    // Close modals when clicking outside
    window.onclick = function(event) {
        if (event.target == infoModal) {
            infoModal.style.display = 'none';
        }
    }

    // Dark mode functionality
    const themeToggle = document.getElementById('theme-toggle');
    const themeIcon = document.querySelector('.theme-icon');

    // Load saved theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    themeToggle.onclick = function() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';

        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcon(newTheme);
    }

    function updateThemeIcon(theme) {
        themeIcon.textContent = theme === 'light' ? '🌙' : '☀️';
    }

    // Copy UID functionality
    const copyUidBtn = document.getElementById('copy-uid');
    copyUidBtn.onclick = function() {
        const uidElement = document.getElementById('myUID');
        const uidText = uidElement.textContent;
        
        navigator.clipboard.writeText(uidText).then(() => {
            // Show success feedback
            copyUidBtn.classList.add('copied');
            copyUidBtn.querySelector('.copy-icon').textContent = '✅';
            
            // Reset after 2 seconds
            setTimeout(() => {
                copyUidBtn.classList.remove('copied');
                copyUidBtn.querySelector('.copy-icon').textContent = '📋';
            }, 2000);
        }).catch(err => {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = uidText;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            
            // Show success feedback
            copyUidBtn.classList.add('copied');
            copyUidBtn.querySelector('.copy-icon').textContent = '✅';
            
            setTimeout(() => {
                copyUidBtn.classList.remove('copied');
                copyUidBtn.querySelector('.copy-icon').textContent = '📋';
            }, 2000);
        });
    };

    const relayUrl = relayjson.url[Math.floor(Math.random() * relayjson.url.length)];
    // const ws = new WebSocket(`wss://${relayUrl}:${relayjson.port}`);
    const ws = new WebSocket(`wss://${relayUrl}`);
    // console.log("Connecting to relay at:", `ws://${relayUrl}:${relayjson.port}`);

    let recipientUID = "";
    let keyPair = null;
    let peerPublicKey = null;
    let sentOwnPubKeyBack = false;

    // Generate ephemeral RSA key pair
    async function generateKeys() {
    keyPair = await crypto.subtle.generateKey(
        { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: "SHA-256" },
        true,
        ["encrypt", "decrypt"]
    );
    }
    generateKeys();

    // Register UID with relay
    ws.onopen = () => {
    ws.send(JSON.stringify({ sessionId, register: true }));
    appendChat(`Connected with server.`, "system");
    updateConnectionStatus('connected');
    };

    // Handle incoming messages
    ws.onmessage = async (e) => {
    const data = JSON.parse(e.data);

    if (data.type === "peer_disconnected") {
        if (recipientUID === data.peer) {
        appendChat(`❌ Peer disconnected. Chat session ended.`, "system");
        recipientUID = "";
        document.getElementById('recipientUID').value = "";
        peerPublicKey = null;
        sentOwnPubKeyBack = false;
        const chatStatus = document.getElementById('chat-status');
        chatStatus.textContent = 'Peer disconnected';
        chatStatus.style.background = '#ef4444';
        }
        return;
    }

        if(data.type === "pubkey") {
            const rawKey = Uint8Array.from(atob(data.payload), c=>c.charCodeAt(0));
            peerPublicKey = await crypto.subtle.importKey(
                "spki", rawKey, { name:"RSA-OAEP", hash:"SHA-256" }, true, ["encrypt"]
            );
            recipientUID = data.from;
            appendChat(`🔗 Secure connection established with peer`, "system");

            if(!sentOwnPubKeyBack) {
                sentOwnPubKeyBack = true;
                const exported = await crypto.subtle.exportKey("spki", keyPair.publicKey);
                const payload = btoa(String.fromCharCode(...new Uint8Array(exported)));
                ws.send(JSON.stringify({ from: sessionId, to: data.from, type:"pubkey", payload }));
                appendChat(`✅ Ready to send encrypted messages`, "system");
            }
            return;
        }


    if(data.type === "msg") {
        if(!keyPair) return;
        const dec = await crypto.subtle.decrypt(
        { name:"RSA-OAEP" },
        keyPair.privateKey,
        Uint8Array.from(atob(data.payload), c=>c.charCodeAt(0))
        );
        const text = new TextDecoder().decode(dec);
        appendChat(`${data.from}: ${text}`, "received");
    }
    };

    // Clear chat functionality
    document.getElementById('clear-chat').onclick = function() {
        const chat = document.getElementById('chat');
        chat.innerHTML = '';
        const welcomeMessage = document.createElement('div');
        welcomeMessage.className = 'welcome-message';
        welcomeMessage.innerHTML = `
            <div class="welcome-icon">👋</div>
            <h3>Welcome back to Gibberish Chat</h3>
            <p>Start a new conversation or continue your current chat.</p>
        `;
        chat.appendChild(welcomeMessage);
    };



    // Send message
    document.getElementById('send').onclick = async () => {
    if(!recipientUID) return alert("Start chat first. Check info");
    if(!peerPublicKey) return alert("Waiting for peer's public key");
    if(ws.readyState !== WebSocket.OPEN) return alert("Connection lost. Please refresh.");

    const msg = document.getElementById('msg').value.trim();
    if(!msg) return;

    try {
        const enc = await crypto.subtle.encrypt(
            { name:"RSA-OAEP" },
            peerPublicKey,
            new TextEncoder().encode(msg)
        );
        ws.send(JSON.stringify({ from: sessionId, to: recipientUID, type:"msg", payload: btoa(String.fromCharCode(...new Uint8Array(enc))) }));
        appendChat(`You: ${msg}`, "sent");
        document.getElementById('msg').value = '';
    } catch (error) {
        console.error("Encryption error:", error);
        alert("Failed to encrypt message. Please try again.");
    }
    };

    // Enter to send, Shift+Enter for new line
    document.getElementById('msg').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('send').click();
      }
    });

    // Keep textarea at fixed height with internal scrolling
    const msgTextarea = document.getElementById('msg');
    // No auto-resize needed - textarea stays fixed height with internal scroll

    // Update connection status
    function updateConnectionStatus(status) {
        const statusDot = document.getElementById('connection-status');
        const statusText = document.querySelector('.status-text');
        const chatStatus = document.getElementById('chat-status');

        if (status === 'connected') {
            statusDot.style.background = '#10b981'; // green
            statusText.textContent = 'Connected';
            chatStatus.textContent = 'Ready to chat';
            chatStatus.style.background = '#10b981';
        } else if (status === 'connecting') {
            statusDot.style.background = '#f59e0b'; // yellow
            statusText.textContent = 'Connecting...';
            chatStatus.textContent = 'Connecting...';
            chatStatus.style.background = '#f59e0b';
        } else {
            statusDot.style.background = '#ef4444'; // red
            statusText.textContent = 'Disconnected';
            chatStatus.textContent = 'Disconnected';
            chatStatus.style.background = '#ef4444';
        }
    }

    // Update chat status when starting chat
    document.getElementById('start').onclick = async () => {
        const uid = document.getElementById('recipientUID').value.trim();
        if(!uid) return alert("Enter recipient UID to start chat");
        recipientUID = uid;

        const chatStatus = document.getElementById('chat-status');
        chatStatus.textContent = 'Connecting to peer...';
        chatStatus.style.background = '#f59e0b';

        const exported = await crypto.subtle.exportKey("spki", keyPair.publicKey);
        const payload = btoa(String.fromCharCode(...new Uint8Array(exported)));
        ws.send(JSON.stringify({ from: sessionId, to: recipientUID, type:"pubkey", payload }));
        appendChat(`Chat started with ${recipientUID}.`, "system");
        sentOwnPubKeyBack = true;
    };

    // Append messages to chat div
    function appendChat(text, type = "system") {
        const chat = document.getElementById('chat');
        const msgDiv = document.createElement('div');
        msgDiv.classList.add('message', type);
        msgDiv.innerHTML = text.replace(/\n/g, '<br>');
        chat.appendChild(msgDiv);
        chat.scrollTop = chat.scrollHeight;

        // Update chat status when receiving messages
        if (type === 'received' || type === 'sent') {
            const chatStatus = document.getElementById('chat-status');
            chatStatus.textContent = 'Active chat';
            chatStatus.style.background = '#10b981';
        }
    }

};


