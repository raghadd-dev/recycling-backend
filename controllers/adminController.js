const asyncHandler = require("express-async-handler");
const { User } = require("../models/User");
const { WasteRequest } = require("../models/WasteRequestModel");

// ==========================================
// 📊 1. لوحة الإدارة الرئيسية (Admin Dashboard)
// ==========================================
module.exports.getAdminDashboardData = asyncHandler(async (req, res) => {
    
    // 1. Calculate Core Statistics for Dashboard Cards
    const totalUsers = await User.countDocuments({ role: "user" });
    const totalDrivers = await User.countDocuments({ role: "driver", status: "active" });
    const totalRequests = await WasteRequest.countDocuments();

    // Calculate cumulative weight of completed requests only
    const totalWeightData = await WasteRequest.aggregate([
        { $match: { status: "completed" } },
        { $group: { _id: null, total: { $sum: "$quantity" } } }
    ]);
    const totalWeight = totalWeightData.length > 0 ? totalWeightData[0].total : 0;

    // 2. Fetch last 5 requests for the dashboard table
    const latestRequests = await WasteRequest.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("user", "name");

    // Format requests data to perfectly match frontend table columns
    const formattedRequests = latestRequests.map(req => ({
        id: req._id,
        requestNumber: "#" + req._id.toString().slice(-4).toUpperCase(), 
        clientName: req.user ? req.user.name : "مستخدم مجهول",
        wasteType: req.wasteType,
        quantity: req.quantity + " كغ",
        status: req.status
    }));

    // 3. Calculate dynamic chart statistics for the last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1); 

    const monthlyStatsData = await WasteRequest.aggregate([
        {
            $match: {
                createdAt: { $gte: sixMonthsAgo } 
            }
        },
        {
            $group: {
                _id: { $month: "$createdAt" }, 
                count: { $sum: 1 } 
            }
        },
        { $sort: { "_id": 1 } } 
    ]);

    const monthNamesAr = [
        "كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران", 
        "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول"
    ];
    
    const chartData = monthlyStatsData.map(item => ({
        month: monthNamesAr[item._id - 1], 
        requestsCount: item.count
    }));

    // Return dynamic data object for dashboard view
    res.json({
        success: true,
        cards: {
            usersCount: totalUsers,
            driversCount: totalDrivers,
            requestsCount: totalRequests,
            wasteCollected: totalWeight
        },
        latestRequests: formattedRequests,
        chartData 
    });
});


// 📋 2. Get All Users with Dynamic Filters, Search, and Stats (نسخة كاملة ومؤمنة)
module.exports.getAdminUsersAndStats = asyncHandler(async (req, res) => {
    // استقبال الفلاتر ونص البحث القادم من شريط بحث الواجهة
    const { status, role, search } = req.query;

    // 1️⃣ بناء فلتر البحث الديناميكي (يدعم البحث بالاسم أو الإيميل معاً)
    let queryFilter = { role: role || "user" }; 
    
    if (status) {
        queryFilter.status = status;
    }
    
    if (search) {
        queryFilter.$or = [
            { name: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } }
        ];
    }

    // 2️⃣ حساب التواريخ للنسب المئوية والمشتركين الجدد
    const now = new Date();
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    // 🚀 3️⃣ تشغيل كافة الاستعلامات بالتوازي لسرعة فائقة جداً (Promise.all)
    const [
        users,
        totalUsersCount,newUsersCount,
        lastMonthUsersCount, // لحساب نسبة النمو
        activeUsersCount,
        pointsStats
    ] = await Promise.all([
        User.find(queryFilter).sort({ createdAt: -1 }), // الجدول الرئيسي مع الفلترة والبحث
        User.countDocuments({ role: "user" }),
        User.countDocuments({ role: "user", createdAt: { $gte: startOfCurrentMonth } }),
        User.countDocuments({ role: "user", createdAt: { $gte: startOfLastMonth, $lt: startOfCurrentMonth } }),
        User.countDocuments({ role: "user", isBanned: false, status: "active" }),
        User.aggregate([
            { $match: { role: "user" } },
            { $group: { _id: null, totalPoints: { $sum: "$points" } } }
        ])
    ]);

    // 4️⃣ إصلاح الـ Bug وحساب متوسط النقاط بدقة
    const totalPoints = pointsStats.length > 0 ? pointsStats[0].totalPoints : 0;
    const averagePoints = totalUsersCount > 0 ? Math.round(totalPoints / totalUsersCount) : 0;

    // 5️⃣ حساب نسبة النمو المئوية ديناميكياً للشهر الحالي مقارنة بالماضي
    let userGrowthPercentage = 0;
    if (lastMonthUsersCount > 0) {
        userGrowthPercentage = Math.round(((newUsersCount - lastMonthUsersCount) / lastMonthUsersCount) * 100);
    } else if (newUsersCount > 0) {
        userGrowthPercentage = 100; // إذا لم يكن هناك مستخدمين الشهر الماضي وهناك مستخدمين الآن
    }

    // 6️⃣ إرجاع النتيجة الموحدة لتغذي الجدول والكروت والبحث معاً
    res.status(200).json({
        success: true,
        stats: {
            totalUsers: totalUsersCount,          
            totalUsersGrowth: (userGrowthPercentage > 0 ? '+' : '') + userGrowthPercentage + '%', 
            newUsers: newUsersCount,              
            activeUsers: activeUsersCount,        
            averagePoints: averagePoints          
        },
        users: users.map((u, index) => ({
            id: u._id,
            index: index + 1,
            name: u.name,
            email: u.email,
            role: u.role,
            points: u.points || 0,
            status: u.isBanned ? "محظور" : u.status 
        }))
    });
});


// 🚫 🔄 Toggle User Ban (حظر وفك الحظر بدالة واحدة ذكية)
module.exports.toggleUserBan = asyncHandler(async (req, res) => {
    // 1. البحث عن الحساب بواسطة الـ ID القادم من الرابط
    const user = await User.findById(req.params.userId);
    if (!user) {
        return res.status(404).json({ message: "المستخدم غير موجود" });
    }

    // 2. منع الأدمن من حظر نفسه بالخطأ
    if (user._id.toString() === req.user.id) {
        return res.status(400).json({ message: "لا يمكنك حظر حسابك الإداري الخاص" });
    }

    // 3. 🔄 عملية التوغل: قلب القيمة المنطقية الحالية (إذا false تصبح true والعكس)
    user.isBanned = !user.isBanned;
    await user.save();

    // 4. إرجاع رسالة نجاح مخصصة بناءً على الحالة الجديدة
    res.json({
        success: true,
        message: user.isBanned ? "تم حظر حساب المستخدم بنجاح" : "تم إلغاء حظر المستخدم بنجاح",
        isBanned: user.isBanned
    });
});

