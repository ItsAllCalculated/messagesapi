import express from "express";
import multer from "multer";
import cors from "cors";
import { Storage } from "@google-cloud/storage";
import admin from "firebase-admin";

// -------------------------
// Initialize Firebase Admin
// -------------------------
admin.initializeApp();
const db = admin.firestore();

// -------------------------
// Replace with your GCS bucket name
// -------------------------
const BUCKET_NAME = "messagesapi";

// -------------------------
// Express setup
// -------------------------
const app = express();
app.use(cors());
app.use(express.json());

// In-memory cache (optional)
let posts = [];

// -------------------------
// Multer memory storage (works for Cloud Run)
// -------------------------
const upload = multer({ storage: multer.memoryStorage() });

// -------------------------
// Configure GCS
// -------------------------
const storage = new Storage();
const bucket = storage.bucket(BUCKET_NAME);

// -------------------------
// POST /post endpoint
// -------------------------
app.post("/post", upload.array("files", 4), async (req, res) => {
  try {
    const { body, poll, replyId, replyLevel } = req.body;
    const files = req.files || [];

    let pollOptions = null;
    if (poll) {
      pollOptions = Array.isArray(poll) ? poll.slice(0, 4) : [poll];
    }

    // Upload files to GCS
    const uploadedFiles = await Promise.all(
      files.map(async (file) => {
        const gcsFile = bucket.file(`${Date.now()}-${file.originalname}`);
        await gcsFile.save(file.buffer, {
          contentType: file.mimetype,
          resumable: false,
        });
        return {
          filename: file.originalname,
          path: `https://storage.googleapis.com/${bucket.name}/${gcsFile.name}`,
          mimetype: file.mimetype,
          size: file.size,
        };
      })
    );

    // Timestamp string (CST)
    const now = new Date();
    const cstHours = (now.getUTCHours() - 6 + 24) % 24; // UTC−6
    const timeString = `${now.getUTCMonth() + 1}/${now.getUTCDate()}/${now.getUTCFullYear()} ${String(cstHours).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;

    // Prepare post data
    const postData = {
      body: body || null,
      files: uploadedFiles,
      time: timeString,
      poll: pollOptions,
      pollResults: pollOptions ? [0, 0, 0, 0] : null,
      upvote: 0,
      replyId: Number(replyId),
      replyLevel: Number(replyLevel),
    };

    // Save to Firestore with auto-generated ID
    const docRef = await db.collection("posts").add(postData);

    // Include the Firestore-generated ID in the response
    const savedPost = { id: docRef.id, ...postData };

    // Optional: keep in-memory cache
    posts.push(savedPost);

    res.json({ message: "Posted successfully", post: savedPost });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create post" });
  }
});

// -------------------------
// Vote endpoint
// -------------------------
app.post("/updateVote", async (req, res) => {
  try {
    const { postId, amount } = req.body;
    const postRef = db.collection("posts").doc(postId);
    const doc = await postRef.get();
    if (!doc.exists) return res.status(404).json({ error: "Post not found" });

    const post = doc.data();
    post.upvote += amount;

    await postRef.update({ upvote: post.upvote });
    res.json({ message: "Vote updated", post: { id: postId, ...post } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update vote" });
  }
});

// -------------------------
// Poll endpoint
// -------------------------
app.post("/updatePoll", async (req, res) => {
  try {
    const { postId, optionIndex } = req.body;
    const postRef = db.collection("posts").doc(postId);
    const doc = await postRef.get();
    if (!doc.exists) return res.status(404).json({ error: "Post not found" });

    const post = doc.data();
    if (!post.poll || !Array.isArray(post.poll)) return res.status(400).json({ error: "This post has no poll" });
    if (optionIndex < 0 || optionIndex >= post.poll.length) return res.status(400).json({ error: "Invalid poll option index" });

    post.pollResults[optionIndex] += 1;

    await postRef.update({ pollResults: post.pollResults });
    res.json({ message: "Poll updated", post: { id: postId, ...post } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update poll" });
  }
});

// -------------------------
// GET all posts
// -------------------------
app.get("/getPosts", async (req, res) => {
  try {
    const snapshot = await db.collection("posts").orderBy("time", "asc").get();
    const allPosts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(allPosts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch posts" });
  }
});

// -------------------------
// GET posts since ID
// -------------------------
app.get("/getNewPosts", async (req, res) => {
  try {
    const since = req.query.since;
    if (!since) return res.json([]);

    const snapshot = await db.collection("posts").get();
    const newPosts = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(post => post.id > since); // note: Firestore IDs are strings
    res.json(newPosts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch new posts" });
  }
});

// -------------------------
// Test route
// -------------------------
app.get("/", (req, res) => res.send("Backend is running 🚀"));

// -------------------------
// Start server
// -------------------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => console.log(`Server listening on port ${PORT}`));
