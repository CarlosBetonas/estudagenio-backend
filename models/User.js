const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }, 
    birthDate: { type: Date, required: true },
    termsAccepted: { type: Boolean, required: true },
    
    preferences: {
        exams: [String], 
        subjects: [String],
        goal: String, 
        isPremium: { type: Boolean, default: false }  
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);