const { Server } = require("socket.io");

const io = new Server({
    cors: {
        origin: "*",
    },
});

io.on("connection", (socket) => {
    console.log("A user connected");

    // Listen for chat messages
    socket.on("message", (msg) => {
        io.emit("message", "done"); // Broadcast the message to all connected clients
    });

    // Disconnect event
    socket.on("disconnect", () => {
        console.log("User disconnected");
    });
});

io.listen(4000, () => {
    console.log("Server is running on http://localhost:4000");
});
