import * as websocket from "ws";

/**
 * Tells the server the client wants to join the given room
 */
interface MessageJoin {
    type: "join";
    roomId: string;
}

/**
 * Tells the client that it is a broadcaster
 */
interface MessageBroadcast {
    type: "broadcast";
}

/**
 * Tells the client that it is a viewer
 */
interface MessageView {
    type: "view";
}

/**
 * Ask the server to resend the VIEWER messages
 */
interface MessageRequestViewers {
    type: "requestviewers";
}

/**
 * Tells the broadcaster a viewer has connected
 */
interface MessageViewer {
    type: "viewer";
    viewerId: string;
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

/**
 * Tells the broadcaster a viewer has disconnected
 */
interface MessageViewerDisconnected {
    type: "viewerdisconnected",
    viewerId: string
}

/**
 * Tells the viewer the broadcaster has disconnected.
 */
interface MessageBroadcasterDisconnected {
    type: "broadcasterdisconnected"
}

type FromBroadcasterMessage = MessageJoin | MessageWebRTCBroadcaster | MessageRequestViewers;
type FromViewerMessage = MessageJoin | MessageWebRTCViewer;

/**
 * Represents a screensharing room.
 */
class Room {
    private counter: number = 0;

    private broadcaster: WebSocket;
    private viewers: { [id:string]: WebSocket } = {};

    /**
     * Room constructor.
     *
     * @param broadcaster The WebSocket of the broadcaster of this room
     */
    constructor(broadcaster: WebSocket) {
        this.broadcaster = broadcaster;

        broadcaster.onmessage = (event: MessageEvent) => this.handleBroadcasterMessage(JSON.parse(event.data));

        // Tell the client that he has been assigned the role "broadcaster"
        const message: MessageBroadcast = {
            "type": "broadcast"
        };

        broadcaster.send(JSON.stringify(message));
    }

    /**
     * Called to add a new viewer to this room.
     *
     * @param viewer The WebSocket of the viewer that joined the room
     */
    addViewer(viewer: WebSocket) {
        const id: string = (this.counter++).toString();

        viewer.onmessage = (event: MessageEvent) => this.handleViewerMessage(id, JSON.parse(event.data));
        viewer.onclose = (_event: CloseEvent) => this.handleViewerDisconnect(id);

        // Tell the client that he has been assigned the role "broadcaster"
        const messageView: MessageView = {
            "type": "view"
        };

        viewer.send(JSON.stringify(messageView));

        // Tell the broadcaster a viewer has connected
        const messageViewer: MessageViewer = {
            "type": "viewer",
            "viewerId": id
        };

        this.broadcaster.send(JSON.stringify(messageViewer));
        this.viewers[id] = viewer;
    }

    /**
     * Called whenever a broadcaster sends a message.
     *
     * @param msg The message
     */
    handleBroadcasterMessage(msg: FromBroadcasterMessage) {
        switch (msg.type) {
            case "webrtcbroadcaster":
                const viewerId = msg.viewerId;
                const viewer = this.viewers[viewerId];

                if (viewer == null) {
                    // No viewer with the ID "viewerId" exists
                    break;
                }

                const message: MessageWebRTCViewer = {
                    "type": "webrtcviewer",
                    "kind": msg.kind,
                    "message": msg.message
                };

                viewer.send(JSON.stringify(message));

                break;
            case "requestviewers":
                for (const viewerId in this.viewers) {
                    const messageViewer: MessageViewer = {
                        "type": "viewer",
                        "viewerId": viewerId
                    };

                    this.broadcaster.send(JSON.stringify(messageViewer));
                }

                break;
            default:
                break;
        }
    }

    /**
     * Called whenever a viewer sends a message.
     *
     * @param viewerId The ID of the viewer that sent the message
     * @param msg The message
     */
    handleViewerMessage(viewerId: string, msg: FromViewerMessage) {
        switch (msg.type) {
            case "webrtcviewer":
                const message: MessageWebRTCBroadcaster = {
                    "type": "webrtcbroadcaster",
                    "kind": msg.kind,
                    "message": msg.message,
                    "viewerId": viewerId
                };

                this.broadcaster.send(JSON.stringify(message));

                break;
            default:
                // Invalid message type
                break;
        }
    }

    /**
     * Called whenever a viewer disconnects.
     *
     * @param viewerId The ID of the viewer that disconnected
     */
    handleViewerDisconnect(viewerId: string) {
        if (!(viewerId in this.viewers)) {
            throw "viewerId does not exist.";
        }

        delete this.viewers[viewerId];

        // Notify the broadcaster of the disconnect
        const message: MessageViewerDisconnected = {
            "type": "viewerdisconnected",
            "viewerId": viewerId
        };

        this.broadcaster.send(JSON.stringify(message));
    }

    /**
     * Closes the room and tells all viewers the broadcaster has disconnected.
     */
    closeRoom() {
        for (const viewerId in this.viewers) {
            const viewer = this.viewers[viewerId];
            const messageBroadcasterDisconnected: MessageBroadcasterDisconnected = {
                "type": "broadcasterdisconnected"
            };
            
            viewer.send(JSON.stringify(messageBroadcasterDisconnected));
            viewer.close();
        }
    }
}

class Server {
    /**
     * Object containing kv-pairs of room IDs and room class instances.
     *
     * @private
     */
    private rooms = new Map<string, Room>();

    /**
     * Handles a new WebSocket connection.
     *
     * @param socket
     */
    onConnection(socket: WebSocket) {
        socket.onmessage = (event: MessageEvent) => {
            const message = JSON.parse(event.data);

            if (message.type != "join") {
                // No messages are valid until a client has sent a "JOIN"
                return;
            }

            const roomId = message.roomId;

            if (roomId == null || roomId.length < 1) {
                // No, or an invalid roomId was given in the message
                return;
            }

            if (this.rooms.has(roomId)) {
                this.rooms.get(roomId)?.addViewer(socket);
            } else {
                this.newRoom(roomId, socket);
            }
        }
    }

    /**
     * Creates a new room with the given roomId and broadcaster. Throws an exception
     * if the roomId is already taken.
     *
     * @param roomId
     * @param broadcaster
     */
    newRoom(roomId: string, broadcaster: WebSocket) {
        if (this.rooms.has(roomId)) {
            throw "roomId already taken.";
        }

        this.rooms.set(roomId, new Room(broadcaster));
        broadcaster.onclose = (_event: CloseEvent) => this.closeRoom(roomId);
    }

    /**
     * Closes the room with the given roomId.
     *
     * @param roomId The ID of the room to close
     */
    closeRoom(roomId: string) {
        this.rooms.get(roomId)?.closeRoom();
        this.rooms.delete(roomId);
    }
}

/**
 * The main entry point.
 */
function main() {
    const socket = new websocket.Server({ "port": 4000 });
    const server = new Server();

    socket.on("connection", (socket: WebSocket) => server.onConnection(socket));
}

main();