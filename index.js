const express = require('express')
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
require('dotenv').config()

const app = express()
const port = process.env.PORT || 5000;

// middlewares
app.use(cors())
app.use(express.json())

// Database Connection
const uri = process.env.DB_URI
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
})

async function run() {
  try {
    const homesCollection = client.db('homeScapeDB').collection('homes');
    const usersCollection = client.db('homeScapeDB').collection('users');
    const bookingsCollection = client.db('homeScapeDB').collection('bookings');


    //JWT & users api
    app.put('/user/:email', async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user
      }
      const result = await usersCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '5h' });
      res.send({ result, token })
    })

    //booking api

    //get user bookings 
    app.get('/bookings', async (req, res) => {
      let query = {};
      const email = req.query.email;
      if (email) {
        query = {
          guestEmail: email
        }
      }
      const result = await bookingsCollection.find(query).toArray();
      res.send(result)

    })

    //save bookings
    app.post('/bookings', async (req, res) => {
      const booking = req.body;
      const result = await bookingsCollection.insertOne(booking);
      res.send(result)
    })










    console.log('Database Connected...')
  } finally {
  }
}

run().catch(err => console.error(err))

app.get('/', (req, res) => {
  res.send('Server is running...')
})

app.listen(port, () => {
  console.log(`Server is running...on ${port}`)
})
