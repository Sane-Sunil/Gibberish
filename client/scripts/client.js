window.onload = async () => {
    // Fetch relay JSON
    const relayjson = await fetch('./json/relays.json').then(r => r.json());

    const sessionId = Math.random().toString(36).slice(2,10);
    document.getElementById('myUID').innerText = sessionId;

    const relayUrl = relayjson.url[Math.floor(Math.random() * relayjson.url.length)];
    const ws = new WebSocket(`ws://${relayUrl}:${relayjson.port}`);
    // const ws = new WebSocket(`ws://${relayUrl}`);
    console.log("Connecting to relay at:", `ws://${relayUrl}:${relayjson.port}`);

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
    appendChat(`Connected to relay.`, "system");
    };

    // Handle incoming messages
    ws.onmessage = async (e) => {
    const data = JSON.parse(e.data);

    if (data.type === "peer_disconnected") {
        if (recipientUID === data.peer) {
        appendChat(`Peer ${data.peer} disconnected. Chat ended.`, "system");
        recipientUID = "";
        document.getElementById('recipientUID').value = "";
        peerPublicKey = null;
        sentOwnPubKeyBack = false;
        }
        return;
    }

        if(data.type === "pubkey") {
            const rawKey = Uint8Array.from(atob(data.payload), c=>c.charCodeAt(0));
            peerPublicKey = await crypto.subtle.importKey(
                "spki", rawKey, { name:"RSA-OAEP", hash:"SHA-256" }, true, ["encrypt"]
            );
            recipientUID = data.from;  // <-- This line added to set recipientUID automatically
            appendChat(`Received public key from ${data.from}`, "system");

            if(!sentOwnPubKeyBack) {
                sentOwnPubKeyBack = true;
                const exported = await crypto.subtle.exportKey("spki", keyPair.publicKey);
                const payload = btoa(String.fromCharCode(...new Uint8Array(exported)));
                ws.send(JSON.stringify({ from: sessionId, to: data.from, type:"pubkey", payload }));
                appendChat(`Sent public key back to ${data.from}`, "system");
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

    // Start chat
    document.getElementById('start').onclick = async () => {
    const uid = document.getElementById('recipientUID').value.trim();
    if(!uid) return alert("Enter recipient UID to start chat");
    recipientUID = uid;

    const exported = await crypto.subtle.exportKey("spki", keyPair.publicKey);
    const payload = btoa(String.fromCharCode(...new Uint8Array(exported)));
    ws.send(JSON.stringify({ from: sessionId, to: recipientUID, type:"pubkey", payload }));
    appendChat(`Chat started with ${recipientUID}. Sent public key.`, "system");
    sentOwnPubKeyBack = true;
    };

    // Send message
    document.getElementById('send').onclick = async () => {
    if(!recipientUID) return alert("Start chat first");
    if(!peerPublicKey) return alert("Waiting for peer's public key");

    const msg = document.getElementById('msg').value.trim();
    if(!msg) return;

    const enc = await crypto.subtle.encrypt(
        { name:"RSA-OAEP" },
        peerPublicKey,
        new TextEncoder().encode(msg)
    );
    ws.send(JSON.stringify({ from: sessionId, to: recipientUID, type:"msg", payload: btoa(String.fromCharCode(...new Uint8Array(enc))) }));
    appendChat(`You: ${msg}`, "sent");
    document.getElementById('msg').value = '';
    };

    // Append messages to chat div
    function appendChat(text, type = "system") {
    const chat = document.getElementById('chat');
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', type);
    msgDiv.textContent = text;
    chat.appendChild(msgDiv);
    chat.scrollTop = chat.scrollHeight;
    }

};


