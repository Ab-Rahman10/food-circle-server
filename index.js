require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://food-circle-a626f.web.app",
      "https://food-circle-a626f.firebaseapp.com",
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// verify the valid token
const verifyToken = (req, res, next) => {
  const { token } = req.cookies;

  if (!token) return res.status(401).send({ message: "Unauthorized access!" });
  jwt.verify(token, process.env.SECRET_KEY, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "Unauthorized access." });
    }
    req.user = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.euk0j.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const db = client.db("foodCircleDB");
    const foodCollection = db.collection("foods");
    const foodRequestCollection = db.collection("foodRequest");

    // Generate a JWT ------------------------------------------------------------
    app.post("/jwt", async (req, res) => {
      const email = req.body;
      const token = jwt.sign(email, process.env.SECRET_KEY, {
        expiresIn: "365d",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    // logout JWT
    app.get("/logout", async (req, res) => {
      res
        .clearCookie("token", {
          maxAge: 0,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    // API for available, search & sort foods-------------------------
    app.get("/foods", async (req, res) => {
      const search = req.query.search;
      const sort = req.query.sort;
      let query = { status: "available" };
      let options = {};
      if (sort) {
        options.sort = {
          expiredDate: (sort === "asc" && 1) || (sort === "dsc" && -1),
        };
      }
      if (search) {
        query.name = { $regex: search, $options: "i" };
      }
      const result = await foodCollection.find(query, options).toArray();
      res.send(result);
    });

    // Feature API.
    app.get("/all-foods", async (req, res) => {
      const result = await foodCollection.find().toArray();
      // filter for feature
      const filtered = result
        .sort((a, b) => parseInt(b.quantity) - parseInt(a.quantity))
        .slice(0, 6);

      res.send(filtered);
    });

    // API for details
    app.get("/food/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await foodCollection.findOne(filter);
      res.send(result);
    });

    // add food
    app.post("/foods", verifyToken, async (req, res) => {
      const addData = req.body;
      const userEmail = addData?.donator?.donatorEmail;
      const decodedEmail = req.user?.email;

      if (decodedEmail !== userEmail)
        return res.status(403).send({ message: "Forbidden access" });

      const result = await foodCollection.insertOne(addData);
      res.send(result);
    });

    app.patch("/requestFoods/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      const filter = { _id: new ObjectId(id) };
      const update = {
        $set: {
          status,
        },
      };

      const result = await foodCollection.updateOne(filter, update);
      res.send(result);
    });

    // Manage foods
    app.get("/food-manage/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const decodedEmail = req.user?.email;

      if (decodedEmail !== email)
        return res.status(403).send({ message: "Forbidden access" });

      const query = { "donator.donatorEmail": email };
      const result = await foodCollection.find(query).toArray();
      res.send(result);
    });

    app.put("/update-food/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const foodData = req.body;
      const query = { _id: new ObjectId(id) };
      const option = { upsert: true };
      const updateDoc = {
        $set: foodData,
      };
      const result = await foodCollection.updateOne(query, updateDoc, option);
      res.send(result);
    });

    app.delete("/delete-food/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await foodCollection.deleteOne(query);
      res.send(result);
    });

    // food request related APIs-----------------------------
    // My request
    app.get("/my-request/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const decodedEmail = req.user?.email;

      if (decodedEmail !== email)
        return res.status(403).send({ message: "Forbidden access" });

      const query = { userEmail: email };
      const result = await foodRequestCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/food-request", verifyToken, async (req, res) => {
      const reqData = req.body;
      const result = await foodRequestCollection.insertOne(reqData);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Food circle server is running..");
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
