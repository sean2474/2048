"use client";

import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { S2C, ClientMsg } from "schema";

export default function SocketTestPage() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [roomId, setRoomId] = useState("test-room-123");
  const [messages, setMessages] = useState<string[]>([]);
  const [serverState, setServerState] = useState<S2C | null>(null);

  // 메시지 추가 헬퍼
  const addMessage = (msg: string) => {
    setMessages((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  // 소켓 연결
  const connectSocket = () => {
    if (socket?.connected) {
      addMessage("⚠️ Already connected!");
      return;
    }

    addMessage("🔄 Connecting to socket server...");
    const newSocket = io("http://localhost:4000", {
      transports: ["websocket", "polling"],
    });

    newSocket.on("connect", () => {
      setConnected(true);
      addMessage(`✅ Connected! Socket ID: ${newSocket.id}`);
    });

    newSocket.on("disconnect", () => {
      setConnected(false);
      addMessage("❌ Disconnected from server");
    });

    newSocket.on("message", (data: S2C) => {
      addMessage(`📨 Received: ${JSON.stringify(data)}`);
      setServerState(data);
    });

    newSocket.on("connect_error", (error) => {
      addMessage(`❌ Connection error: ${error.message}`);
    });

    setSocket(newSocket);
  };

  // 소켓 해제
  const disconnectSocket = () => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
      setConnected(false);
      addMessage("🔌 Manually disconnected");
    }
  };

  // 방 참가
  const joinRoom = () => {
    if (!socket || !connected) {
      addMessage("⚠️ Not connected to server!");
      return;
    }

    const msg: ClientMsg = {
      t: "joinRoom",
      roomId,
    };

    addMessage(`➡️ Sending joinRoom: ${roomId}`);
    socket.emit("message", msg);
  };

  // 입력 전송 테스트
  const sendInput = (dir: "up" | "down" | "left" | "right") => {
    if (!socket || !connected) {
      addMessage("⚠️ Not connected to server!");
      return;
    }

    const msg: ClientMsg = {
      t: "input",
      dir,
    };

    addMessage(`➡️ Sending input: ${dir}`);
    socket.emit("message", msg);
  };

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [socket]);

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">Socket.IO Connection Test</h1>

        {/* 연결 상태 */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Connection Status</h2>
          <div className="flex items-center gap-4">
            <div
              className={`w-4 h-4 rounded-full ${
                connected ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span className="font-medium">
              {connected ? "Connected" : "Disconnected"}
            </span>
            {socket && (
              <span className="text-sm text-gray-600">ID: {socket.id}</span>
            )}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={connectSocket}
              disabled={connected}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300"
            >
              Connect
            </button>
            <button
              onClick={disconnectSocket}
              disabled={!connected}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-300"
            >
              Disconnect
            </button>
          </div>
        </div>

        {/* 방 참가 */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Join Room</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Room ID"
              className="flex-1 px-4 py-2 border rounded"
            />
            <button
              onClick={joinRoom}
              disabled={!connected}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-300"
            >
              Join Room
            </button>
          </div>
        </div>

        {/* 입력 테스트 */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Send Input</h2>
          <div className="grid grid-cols-3 gap-2 max-w-xs">
            <div />
            <button
              onClick={() => sendInput("up")}
              disabled={!connected}
              className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:bg-gray-300"
            >
              ⬆️ Up
            </button>
            <div />
            <button
              onClick={() => sendInput("left")}
              disabled={!connected}
              className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:bg-gray-300"
            >
              ⬅️ Left
            </button>
            <button
              onClick={() => sendInput("down")}
              disabled={!connected}
              className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:bg-gray-300"
            >
              ⬇️ Down
            </button>
            <button
              onClick={() => sendInput("right")}
              disabled={!connected}
              className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:bg-gray-300"
            >
              ➡️ Right
            </button>
          </div>
        </div>

        {/* 서버 상태 */}
        {serverState && (
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Server State</h2>
            <pre className="bg-gray-100 p-4 rounded overflow-x-auto text-sm">
              {JSON.stringify(serverState, null, 2)}
            </pre>
          </div>
        )}

        {/* 메시지 로그 */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Message Log</h2>
            <button
              onClick={() => setMessages([])}
              className="px-3 py-1 text-sm bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              Clear
            </button>
          </div>
          <div className="bg-gray-100 p-4 rounded h-64 overflow-y-auto font-mono text-sm space-y-1">
            {messages.length === 0 ? (
              <p className="text-gray-500">No messages yet...</p>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className="text-gray-800">
                  {msg}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
