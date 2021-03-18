interface MessageJoin {
    type: "join";
    roomId: string;
}

/**
 * Tells the broadcaster a viewer has connected
 */
interface MessageViewer {
    type: "viewer";
    viewerId: string;
}

/**
 * Ask the server to resend the VIEWER messages
 */
interface MessageRequestViewers {
    type: "requestviewers";
}

/**
 * Tells the broadcaster a viewer has disconnected
 */
interface MessageViewerDisconnected {
    type: "viewerdisconnected";
    viewerId: string;
}

/**
 * Tells the viewer the broadcaster has disconnected.
 */
interface MessageBroadcasterDisconnected {
    type: "broadcasterdisconnected";
}

/**
 * Sends a WebRTC message between the viewer and the server
 */
interface MessageWebRTCViewer {
    type: "webrtcviewer";
    kind: "offer" | "answer" | "candidate";
    message: any;
}

/**
 * Sends a WebRTC message between the server and the broadcaster
 */
interface MessageWebRTCBroadcaster {
    type: "webrtcbroadcaster";
    viewerId: string;
    kind: "offer" | "answer" | "candidate";
    message: any;
}

type Message = MessageViewer |
    MessageViewerDisconnected |
    MessageBroadcasterDisconnected |
    MessageWebRTCViewer |
    MessageWebRTCBroadcaster |
    MessageRequestViewers |
    MessageJoin;

interface MessageSender {
    (msg: Message): Promise<void>;
}

/**
 * Pause execution until the listener/event has fired on the given target.
 *
 * @see https://stackoverflow.com/a/63718685
 */
function wait(target: EventTarget, listenerName: string): Promise<Event> {
    // Lambda that returns a listener for the given resolve lambda
    const listener = (resolve: (value: Event | PromiseLike<Event>) => void) => (event: Event) => {
        target.removeEventListener(listenerName, listener(resolve));
        resolve(event);
    };

    return new Promise((resolve, _reject) => {
        target.addEventListener(listenerName, listener(resolve))
    });
}

interface Client {
    /**
     * Handles the messages received from the signaling server.
     *
     * @param msg
     */
    handleMessage(msg: Message): void;
}

/**
 * Represents a broadcaster. The broadcaster is responsible for capturing and sending
 * their screen (and maybe audio) to all peers.
 */
class Broadcaster implements Client {
    public onviewerjoin: ((viewerId: string) => void) | null = null;
    public onviewerleave: ((viewerId: string) => void) | null = null;

    private readonly sendMessage: MessageSender;
    private readonly rtcConfig: RTCConfiguration;
    private readonly mediaStream: MediaStream;

    private readonly viewers: { [id: string]: RTCPeerConnection } = {};

    /**
     * Broadcaster constructor.
     *
     * @param sendMessage Function to send a message to the server
     * @param rtcConfig The WebRTC configuration to use for the WebRTC connection
     * @param mediaStream The MediaStream to broadcast
     */
    constructor(sendMessage: MessageSender, rtcConfig: RTCConfiguration, mediaStream: MediaStream) {
        this.sendMessage = sendMessage;
        this.rtcConfig = rtcConfig;
        this.mediaStream = mediaStream;
    }

    /**
     * @inheritDoc
     */
    async handleMessage(msg: MessageViewer | MessageViewerDisconnected | MessageWebRTCBroadcaster): Promise<void> {
        switch (msg.type) {
            case "viewer":
                await this.addViewer(msg.viewerId);
                break;
            case "viewerdisconnected":
                await this.removeViewer(msg.viewerId);
                break;
            case "webrtcbroadcaster":
                await this.handleWebRTCMessage(msg);
                break;
        }
    }

    /**
     * Adds a viewer to the peer-to-peer connection.
     *
     * @param viewerId
     * @private
     */
    private async addViewer(viewerId: string): Promise<void> {
        const viewerConnection = new RTCPeerConnection(this.rtcConfig);

        for (const track of await this.mediaStream.getTracks()) {
            viewerConnection.addTrack(track, this.mediaStream);
        }

        viewerConnection.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
            if (!event.candidate) return;

            this.sendMessage({
                "type": "webrtcbroadcaster",
                "kind": "candidate",
                "viewerId": viewerId,
                "message": event.candidate
            });
        };

