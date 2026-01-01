import express from "express";
import multer from "multer";
import cors from "cors";
import { Storage } from "@google-cloud/storage";
import admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

// -------------------------
const BUCKET_NAME = "messagesapi";
// -------------------------

const app = express();
app.use(cors());
app.use(express.json());

// Multer (Cloud Run safe)
const upload = multer({ storage: multer.memoryStorage() });

// GCS config
const storage = new Storage();
const bucket = storage.bucket(BUCKET_NAME);

// -------------------------
// CREATE POST
// -------------------------
app.post("/post", upload.array("files", 4), async (req, res) => {
  try {
    const { body, poll, replyId, replyLevel } = req.body;
    const files = req.files || [];

    // Handle poll options
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

    // CST timestamp (same format you used)
    const now = new Date();
    const cstHours = (now.getUTCHours() - 6 + 24) % 24;
    const timeString = `${now.getUTCMonth() + 1}/${now.getUTCDate()}/${now.getUTCFullYear()} ${String(
      cstHours
    ).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;

    const postData = {
      body: body || null,
      files: uploadedFiles,
      time: timeString,
      poll: pollOptions,
      pollResults: [0, 0, 0, 0],
      upvote: 0,
      replyId: Number(replyId),
      replyLevel: Number(replyLevel),
      createdAt: Date.now(), // used for ordering + "new posts"
    };

    const docRef = await db.collection("posts").add(postData);

    res.json({
      message: "Posted successfully",
      post: { id: docRef.id, ...postData },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating post" });
  }
});

// -------------------------
// VOTES
// -------------------------
app.post("/updateVote", async (req, res) => {
  try {
    const { postId, amount } = req.body;

    const ref = db.collection("posts").doc(postId);
    await ref.update({
      upvote: admin.firestore.FieldValue.increment(amount),
    });

    const updated = await ref.get();
    res.json({ message: "Vote updated", post: { id: postId, ...updated.data() } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update vote" });
  }
});

// -------------------------
// POLLS
// -------------------------
app.post("/updatePoll", async (req, res) => {
  try {
    const { postId, optionIndex } = req.body;
    const ref = db.collection("posts").doc(postId);
    const snap = await ref.get();

    if (!snap.exists) return res.status(404).json({ error: "Post not found" });

    const data = snap.data();
    if (!data.poll) return res.status(400).json({ error: "This post has no poll" });
    if (optionIndex < 0 || optionIndex >= data.poll.length)
      return res.status(400).json({ error: "Invalid option" });

    const pollResults = [...data.pollResults];
    pollResults[optionIndex]++;

    await ref.update({ pollResults });

    res.json({ message: "Poll updated", post: { id: postId, ...data, pollResults } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update poll" });
  }
});

// -------------------------
// GET ALL POSTS
// -------------------------
app.get("/getPosts", async (req, res) => {
  try {
    const snapshot = await db
      .collection("posts")
      .orderBy("createdAt", "asc")
      .get();

    const posts = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json(posts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching posts" });
  }
});

// -------------------------
// GET ONLY NEW POSTS (since timestamp)
// client sends ?since=NUMBER (last seen createdAt)
// -------------------------
app.get("/getNewPosts", async (req, res) => {
  try {
    const since = Number(req.query.since);
    if (!since) return res.json([]);

    const snapshot = await db
      .collection("posts")
      .where("createdAt", ">", since)
      .orderBy("createdAt", "asc")
      .get();

    const posts = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json(posts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching new posts" });
  }
});

// -------------------------
app.get("/", (req, res) => res.send("Backend is running 🚀"));
// -------------------------

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`Server listening on port ${PORT}`)
);
