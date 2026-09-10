
// 1️⃣ تفعيل الإعدادات والمفاتيح
const cloudinary = require('cloudinary').v2;

// 🛠️ كتابة القيم مباشرة لقطع الشك باليقين والاتصال الفوري
cloudinary.config({
  cloud_name: 'dq9y7eo0x',
  api_key: '598684435333266',
  api_secret: 'NE_8ymvrzUhD7yfOYL-zUchD8ow1',
  secure: true 
});

// 2️⃣ دالة رفع الصور
// ✅ التعديل السحري لقطع الشك باليقين داخل utils/cloudinary.js
const cloudinaryUploudImage = async (fileToUpload) => {
    try {
        const data = await cloudinary.uploader.upload(fileToUpload, {
            resource_type: 'auto',
            // 👇 حقن يدوي مباشر للمفاتيح لمنع دالة الـ Sign من العطل التلقائي 👇
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET
        });
        return data;
    } catch (error) {
        console.error("Cloudinary upload error:", error);
        throw error;
    }
};

// 3️⃣ دالة حذف الصور
const cloudinaryRemoveImage = async (imagePublicId) => {
    try {
        const result = await cloudinary.uploader.destroy(imagePublicId); 
        return result;
    } catch (error) {
        return error;
    }
};

// 4️⃣ 🛡️ التصدير الصحيح والموحد لكل العناصر معاً بدون تعارض
module.exports = {
    cloudinary, // تصدير الكائن الرئيسي للإعدادات
    cloudinaryUploudImage,
    cloudinaryRemoveImage
};
