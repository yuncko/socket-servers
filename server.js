import express from "express"
import { createServer } from "http"
import { Server } from "socket.io"
import cors from "cors"

const app = express()
const httpServer = createServer(app)

// Configure CORS for Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
})

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  }),
)

// Store active users and their rooms
const users = {}
const rooms = {}

// Socket.io connection handler
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`)

  // Add user to the pool of available users
  users[socket.id] = {
    id: socket.id,
    inRoom: false,
  }

  // User requests to find a match
  socket.on("find-match", (userData) => {
    console.log(`User ${socket.id} is looking for a match`)

    // Update user data with any filters
    users[socket.id] = {
      ...users[socket.id],
      ...userData,
    }

    // Find an available user who is not in a room
    const availableUsers = Object.values(users).filter((user) => user.id !== socket.id && !user.inRoom)

    if (availableUsers.length > 0) {
      // Match with the first available user
      const match = availableUsers[0]
      const roomId = `room_${socket.id}_${match.id}`

      // Mark both users as in a room
      users[socket.id].inRoom = roomId
      users[match.id].inRoom = roomId

      // Create a room
      rooms[roomId] = {
        id: roomId,
        participants: [socket.id, match.id],
        created: new Date(),
      }

      // Join both users to the room
      socket.join(roomId)
      io.sockets.sockets.get(match.id)?.join(roomId)

      // Notify both users about the match
      io.to(roomId).emit("match-found", { roomId })
      console.log(`Match found: ${socket.id} and ${match.id} in room ${roomId}`)
    } else {
      // No match found, wait for another user
      socket.emit("waiting-for-match")
      console.log(`User ${socket.id} is waiting for a match`)
    }
  })

  // Handle WebRTC signaling
  socket.on("signal", ({ roomId, signal, targetId }) => {
    console.log(`Signal from ${socket.id} to ${targetId || "room"} in room ${roomId}`)

    if (rooms[roomId]) {
      if (targetId) {
        // Send to specific user
        socket.to(targetId).emit("signal", {
          signal,
          sourceId: socket.id,
        })
      } else {
        // Send to all users in room except sender
        socket.to(roomId).emit("signal", {
          signal,
          sourceId: socket.id,
        })
      }
    }
  })

  // Handle ICE candidates
  socket.on("ice-candidate", ({ roomId, candidate, targetId }) => {
    console.log(`ICE candidate from ${socket.id} to ${targetId || "room"}`)

    if (rooms[roomId]) {
      if (targetId) {
        // Send to specific user
        socket.to(targetId).emit("ice-candidate", {
          candidate,
          sourceId: socket.id,
        })
      } else {
        // Send to all users in room except sender
        socket.to(roomId).emit("ice-candidate", {
          candidate,
          sourceId: socket.id,
        })
      }
    }
  })

  // User wants to find a new match
  socket.on("next-match", () => {
    leaveCurrentRoom(socket)

    // Look for a new match
    socket.emit("find-match")
  })

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`)
    leaveCurrentRoom(socket)
    delete users[socket.id]
  })

  // Helper function to leave current room
  function leaveCurrentRoom(socket) {
    const roomId = users[socket.id]?.inRoom

    if (roomId && rooms[roomId]) {
      // Notify other participants
      socket.to(roomId).emit("peer-left", { peerId: socket.id })

      // Remove user from room
      socket.leave(roomId)

      // Update room data
      const otherParticipants = rooms[roomId].participants.filter((id) => id !== socket.id)

      if (otherParticipants.length === 0) {
        // No one left in the room, delete it
        delete rooms[roomId]
      } else {
        // Update room participants
        rooms[roomId].participants = otherParticipants

        // Mark other participants as not in a room
        otherParticipants.forEach((id) => {
          if (users[id]) {
            users[id].inRoom = false
          }
        })
      }

      // Mark this user as not in a room
      users[socket.id].inRoom = false
    }
  }
})

// Start the server
const PORT = process.env.PORT || 3001
httpServer.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`)
})

export default httpServer