        viewerConnection.onicegatheringstatechange = async (_event: Event) => {
            if (viewerConnection.iceGatheringState !== "complete") {
                return;
            }

            for (const sender of await viewerConnection.getSenders()) {
                if (sender.track == null) {
                    continue;
                }

                const rtcSendParameters = sender.getParameters();

                // https://developer.mozilla.org/en-US/docs/Web/API/RTCRtpSender/setParameters#currently_compatible_implementation
                if (!rtcSendParameters.encodings) {
                    rtcSendParameters.encodings = [{}];
                }

                if (sender.track.kind === "audio") {
                    rtcSendParameters.encodings[0].maxBitrate = 960000; // 960 Kbps, does gek
                } else if (sender.track.kind === "video") {
                    rtcSendParameters.encodings[0].maxFramerate = 30;
                    rtcSendParameters.encodings[0].maxBitrate = 100000000; // 100 Mbps
                }

                await sender.setParameters(rtcSendParameters);
            }
        };

        const offer = await viewerConnection.createOffer();
        await viewerConnection.setLocalDescription(offer);
        const localDescription = viewerConnection.localDescription;

        if (localDescription == null) {
            throw "No local description available.";
        }

        await this.sendMessage({
            "type": "webrtcbroadcaster",
            "kind": "offer",
            "viewerId": viewerId,
            "message": localDescription
        });

        this.viewers[viewerId] = viewerConnection;

        if (this.onviewerjoin != null) {
            this.onviewerjoin(viewerId);
        }
    }

    /**
     * Removes a viewer from the peer-to-peer connection.
     *
     * @param viewerId
     * @private
     */
    private async removeViewer(viewerId: string): Promise<void> {
        if (this.viewers[viewerId] == null) {
            return;
        }

        this.viewers[viewerId].close();
        delete this.viewers[viewerId];

        if (this.onviewerleave != null) {
            this.onviewerleave(viewerId);
        }
    }

    /**
     * Handles incoming WebRTC messages.
     *
     * @param msg
     * @private
     */
    private async handleWebRTCMessage(msg: MessageWebRTCBroadcaster): Promise<void> {
        const kind = msg.kind;

        switch (kind) {
            case "candidate":
                if (this.viewers[msg.viewerId] == null) {
                    break;
                }

                await this.viewers[msg.viewerId].addIceCandidate(new RTCIceCandidate(msg.message));
                break;
            case "answer":
                if (this.viewers[msg.viewerId] == null) {
                    break;
                }

                await this.viewers[msg.viewerId].setRemoteDescription(msg.message);
                break;
        }
    }
}

/**
 * Represents a viewer.
 */
class Viewer implements Client {
    private readonly sendMessage: MessageSender;
    private readonly rtcConfig: RTCConfiguration;
    private readonly videoElement: HTMLVideoElement;

    private broadcasterPeerConnection: RTCPeerConnection | null = null;

    /**
     * Viewer constructor.
     *
     * @param sendMessage Function to send a message to the server
     * @param rtcConfig The WebRTC configuration to use for the WebRTC connection
     * @param videoElement The element to project the received MediaStream onto
     */
    constructor(sendMessage: MessageSender, rtcConfig: RTCConfiguration, videoElement: HTMLVideoElement) {
        this.sendMessage = sendMessage;
        this.rtcConfig = rtcConfig;
        this.videoElement = videoElement;
    }

    /**
     * @inheritDoc
     */
    async handleMessage(msg: MessageBroadcasterDisconnected | MessageWebRTCViewer): Promise<void> {
        switch (msg.type) {
            case "broadcasterdisconnected":
                await this.handleBroadcasterDisconnect();
                break;
            case "webrtcviewer":
                await this.handleWebRTCMessage(msg);
                break;
        }
    }

    /**
     * Handles a disconnect of the broadcaster.
     *
     * @private
     */
    private async handleBroadcasterDisconnect(): Promise<void> {
        const popup = document.createElement("div");

        popup.id = "popup";
        popup.innerText = "The broadcaster has disconnected"

        document.body.prepend(popup);
        document.body.removeChild(this.videoElement);
    }

