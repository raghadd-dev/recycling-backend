const jwt = require("jsonwebtoken");
const { User } = require("../models/User");

// ==========================================
// 🔐 Verify Token
// يتحقق من صحة التوكن، ثم يجيب بيانات المستخدم
// المحدّثة من الداتابيس (وليس فقط من داخل التوكن)
// ==========================================
async function verifyToken(req, res, next) {
    const authToken = req.headers.authorization;

    if (!authToken) {
        return res
            .status(401)
            .json({ message: "no token provided, access denied" });
    }

    const token = authToken.split(" ")[1];

    try {
        const decodedPayload = jwt.verify(token, process.env.JWT_SECRET);

        // نستخدم أي اسم معرّف مدعوم حتى لا تفشل الجلسات القديمة بعد تغيير شكل التوكن.
        const userId = decodedPayload.id || decodedPayload.userId || decodedPayload._id;
        if (!userId) {
            return res.status(401).json({ message: "invalid token, user id is missing" });
        }

        // نجيب المستخدم من الداتابيس بدل ما نعتمد بس على بيانات التوكن
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                message: "user not found, access denied"
            });
        }

        if (user.status !== "active") {
            return res.status(403).json({
                message: user.role === "driver" && user.status === "pending"
                    ? "driver account is pending admin approval"
                    : "account is not active, access denied"
            });
        }

        req.user = user.toObject();
        // توحيد شكل المعرّف لأن الكنترولرات القديمة تستخدم req.user.id
        req.user.id = user._id.toString();
        req.user.userId = req.user.id;
        delete req.user.password;

        next();

    } catch (error) {
        return res.status(401).json({ message: "invalid token, access denied" });
    }
}


// ==========================================
// 🔐 Verify Token & Admin
// ==========================================
function verifyTokenAndAdmin(req, res, next) {
    verifyToken(req, res, () => {
        if (req.user.role === "admin") {
            next();
        } else {
            return res.status(403).json({
                message: "not allowed, only admin",
            });
        }
    });
}

function verifyTokenAndAdminAndDriver(req, res, next) {
    verifyToken(req, res, () => {
        if (req.user.role === "admin" || req.user.role === "driver") {
            next();
        } else {
            return res.status(403).json({
                message: "not allowed, only admin",
            });
        }
    });
}


// ==========================================
// 🔐 Verify Token & Driver
// ==========================================
function verifyTokenAndDriver(req, res, next) {
    verifyToken(req, res, () => {
        if (req.user.role === "driver") {
            next();
        } else {
            return res.status(403).json({
                message: "not allowed, only driver",
            });
        }
    });
}


module.exports = {
    verifyToken,
    verifyTokenAndAdmin,
    verifyTokenAndDriver,
    verifyTokenAndAdminAndDriver
};