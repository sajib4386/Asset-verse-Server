const express = require('express')
const cors = require('cors')
require('dotenv').config()
const app = express()
const port = process.env.PORT || 3000
const { MongoClient, ServerApiVersion } = require('mongodb');



// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@sajib43.hq7hrle.mongodb.net/?appName=Sajib43`;


// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});
async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const db = client.db('asset_verse_db');
        const userCollection = db.collection('users')

        // Create Employee Account
        app.post("/register/employee", async (req, res) => {
            const data = req.body;

            const emailExists = await userCollection.findOne({ email: data.email });
            if (emailExists) {
                return res.send({ success: false, message: "Email already exists" });
            }

            const employeeUser = {
                name: data.name,
                email: data.email,
                photoURL: data.photoURL,
                dateOfBirth: data.dateOfBirth,

                role: "employee",
                status: "unaffiliated",
                createdAt: new Date()
            };

            const result = await userCollection.insertOne(employeeUser);

            res.send({ success: true, user: result });
        });


        // Create HR Account
        app.post("/register/hr", async (req, res) => {
            const data = req.body;

            const emailExists = await userCollection.findOne({ email: data.email });
            if (emailExists) {
                return res.send({ success: false, message: "Email already exists" });
            }

            const hrUser = {
                name: data.name,
                email: data.email,
                photoURL: data.photoURL,
                companyName: data.companyName,
                companyLogo: data.companyLogo,
                dateOfBirth: data.dateOfBirth,

                role: "hr",
                packageLimit: 5,
                currentEmployees: 0,
                subscription: "basic",
                createdAt: new Date()
            };

            const result = await userCollection.insertOne(hrUser);

            res.send({ success: true, user: result });
        });


        // ROLE API
        app.get('/users/:email/role', async (req, res) => {
            const email = req.params.email;
            const query = { email };
            const user = await userCollection.findOne(query)
            res.send({ role: user?.role || 'user' })
        })

        


        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('AssetVerse server is running')
})

app.listen(port, () => {
    console.log(`AssetVerse server is running on port ${port}`)
})