    /**
     * Handles incoming WebRTC messages.
     *
     * @param msg
     * @private
     */
    private async handleWebRTCMessage(msg: MessageWebRTCViewer): Promise<void> {
        const kind = msg.kind;

        switch (kind) {
            case "candidate":
                if (this.broadcasterPeerConnection == null) {
                    break;
                }

                await this.broadcasterPeerConnection.addIceCandidate(new RTCIceCandidate(msg.message));
                break;
            case "offer":
                await this.handleOffer(msg);
                break;
        }
    }

    /**
     * Handles incoming WebRTC offer.
     *
     * @param msg
     * @private
     */
    private async handleOffer(msg: MessageWebRTCViewer): Promise<void> {
        this.broadcasterPeerConnection = new RTCPeerConnection(this.rtcConfig);

        this.broadcasterPeerConnection.ontrack = (event: RTCTrackEvent) => {
            this.videoElement.srcObject = event.streams[0];
        };

        this.broadcasterPeerConnection.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
            if (event.candidate == null) return;

            this.sendMessage({
                "type": "webrtcviewer",
                "kind": "candidate",
                "message": event.candidate
            });
        };

        await this.broadcasterPeerConnection.setRemoteDescription(msg.message);

        const answer = await this.broadcasterPeerConnection.createAnswer();
        await this.broadcasterPeerConnection.setLocalDescription(answer);

        if (this.broadcasterPeerConnection == null) {
            throw "No local description available.";
        }

        await this.sendMessage({
            "type": "webrtcviewer",
            "kind": "answer",
            "message": this.broadcasterPeerConnection.localDescription
        });
    }
}

class Room {
    private readonly roomId: string;
    private readonly videoElement: HTMLVideoElement;
    private readonly webSocket: WebSocket;
    private readonly sendMessage: MessageSender;
    private readonly rtcConfig: RTCConfiguration;

    /**
     * Room constructor.
     *
     * @param roomId The ID of this room
     */
    constructor(roomId: string) {
        this.roomId = roomId;
        this.videoElement = <HTMLVideoElement>document.getElementById("stream");

        const webSocketProtocol = window.location.protocol === "http" ? "ws" : "wss";
        const webSocketUrl = webSocketProtocol + "://" + location.host + location.pathname;

        this.webSocket = new WebSocket(webSocketUrl);
        this.sendMessage = async (message: Message) => this.webSocket.send(JSON.stringify(message));
        this.rtcConfig = {
            iceServers: [
                {"urls": "stun:stun.stunprotocol.org:3478"}
            ],
            iceCandidatePoolSize: 8
        };

        this.videoElement.onpause = (_event: Event) => this.videoElement.play();
        window.onunload = window.onbeforeunload = () => this.webSocket.close();
    }

    /**
     * Joins the room.
     */
    async join() {
        // Wait until the socket opens
        await wait(this.webSocket, "open");

        this.webSocket.onmessage = async (event: MessageEvent) => {
            const messageData = JSON.parse(event.data);
            const isBroadcaster = messageData.type === "broadcast";
            const client = isBroadcaster ?
                await this.setupBroadcaster() :
                await this.setupViewer();

            this.webSocket.onmessage = (event: MessageEvent) => client.handleMessage(JSON.parse(event.data));

            if (isBroadcaster) {
                await this.sendMessage({"type": "requestviewers"});
            }

            this.setDocumentTitle();
        };

        await this.sendMessage({"type": "join", "roomId": this.roomId.toLowerCase()});
    }

    /**
     * Sets the document's title to the room name.
     */
    private setDocumentTitle() {
        const roomIdWords = this.roomId.split(/(?=[A-Z])/);
        document.title = roomIdWords.join(" ") + " | screensy";
    }

    /**
     * Set up a Broadcaster instance.
     */
    private async setupBroadcaster(): Promise<Broadcaster> {
        const mediaStream = await this.getDisplayMediaStream();
        const broadcaster = new Broadcaster(this.sendMessage, this.rtcConfig, mediaStream);
        const counterElement: HTMLParagraphElement = document.createElement("p");

        counterElement.id = "counter";
        counterElement.innerText = "0";

        broadcaster.onviewerjoin = (_viewerId: string) => {
            const currentCounter = parseInt(counterElement.innerText);
            counterElement.innerText = (currentCounter + 1).toString();
        }

        broadcaster.onviewerleave = (_viewerId: string) => {
            const currentCounter = parseInt(counterElement.innerText);
            counterElement.innerText = (currentCounter - 1).toString();
        }

        document.body.prepend(counterElement);
        this.videoElement.srcObject = mediaStream;

        return broadcaster;
    }

