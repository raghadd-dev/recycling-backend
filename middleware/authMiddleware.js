const jwt = require("jsonwebtoken");
const { User } = require("../models/User");


// ==========================================
// 🔐 Verify Token
// Checks that the user is logged in with a valid token
// ==========================================
const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                message: "No token provided"
            });
        }

        const token = authHeader.split(" ")[1];

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        if (user.status !== "active") {
            return res.status(403).json({
                message: "Account is not active"
            });
        }

        req.user = user.toObject();
        delete req.user.password;

        next();

    } catch (error) {
        return res.status(401).json({
            message: "Unauthorized"
        });
    }
};


// ==========================================
// 🔐 Verify Token And Admin
// Checks that the user is logged in AND is an admin
// ==========================================
const verifyTokenAndAdmin = (req, res, next) => {

    verifyToken(req, res, () => {

        if (req.user.role === "admin") {
            next();
        } else {
            return res.status(403).json({
                message: "Admin access only"
            });
        }

    });

};


module.exports = {
    verifyToken,
    verifyTokenAndAdmin
};