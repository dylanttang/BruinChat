const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema(
  {
    subjectArea: { type: String, required: true, trim: true },
    number: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    units: { type: String, default: '' },
    term: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

courseSchema.index({ subjectArea: 1, number: 1, term: 1 }, { unique: true });

module.exports = mongoose.model('Course', courseSchema);
