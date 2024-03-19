const express = require('express')
const cors = require('cors');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
require('dotenv').config()
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);


const app = express()
const port = process.env.PORT || 5000;


// middlewares
const whitelist = ['http://localhost:3000', 'https://homescape-ae176.web.app']
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || whitelist.indexOf(origin) !== -1) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true,
}
app.use(cors(corsOptions));
app.use(express.json())

//verifyJWT

const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: 'unauthorized access' })

  }
  const token = authHeader.split(' ')[1]
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: 'Forbidden access' })
    }
    req.decoded = decoded;
    next();
  });
}


//send email
const sendEmail = (emailData, email) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.Email,
      pass: process.env.PASS
    }
  });

  const mailOptions = {
    from: process.env.Email,
    to: email,
    subject: emailData?.subject,
    html: `<p>${emailData?.message}</p>`
  };

  transporter.sendMail(mailOptions, function (error, info) {
    if (error) {
      console.log(error);
    } else {
      console.log('Email sent: ' + info.response);
    }
  });
}

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

    //verify admin
    const verifyAdmin = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      const user = await usersCollection.findOne({ email: decodedEmail })
      if (user?.role !== 'admin') {
        return res.status(403).send({ message: 'Forbidden access' })

      }
      next()
    }

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

    app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users)
    })


    //get a single user by email
    app.get('/user/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const decodedEmail = req.decoded.email;

      if (email !== decodedEmail) {
        return res.status(403).send({ message: 'Forbidden access' })
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      res.send(user)
    })





    //********booking api********

    // create payment intent

    app.post('/create-payment-intent', verifyJWT, async (req, res) => {
      const { price } = req.body;
      const priceToCent = price * 100;
      const amount = parseInt(priceToCent);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ['card']
      })
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })

    //get user bookings 
    app.get('/bookings', verifyJWT, async (req, res) => {
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
    app.post('/bookings', verifyJWT, async (req, res) => {
      const booking = req.body;
      const result = await bookingsCollection.insertOne(booking);
      sendEmail({
        subject: 'Booking successful',
        message: `Booking id: ${result?.insertedId},TransactionId:${booking?.transactionId}`
      }, booking?.guestEmail)
      res.send(result)
    })

    //delete booking

    app.delete('/bookings/:id', verifyJWT, async (req, res) => {
      const id = req.params.id;
      const result = await bookingsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result)
    })


    //********services********
    //get search home
    app.get('/search-homes', async (req, res) => {
      const query = {};
      const location = req.query.location;

      if (location) {
        query.location = location
      }
      const result = await homesCollection.find(query).toArray();
      res.send(result)
    })

    //get all home 
    app.get('/homes', async (req, res) => {
      const result = await homesCollection.find().toArray();
      res.send(result)
    })


    //get host homes 
    app.get('/homes/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const decodedEmail = req.decoded.email;

      if (email !== decodedEmail) {
        return res.status(403).send({ message: 'Forbidden access' })
      }
      const result = await homesCollection.find({ 'host.email': email }).toArray();
      res.send(result)
    })

    //get single home
    app.get('/home/:id', async (req, res) => {
      const id = req.params.id;
      const result = await homesCollection.findOne({ _id: new ObjectId(id) });
      res.send(result)
    })

    //add a home
    app.post('/homes', verifyJWT, async (req, res) => {
      const homeData = req.body;
      const result = await homesCollection.insertOne(homeData);
      res.send(result)
    })
    //update a home
    app.put('/home/:id', verifyJWT, async (req, res) => {
      const { id } = req.params;
      const homeData = req.body;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: homeData
      }
      const result = await homesCollection.updateOne(filter, updateDoc, options);
      res.send(result)
    })

    //delete a home
    app.delete('/home/:id', verifyJWT, async (req, res) => {
      const id = req.params.id;
      const result = await homesCollection.deleteOne({ _id: new ObjectId(id) });
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
