require("dotenv").config();

const express = require("express");
const cors = require('cors');
const connectToDb = require("./config/connectToDb");
const { notFound, errorHandler } = require("./middleware/Error");

const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const userRoutes = require("./routes/userRoutes");
const rewardRoutes = require("./routes/rewardsRoutes");
const routeRoutes = require("./routes/routeRoutes");
const rewardClaimRoutes = require("./routes/rewardClaimRoute");
const  statesRoute = require("./routes/statesRoute");
const  contactInfoRoute = require("./routes/contactInfoRoute");
const  userMessageRoute = require("./routes/userMessageRoute");

const app = express();


// =======================
// MIDDLEWARE (IMPORTANT ORDER)
// =======================
app.use(express.json());
app.use(cors());

// =======================
// ROUTES
// =======================
app.use("/api/auth", authRoutes);
app.use("/admin", adminRoutes);
app.use("/user", userRoutes);
app.use("/api/wasterequest",require("./routes/wasteRequestRoute")) 
app.use("/api/rewards", rewardRoutes);
app.use("/api/bins", require("./routes/binRoutes"));
app.use("/api/route", routeRoutes);
app.use("/api/rewardclaim", rewardClaimRoutes);
app.use("/api/stats", statesRoute);
app.use("/api/contact", contactInfoRoute);
app.use("/api/message", userMessageRoute);

app.use(notFound);
app.use(errorHandler);






// =======================
// START SERVER
// =======================
const PORT = process.env.PORT || 8000;

const startServer = async () => {
    try {

        await connectToDb();

        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });

    } catch (error) {

        console.error("Database connection failed");

        process.exit(1);
    }
};

startServer();