    /**
     * Set up a Viewer instance.
     */
    private async setupViewer(): Promise<Viewer> {
        // The client is assigned the role of viewer
        return new Viewer(this.sendMessage, this.rtcConfig, this.videoElement);
    }

    /**
     * Returns the user's display MediaStream.
     *
     * @private
     */
    private async getDisplayMediaStream(): Promise<MediaStream> {
        const popup = document.createElement("div");

        popup.id = "popup";
        popup.style.cursor = "pointer";
        popup.innerText = "Click anywhere to share your screen"

        document.body.prepend(popup);

        await wait(document, "click");

        const videoConstraints: MediaTrackConstraints | boolean = true;
        const audioConstraints: MediaTrackConstraints | boolean = {
            "channelCount": {"ideal": 2},
            "sampleRate": {"ideal": 192000},
            "noiseSuppression": {"ideal": false},
            "echoCancellation": {"ideal": false},
            "autoGainControl": {"ideal": false}
        };

        const mediaConstraints: MediaStreamConstraints = {
            video: videoConstraints,
            audio: audioConstraints
        };

        const mediaDevices: MediaDevices = window.navigator.mediaDevices;

        // @ts-ignore getDisplayMedia is not supported by TypeScript :(
        const displayMedia = mediaDevices.getDisplayMedia(mediaConstraints);

        // If the promise is resolved, remove the popup from the screen
        displayMedia.then(() => {
            document.body.removeChild(popup);
        });

        // If the promise is rejected, leave the popup and tell the user about the failure
        displayMedia.catch(() => {
            popup.innerText = "You denied access to your screen";
            popup.style.cursor = "inherit";
        });

        return displayMedia;
    }
}

/**
 * Generates a random readable room name and returns the words as a string array.
 *
 * @source https://github.com/jitsi/js-utils/blob/master/random/roomNameGenerator.js
 */
function generateRoomName(): string {
    const adjectives = [
        "large", "small", "beautiful", "heavenly", "red", "yellow", "green",
        "orange", "purple", "massive", "tasty", "cheap", "fancy", "expensive",
        "crazy", "round", "square", "triangular", "powered", "blue"
    ];

    const pluralNouns = [
        "monsters", "people", "cars", "buttons", "vegetables", "students",
        "computers", "robots", "lamps", "doors", "wizards", "books", "shirts",
        "pens", "guitars", "bottles", "microphones", "pants", "drums", "plants"
    ];

    const verbs = [
        "break", "roll", "flip", "grow", "bake", "create", "cook", "smack",
        "drink", "close", "display", "run", "move", "flop", "wrap", "enter",
        "dig", "fly", "swim", "draw"
    ];

    const adverbs = [
        "gingerly", "thoroughly", "heavily", "crazily", "mostly", "fast",
        "slowly", "merrily", "quickly", "heavenly", "cheerfully", "honestly",
        "politely", "bravely", "vivaciously", "fortunately", "innocently",
        "kindly", "eagerly", "elegantly"
    ];

    const idxAdjective = Math.floor(Math.random() * adjectives.length);
    const idxPluralNoun = Math.floor(Math.random() * pluralNouns.length);
    const idxVerb = Math.floor(Math.random() * verbs.length);
    const idxAdverb = Math.floor(Math.random() * adverbs.length);

    const words = [
        adjectives[idxAdjective],
        pluralNouns[idxPluralNoun],
        verbs[idxVerb],
        adverbs[idxAdverb]
    ];

    // @see https://flaviocopes.com/how-to-uppercase-first-letter-javascript/
    return words.map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join("");
}

async function main(_event: Event) {
    if (window.location.hash == "") {
        // Redirect the user to a room
        window.location.replace("#" + generateRoomName());
    }

    // If the user manually changes the hash, force a reload
    window.onhashchange = (_event: HashChangeEvent) => {
        location.reload();
    };

    const room = new Room(window.location.hash.substring(1));
    await room.join();
}

window.addEventListener("DOMContentLoaded", main);