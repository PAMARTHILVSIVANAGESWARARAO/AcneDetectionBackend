import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      unique: true,
      required: true,
      immutable: true,
      index: true
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    password: {
      type: String,
      required: true,
      select: false
    }
  },
  { timestamps: true }
);

userSchema.pre("save", function () {
  if (this.email) {
    this.email = this.email.toLowerCase();
  }
});

export default mongoose.model("User", userSchema);
