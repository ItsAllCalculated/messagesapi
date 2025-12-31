import express from "express";
import multer from "multer";
import cors from "cors";
import { Storage } from "@google-cloud/storage";

// -------------------------
// Replace with your GCS bucket name
const BUCKET_NAME = "messagesapi";
// -------------------------

const app = express();
app.use(cors());
app.use(express.json());

let posts = [];
let nextPostId = 1;

// -------------------------
// Multer memory storage (works for Cloud Run)
// -------------------------
const upload = multer({ storage: multer.memoryStorage() });

// -------------------------
// Configure GCS
const storage = new Storage();
const bucket = storage.bucket(BUCKET_NAME);
// -------------------------

// -------------------------
// POST /post endpoint
// -------------------------
app.post("/post", upload.array("files", 4), async (req, res) => {
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
      await gcsFile.makePublic();
      return {
        filename: file.originalname,
        path: `https://storage.googleapis.com/${bucket.name}/${gcsFile.name}`,
        mimetype: file.mimetype,
        size: file.size,
      };
    })
  );

  // Timestamp string
  const now = new Date();
  const timeString = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const postData = {
    id: nextPostId++,
    body: body || null,
    files: uploadedFiles,
    time: timeString,
    poll: pollOptions,
    pollResults: [0, 0, 0, 0],
    upvote: 0,
    replyId: Number(replyId),
    replyLevel: Number(replyLevel),
  };

  if (Number(replyId) > -1) {
    const parentIndex = posts.findIndex((p) => p.id === Number(replyId));
    if (parentIndex !== -1) posts.splice(parentIndex, 0, postData);
    else posts.push(postData);
  } else posts.push(postData);

  res.json({ message: "Posted successfully", post: postData });
});

// -------------------------
// Vote endpoints
// -------------------------
app.post("/updateVote", (req, res) => {
  const { postId, amount } = req.body;
  const post = posts.find((p) => p.id === parseInt(postId));
  if (!post) return res.status(404).json({ error: "Post not found" });

  post.upvote += amount;
  return res.json({ message: "Vote updated", post });
});

app.post("/updatePoll", (req, res) => {
  const { postId, optionIndex } = req.body;
  const post = posts.find((p) => p.id === parseInt(postId));
  if (!post) return res.status(404).json({ error: "Post not found" });
  if (!post.poll || !Array.isArray(post.poll)) return res.status(400).json({ error: "This post has no poll" });
  if (optionIndex < 0 || optionIndex >= post.poll.length) return res.status(400).json({ error: "Invalid poll option index" });

  post.pollResults[optionIndex] += 1;
  return res.json({ message: "Poll updated", post });
});

// -------------------------
// GET endpoints
// -------------------------
app.get("/getPosts", (req, res) => res.json(posts));

app.get("/getNewPosts", (req, res) => {
  const since = Number(req.query.since);
  if (!since) return res.json([]);
  const newPosts = posts.filter((post) => post.id > since);
  res.json(newPosts);
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
