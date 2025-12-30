import express from "express";
import multer from "multer";
import cors from "cors";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, "uploads");


// create uploads folder if it doesns't exist
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // <-- MUST be relative, not absolute
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + "-" + file.originalname);
  }
});




export const upload = multer({ storage });

const app = express();
app.use(cors());
app.use(express.json());  
let posts = [];
let nextPostId = 1;
app.use("/uploads", express.static("uploads"));
app.post("/post", upload.array("files", 4), (req, res) => {
  const { body, poll, replyId, replyLevel } = req.body;
  const files = req.files || [];

  let pollOptions = null;
  if (poll) {
    if (Array.isArray(poll)) {
      pollOptions = poll.slice(0, 4);
    } else {
      pollOptions = [poll];
    }
  }

  const now = new Date();
  const timeString = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

const postData = {
    id: nextPostId++,
    body: body || null,
    files: files.map(f => ({
  filename: f.originalname,
  path: `uploads/${f.filename}`,   // <--- ALWAYS use this
  mimetype: f.mimetype,
  size: f.size
})),

    time: timeString,
    poll: Array.isArray(poll) ? poll.slice(0, 4) : (poll ? [poll] : null),
    pollResults: [0, 0, 0, 0],
    upvote: 0,
    replyId: Number(replyId),
    replyLevel: Number(replyLevel)
};

if (Number(replyId) > -1) {
  const parentIndex = posts.findIndex(p => p.id === Number(replyId));

  if (parentIndex !== -1) {
    // insert reply right before the parent post
    posts.splice(parentIndex, 0, postData);
  } else {
    // fallback: parent not found
    posts.push(postData);
  }
} else {
  // normal post
  posts.push(postData);
}

  res.json({ message: "Posted successfully", post: postData});
})

app.post("/updateVote", (req, res) => {
  const { postId, amount } = req.body;
  const post = posts.find(p => p.id === parseInt(postId));
  post.upvote += amount;

  return res.json({
    message: "Poll updated",
    post
  });
})

app.post("/updatePoll", (req, res) => {
  const { postId, optionIndex } = req.body;

  // Validate incoming data
  if (postId == null || optionIndex == null) {
    return res.status(400).json({ error: "postId and optionIndex required" });
  }

  // Find the post
  const post = posts.find(p => p.id === parseInt(postId));
  if (!post) {
    return res.status(404).json({ error: "Post not found" });
  }

  // Ensure post has a poll
  if (!post.poll || !Array.isArray(post.poll)) {
    return res.status(400).json({ error: "This post has no poll" });
  }

  // Ensure valid option index
  if (optionIndex < 0 || optionIndex >= post.poll.length) {
    return res.status(400).json({ error: "Invalid poll option index" });
  }

  // Update the poll result
  post.pollResults[optionIndex] += 1;

  return res.json({
    message: "Poll updated",
    post
  });
});

app.get('/getPosts', (req, res) => {
  res.json(posts);
})


app.get('/getNewPosts', (req, res) => {
  const since = Number(req.query.since);
  
  if (!since) {
    return res.json([]);
  }

  const newPosts = posts.filter(post => post.id > since);
  res.json(newPosts)
})

// Test route
app.get("/", (req, res) => {
  res.send("Backend is running 🚀");
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on port ${PORT}`);
});
