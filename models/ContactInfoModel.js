const mongoose = require("mongoose");

const contactInfoSchema = new mongoose.Schema({
    companyEmail: { type: String, default: "info@ecocycle.com" },
    companyPhone: { type: String, default: "+962 79 123 4567" },
    companyAddress: { type: String, default: "عمان، شارع الجامعة الأردنية، مبنى رقم 52" },
    workHours: { type: String, default: "الأحد - الخميس: 8:00 صباحاً - 5:00 مساءً" },
    wasteTypesPricing: {
        type: [{
            typeNameEn: { type: String, required: true }, // اسم النوع بالإنجليزي (plastic, paper, metal...)
            pointsPerKg: { type: Number, required: true } // النقاط لكل 1 كغ
        }],
        // الأنواع الافتراضية المعتمدة في مشروعكِ منذ البداية
        default: [
            { typeNameEn: "plastic", pointsPerKg: 50 },
            { typeNameEn: "paper",   pointsPerKg: 30 },
            { typeNameEn: "metal",   pointsPerKg: 100 },
            { typeNameEn: "glass",   pointsPerKg: 20 }
        ]
    },
    criticalFillLevelThreshold: { type: Number, default: 80 } 

}, { timestamps: true });

module.exports = mongoose.model("ContactInfo", contactInfoSchema);
